/**
 * Thread routes
 */

import {Router} from 'express';
import {
  createThreadReply,
  getThreadReplies,
  getThreadReplyCount,
} from '../controllers/threadController.js';
import {verifySignature} from '../middleware/authMiddleware.js';
import {apiLimiter, createPostLimiter} from '../middleware/rateLimitMiddleware.js';
import {validateUuidParam} from '../middleware/validationMiddleware.js';

const router = Router();

// POST /api/threads/:threadId/replies - Create new encrypted reply (requires signature)
router.post(
  '/:threadId/replies',
  createPostLimiter,
  validateUuidParam('threadId'),
  verifySignature,
  createThreadReply
);

// GET /api/threads/:threadId/replies - Get all replies for a thread
router.get(
  '/:threadId/replies',
  apiLimiter,
  validateUuidParam('threadId'),
  getThreadReplies
);

// GET /api/threads/:threadId/replies/count - Get reply count
router.get(
  '/:threadId/replies/count',
  apiLimiter,
  validateUuidParam('threadId'),
  getThreadReplyCount
);

export default router;
