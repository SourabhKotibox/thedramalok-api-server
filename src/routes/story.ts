import type { FastifyPluginAsync } from 'fastify';
import {
  getAllStories,
  getStoryById,
  createStory,
  updateStory,
  deleteStory,
  updateStoryStatus,
  toggleStoryFeatured,
  toggleStoryTrending,
  getPublicStories,
  getPublicStoryById,
} from '../controllers/storyController';
import { requirePermission } from '../middlewares/rbac';

const story: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { onRequest: [requirePermission('stories', 'canView')] }, getAllStories);
  fastify.post('/', { onRequest: [requirePermission('stories', 'canCreate')] }, createStory);
  fastify.get('/:id', { onRequest: [requirePermission('stories', 'canView')] }, getStoryById);
  fastify.put('/:id', { onRequest: [requirePermission('stories', 'canEdit')] }, updateStory);
  fastify.delete('/:id', { onRequest: [requirePermission('stories', 'canDelete')] }, deleteStory);
  fastify.patch('/:id/status', { onRequest: [requirePermission('stories', 'canEdit')] }, updateStoryStatus);
  fastify.patch('/:id/featured', { onRequest: [requirePermission('stories', 'canEdit')] }, toggleStoryFeatured);
  fastify.patch('/:id/trending', { onRequest: [requirePermission('stories', 'canEdit')] }, toggleStoryTrending);

  fastify.get('/public', getPublicStories);
  fastify.get('/public/:id', getPublicStoryById);
};

export default story;
