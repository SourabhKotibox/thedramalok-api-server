import type { FastifyRequest, FastifyReply } from 'fastify';
import mongoose from 'mongoose';
import { StoryModel } from '../models/Story';
import { SectionModel } from '../models/Section';
import { logger } from '../lib/logger';

const STORY_STATUSES = ['published', 'draft', 'processing', 'moderation', 'rejected'];

// Manual order first (ascending), then newest first. Stories without a sortOrder sort first,
// so the legacy newest-first order is unchanged until an admin reorders stories.
const STORY_SORT = { sortOrder: 1, createdAt: -1 } as const;

// Fields clients must never overwrite through create/update payloads.
const PROTECTED_FIELDS = ['_id', 'id', '__v', 'createdAt', 'updatedAt', 'views', 'likes', 'shares', 'createdBy', 'approvedBy', 'approvedAt', 'rejectedBy', 'rejectedAt'];

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const safeRegex = (value: string) => new RegExp(escapeRegex(String(value).slice(0, 100)), 'i');
const isValidId = (id: unknown): id is string => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);

const sanitizeStoryBody = (body: any) => {
  const clean: any = { ...(body || {}) };
  for (const key of PROTECTED_FIELDS) delete clean[key];
  if (clean.title !== undefined) clean.title = String(clean.title).trim();
  if (clean.duration === '' || clean.duration === null) delete clean.duration;
  if (clean.sortOrder === '' || clean.sortOrder === null) delete clean.sortOrder;
  return clean;
};

const sendNewStoryNotification = async (story: { _id: any; title: string }) => {
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
};

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
      plan?: string;
    };

    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
    const skip = (page - 1) * limit;

    const filter: any = {};

    if (query.status && STORY_STATUSES.includes(query.status)) filter.status = query.status;
    if (query.featured === 'true') filter.featured = true;
    if (query.trending === 'true') filter.trending = true;
    if (query.plan && ['free', 'basic', 'standard', 'premium'].includes(query.plan)) filter.planRequired = query.plan;
    if (query.genre && isValidId(query.genre)) filter.genres = query.genre;
    if (query.language && isValidId(query.language)) filter.languages = query.language;
    if (query.category) filter.category = query.category;
    if (query.author) filter.author = safeRegex(query.author);

    if (query.search) {
      const rx = safeRegex(query.search);
      filter.$or = [
        { title: rx },
        { description: rx },
        { author: rx },
        { narrator: rx },
        { tags: rx },
      ];
    }

    const [stories, total] = await Promise.all([
      StoryModel.find(filter)
        .populate('genres', 'name image')
        .populate('categories', 'name thumbnail')
        .populate('languages', 'name')
        .sort(STORY_SORT)
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
    if (!isValidId(id)) {
      return reply.status(404).send({ success: false, error: 'Story not found' });
    }

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
    const data = sanitizeStoryBody(body);

    if (!data.title) {
      return reply.status(400).send({ success: false, error: 'Title is required' });
    }
    if (!data.audioUrl && !data.audioFile) {
      return reply.status(400).send({ success: false, error: 'Audio is required' });
    }
    // Keep audioUrl (required by the schema and used by clients) populated when only a file path was given.
    if (!data.audioUrl) data.audioUrl = data.audioFile;

    const story = await StoryModel.create(data);
    await syncSections(story._id.toString(), body?.sections);

    // Only announce stories that are actually visible to users.
    if (story.status === 'published') {
      await sendNewStoryNotification(story);
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
    if (!isValidId(id)) {
      return reply.status(404).send({ success: false, error: 'Story not found' });
    }
    const data = sanitizeStoryBody(body);
    if (data.title !== undefined && !data.title) {
      return reply.status(400).send({ success: false, error: 'Title cannot be empty' });
    }

    const existingStory = await StoryModel.findById(id).lean();
    if (!existingStory) {
      return reply.status(404).send({ success: false, error: 'Story not found' });
    }

    const story = await StoryModel.findByIdAndUpdate(
      id,
      { $set: data },
      { returnDocument: 'after', runValidators: true }
    );

    if (!story) {
      return reply.status(404).send({ success: false, error: 'Story not found' });
    }

    if (body?.sections !== undefined) {
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
    if (!isValidId(id)) {
      return reply.status(404).send({ success: false, error: 'Story not found' });
    }

    const story = await StoryModel.findByIdAndDelete(id);
    if (story) {
      await SectionModel.updateMany(
        { manualContentIds: id },
        { $pull: { manualContentIds: id } }
      ).catch((err) => logger.error({ err }, 'Error removing deleted story from sections'));
    }
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
    const { status, rejectionReason } = (request.body || {}) as { status: string; rejectionReason?: string };
    if (!isValidId(id)) {
      return reply.status(404).send({ success: false, error: 'Story not found' });
    }
    if (!STORY_STATUSES.includes(status)) {
      return reply.status(400).send({ success: false, error: `Invalid status. Allowed: ${STORY_STATUSES.join(', ')}` });
    }

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
    if (!isValidId(id)) {
      return reply.status(404).send({ success: false, error: 'Story not found' });
    }

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
    if (!isValidId(id)) {
      return reply.status(404).send({ success: false, error: 'Story not found' });
    }

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

// PATCH /stories/reorder  body: { ids: string[] }  (ids in the desired display order)
export const reorderStories = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { ids } = (request.body || {}) as { ids?: unknown };
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || !ids.every(isValidId)) {
      return reply.status(400).send({ success: false, error: 'ids must be a non-empty array of story IDs' });
    }

    const uniqueIds = Array.from(new Set(ids as string[]));
    await StoryModel.bulkWrite(
      uniqueIds.map((storyId, index) => ({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(storyId) },
          update: { $set: { sortOrder: index + 1 } },
        },
      }))
    );

    return reply.send({ success: true, data: { ids: uniqueIds } });
  } catch (error: any) {
    logger.error({ error }, 'Error reordering stories');
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
      const rx = safeRegex(query.search);
      filter.$or = [
        { title: rx },
        { description: rx },
        { author: rx },
        { narrator: rx },
        { tags: rx },
      ];
    }

    const [stories, total] = await Promise.all([
      StoryModel.find(filter)
        .populate('genres', 'name')
        .populate('languages', 'name')
        .sort(STORY_SORT)
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
    if (!isValidId(id)) {
      return reply.status(404).send({ success: false, error: 'Story not found' });
    }

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
