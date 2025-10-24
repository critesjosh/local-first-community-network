/**
 * Post routes
 */

import {Router} from 'express';
import {createPost, getPosts, getPostById} from '../controllers/postController';
import {verifySignature} from '../middleware/authMiddleware';

const router = Router();

// POST /api/posts - Create new encrypted post (requires signature)
router.post('/', verifySignature, createPost);

// GET /api/posts?since={timestamp}&limit={limit} - Get posts since timestamp
router.get('/', getPosts);

// GET /api/posts/:id - Get single post by ID
router.get('/:id', getPostById);

export default router;
