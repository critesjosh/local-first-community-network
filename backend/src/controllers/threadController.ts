/**
 * Thread controller - handles thread reply operations
 */

import {Request, Response} from 'express';
import pool from '../config/database.js';
import {EncryptedThreadReply, ThreadReplyRow} from '../models/ThreadReply.js';

/**
 * POST /api/threads/:threadId/replies
 * Create a new encrypted reply to a thread
 */
export async function createThreadReply(req: Request, res: Response): Promise<void> {
  try {
    const {threadId} = req.params;
    const reply: EncryptedThreadReply = req.body;

    // Validate thread ID matches body
    if (reply.threadId !== threadId) {
      res.status(400).json({
        error: 'Thread ID mismatch',
        message: 'Thread ID in URL must match threadId in request body',
      });
      return;
    }

    // Verify thread (post) exists
    const threadCheck = await pool.query(
      'SELECT id FROM posts WHERE id = $1',
      [threadId]
    );

    if (threadCheck.rows.length === 0) {
      res.status(404).json({
        error: 'Thread not found',
        message: `No thread with ID ${threadId} exists`,
      });
      return;
    }

    // Insert thread reply
    const insertResult = await pool.query(
      `INSERT INTO thread_replies (id, thread_id, author_id, timestamp, encrypted_content, iv)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [
        reply.id,
        reply.threadId,
        reply.authorId,
        reply.timestamp,
        reply.encryptedContent,
        reply.iv,
      ]
    );

    console.log(`[ThreadController] Created reply ${reply.id} for thread ${threadId}`);

    res.status(201).json({
      success: true,
      replyId: insertResult.rows[0].id,
      createdAt: insertResult.rows[0].created_at,
    });
  } catch (error) {
    console.error('[ThreadController] Error creating reply:', error);

    // Handle duplicate key error
    if ((error as any).code === '23505') {
      res.status(409).json({
        error: 'Duplicate reply',
        message: 'A reply with this ID already exists',
      });
      return;
    }

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create thread reply',
    });
  }
}

/**
 * GET /api/threads/:threadId/replies
 * Fetch all replies for a thread
 */
export async function getThreadReplies(req: Request, res: Response): Promise<void> {
  try {
    const {threadId} = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

    // Validate limit
    if (limit < 1 || limit > 1000) {
      res.status(400).json({
        error: 'Invalid limit',
        message: 'Limit must be between 1 and 1000',
      });
      return;
    }

    // Fetch replies ordered by timestamp (oldest first)
    const result = await pool.query<ThreadReplyRow>(
      `SELECT id, thread_id, author_id, timestamp, encrypted_content, iv, created_at
       FROM thread_replies
       WHERE thread_id = $1
       ORDER BY timestamp ASC
       LIMIT $2`,
      [threadId, limit]
    );

    // Convert database rows to EncryptedThreadReply format
    const replies: EncryptedThreadReply[] = result.rows.map(row => ({
      id: row.id,
      threadId: row.thread_id,
      authorId: row.author_id,
      timestamp: Number(row.timestamp),
      encryptedContent: row.encrypted_content,
      iv: row.iv,
    }));

    console.log(`[ThreadController] Fetched ${replies.length} replies for thread ${threadId}`);

    res.status(200).json({
      success: true,
      threadId,
      replies,
      count: replies.length,
    });
  } catch (error) {
    console.error('[ThreadController] Error fetching replies:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch thread replies',
    });
  }
}

/**
 * GET /api/threads/:threadId/replies/count
 * Get reply count for a thread
 */
export async function getThreadReplyCount(req: Request, res: Response): Promise<void> {
  try {
    const {threadId} = req.params;

    const result = await pool.query(
      'SELECT COUNT(*) as count FROM thread_replies WHERE thread_id = $1',
      [threadId]
    );

    const count = parseInt(result.rows[0].count, 10);

    console.log(`[ThreadController] Thread ${threadId} has ${count} replies`);

    res.status(200).json({
      success: true,
      threadId,
      count,
    });
  } catch (error) {
    console.error('[ThreadController] Error counting replies:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to count thread replies',
    });
  }
}
