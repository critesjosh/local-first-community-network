/**
 * Post routes
 */

import {Router} from 'express';
import {createPost, getPosts, getPostById} from '../controllers/postController.js';
import {verifySignature} from '../middleware/authMiddleware.js';
import {apiLimiter, createPostLimiter} from '../middleware/rateLimitMiddleware.js';
import {
  validatePostCreation,
  validateGetPosts,
  validateUuidParam,
} from '../middleware/validationMiddleware.js';

const router = Router();

// POST /api/posts - Create new encrypted post (requires signature)
router.post('/', createPostLimiter, validatePostCreation, verifySignature, createPost);

// GET /api/posts?since={timestamp}&limit={limit} - Get posts since timestamp
router.get('/', apiLimiter, validateGetPosts, getPosts);

// GET /api/posts/:id - Get single post by ID
router.get('/:id', apiLimiter, validateUuidParam('id'), getPostById);

export default router;
