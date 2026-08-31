import type { FastifyRequest, FastifyReply } from 'fastify';
import { StoryModel } from '../models/Story';
import { SectionModel } from '../models/Section';
import { logger } from '../lib/logger';

const syncSections = async (contentIdStr: string, sections: string[] | undefined) => {
  await SectionModel.updateMany(
    { manualContentIds: contentIdStr },
    { $pull: { manualContentIds: contentIdStr } }
  );
  if (sections && Array.isArray(sections) && sections.length > 0) {
    await SectionModel.updateMany(
      { _id: { $in: sections } },
      { $addToSet: { manualContentIds: contentIdStr } }
    );
  }
};

export const getAllStories = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const query = request.query as {
      page?: string;
      limit?: string;
      search?: string;
      status?: string;
      genre?: string;
      language?: string;
      featured?: string;
      trending?: string;
      author?: string;
      category?: string;
    };

    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
    const skip = (page - 1) * limit;

    const filter: any = {};

    if (query.status) filter.status = query.status;
    if (query.featured === 'true') filter.featured = true;
    if (query.trending === 'true') filter.trending = true;
    if (query.genre) filter.genres = query.genre;
    if (query.language) filter.languages = query.language;
    if (query.category) filter.category = query.category;
    if (query.author) filter.author = new RegExp(query.author, 'i');

    if (query.search) {
      filter.$or = [
        { title: new RegExp(query.search, 'i') },
        { description: new RegExp(query.search, 'i') },
        { author: new RegExp(query.search, 'i') },
        { narrator: new RegExp(query.search, 'i') },
        { tags: new RegExp(query.search, 'i') },
      ];
    }

    const [stories, total] = await Promise.all([
      StoryModel.find(filter)
        .populate('genres', 'name image')
        .populate('categories', 'name thumbnail')
        .populate('languages', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      StoryModel.countDocuments(filter),
    ]);

    const storiesWithId = stories.map((story) => ({
      ...story,
      id: story._id?.toString(),
    }));

    return reply.send({
      success: true,
      data: storiesWithId,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    logger.error({ error }, 'Error getting all stories');
    return reply.status(500).send({ success: false, error: error.message });
  }
};

export const getStoryById = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };

    const story = await StoryModel.findById(id)
      .populate('genres', 'name image')
      .populate('categories', 'name thumbnail')
      .populate('languages', 'name')
      .lean();

    if (!story) {
      return reply.status(404).send({ success: false, error: 'Story not found' });
    }

    return reply.send({
      success: true,
      data: {
        ...story,
        id: story._id?.toString(),
      },
    });
  } catch (error: any) {
    logger.error({ error }, 'Error getting story by ID');
    return reply.status(500).send({ success: false, error: error.message });
  }
};

export const createStory = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const body = request.body as any;

    const story = await StoryModel.create(body);
    await syncSections(story._id.toString(), body.sections);

    try {
      const { NotificationModel } = await import('../models/Notification');
      await NotificationModel.create({
        title: 'New Story Added! 🎧',
        body: `Listen to ${story.title} now on the app!`,
        type: 'content_release',
        targetAudience: 'all',
        contentId: story._id,
        status: 'sent',
        metrics: { targetCount: 0, sentCount: 1, openedCount: 0, clickedCount: 0 },
        sentAt: new Date(),
        priority: 'high'
      });
    } catch (notifErr) {
      logger.error({ notifErr }, 'Error sending new story notification');
    }

    return reply.status(201).send({
      success: true,
      data: {
        ...story.toObject(),
        id: story._id?.toString(),
      },
    });
  } catch (error: any) {
    logger.error({ error }, 'Error creating story');
    return reply.status(500).send({ success: false, error: error.message });
  }
};

export const updateStory = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const body = request.body as any;

    const existingStory = await StoryModel.findById(id).lean();
    if (!existingStory) {
      return reply.status(404).send({ success: false, error: 'Story not found' });
    }

    const story = await StoryModel.findByIdAndUpdate(
      id,
      { $set: body },
      { returnDocument: 'after', runValidators: true }
    );

    if (!story) {
      return reply.status(404).send({ success: false, error: 'Story not found' });
    }

    if (body.sections !== undefined) {
      await syncSections(id, body.sections);
    }

    const updatedStory = await StoryModel.findById(id)
      .populate('genres', 'name image')
      .populate('categories', 'name thumbnail')
      .populate('languages', 'name')
      .lean();

    return reply.send({
      success: true,
      data: {
        ...updatedStory,
        id: updatedStory?._id?.toString(),
      },
    });
  } catch (error: any) {
    logger.error({ error }, 'Error updating story');
    return reply.status(500).send({ success: false, error: error.message });
  }
};

