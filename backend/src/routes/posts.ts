/**
 * Post routes
 */

import {Router} from 'express';
import {createPost, getPosts, getPostById} from '../controllers/postController';

const router = Router();

// POST /api/posts - Create new encrypted post
router.post('/', createPost);

// GET /api/posts?since={timestamp}&limit={limit} - Get posts since timestamp
router.get('/', getPosts);

// GET /api/posts/:id - Get single post by ID
router.get('/:id', getPostById);

export default router;