export const deleteStory = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };

    const story = await StoryModel.findByIdAndDelete(id);
    if (!story) {
      return reply.status(404).send({ success: false, error: 'Story not found' });
    }

    return reply.send({ success: true, data: { id } });
  } catch (error: any) {
    logger.error({ error }, 'Error deleting story');
    return reply.status(500).send({ success: false, error: error.message });
  }
};

export const updateStoryStatus = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const { status, rejectionReason } = request.body as { status: string; rejectionReason?: string };

    const updateData: any = { status };
    if (status === 'rejected' && rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    }

    const story = await StoryModel.findByIdAndUpdate(id, updateData, { returnDocument: 'after' });
    if (!story) {
      return reply.status(404).send({ success: false, error: 'Story not found' });
    }

    return reply.send({ success: true, data: story });
  } catch (error: any) {
    logger.error({ error }, 'Error updating story status');
    return reply.status(500).send({ success: false, error: error.message });
  }
};

export const toggleStoryFeatured = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };

    const story = await StoryModel.findById(id).lean();
    if (!story) {
      return reply.status(404).send({ success: false, error: 'Story not found' });
    }

    const updated = await StoryModel.findByIdAndUpdate(
      id,
      { featured: !story.featured },
      { returnDocument: 'after' }
    );

    return reply.send({ success: true, data: updated });
  } catch (error: any) {
    logger.error({ error }, 'Error toggling story featured');
    return reply.status(500).send({ success: false, error: error.message });
  }
};

export const toggleStoryTrending = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };

    const story = await StoryModel.findById(id).lean();
    if (!story) {
      return reply.status(404).send({ success: false, error: 'Story not found' });
    }

    const updated = await StoryModel.findByIdAndUpdate(
      id,
      { trending: !story.trending },
      { returnDocument: 'after' }
    );

    return reply.send({ success: true, data: updated });
  } catch (error: any) {
    logger.error({ error }, 'Error toggling story trending');
    return reply.status(500).send({ success: false, error: error.message });
  }
};

export const getPublicStories = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const query = request.query as {
      page?: string;
      limit?: string;
      search?: string;
      plan?: string;
      featured?: string;
      trending?: string;
      category?: string;
    };

    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
    const skip = (page - 1) * limit;

    const filter: any = { status: 'published' };

    if (query.plan) filter.planRequired = query.plan;
    if (query.featured === 'yes') filter.featured = true;
    if (query.featured === 'no') filter.featured = false;
    if (query.trending === 'yes') filter.trending = true;
    if (query.trending === 'no') filter.trending = false;
    if (query.category) filter.category = query.category;

    if (query.search) {
      filter.$or = [
        { title: new RegExp(query.search, 'i') },
        { description: new RegExp(query.search, 'i') },
        { author: new RegExp(query.search, 'i') },
        { narrator: new RegExp(query.search, 'i') },
        { tags: new RegExp(query.search, 'i') },
      ];
    }

    const [stories, total] = await Promise.all([
      StoryModel.find(filter)
        .populate('genres', 'name')
        .populate('languages', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      StoryModel.countDocuments(filter),
    ]);

    const storiesWithId = stories.map((story) => ({
      ...story,
      id: story._id?.toString(),
    }));

    return reply.send({
      success: true,
      data: storiesWithId,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    logger.error({ error }, 'Error getting public stories');
    return reply.status(500).send({ success: false, error: error.message });
  }
};

export const getPublicStoryById = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };

    const story = await StoryModel.findOne({ _id: id, status: 'published' })
      .populate('genres', 'name')
      .populate('languages', 'name')
      .populate('categories', 'name')
      .lean();

    if (!story) {
      return reply.status(404).send({ success: false, error: 'Story not found' });
    }

    return reply.send({
      success: true,
      data: {
        ...story,
        id: story._id?.toString(),
      },
    });
  } catch (error: any) {
    logger.error({ error }, 'Error getting public story');
    return reply.status(500).send({ success: false, error: error.message });
  }
};
