/**
 * Post Controller - handles encrypted post storage and retrieval
 */

import {Request, Response} from 'express';
import pool from '../config/database.js';
import {EncryptedPost, PostRow} from '../models/Post.js';

// Extend Request to include authenticated user data
interface AuthenticatedRequest extends Request {
  authorId?: string;
  timestamp?: number;
}

/**
 * Create a new encrypted post
 * POST /api/posts
 */
export const createPost = async (req: Request, res: Response): Promise<void> => {
  try {
    const post: EncryptedPost = req.body;

    // Validation is now handled by middleware
    // Insert into database
    const query = `
      INSERT INTO posts (id, author_id, timestamp, encrypted_content, iv, wrapped_keys)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, created_at
    `;

    const values = [
      post.id,
      post.authorId,
      post.timestamp,
      post.encryptedContent,
      post.iv,
      JSON.stringify(post.wrappedKeys),
    ];

    const result = await pool.query(query, values);

    console.log(`📮 Post created: ${post.id} by ${post.authorId}`);

    res.status(201).json({
      success: true,
      postId: result.rows[0].id,
      createdAt: result.rows[0].created_at,
    });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({error: 'Failed to create post'});
  }
};

/**
 * Get encrypted posts since a timestamp
 * GET /api/posts?since={timestamp}&limit={limit}
 */
export const getPosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const since = parseInt(req.query.since as string) || 0;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const includeDeleted = req.query.includeDeleted === 'true';

    // Include deleted posts for threads, but filter them by default
    const query = `
      SELECT id, author_id, timestamp, encrypted_content, iv, wrapped_keys, deleted_at, created_at
      FROM posts
      WHERE timestamp > $1 ${!includeDeleted ? 'AND deleted_at IS NULL' : ''}
      ORDER BY timestamp DESC
      LIMIT $2
    `;

    const result = await pool.query<PostRow>(query, [since, limit]);

    // Convert database rows to EncryptedPost format
    const posts: EncryptedPost[] = result.rows.map(row => ({
      id: row.id,
      authorId: row.author_id,
      timestamp: Number(row.timestamp),
      encryptedContent: row.encrypted_content,
      iv: row.iv,
      wrappedKeys: row.wrapped_keys, // Already parsed by pg JSONB
      deletedAt: row.deleted_at ? row.deleted_at.getTime() : undefined,
    }));

    console.log(`📥 Fetched ${posts.length} posts since ${new Date(since).toISOString()}`);

    res.json({
      posts,
      count: posts.length,
      since,
    });
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({error: 'Failed to fetch posts'});
  }
};

/**
 * Get a single post by ID
 * GET /api/posts/:id
 */
export const getPostById = async (req: Request, res: Response): Promise<void> => {
  try {
    const {id} = req.params;

    const query = `
      SELECT id, author_id, timestamp, encrypted_content, iv, wrapped_keys, deleted_at, created_at
      FROM posts
      WHERE id = $1
    `;

    const result = await pool.query<PostRow>(query, [id]);

    if (result.rows.length === 0) {
      res.status(404).json({error: 'Post not found'});
      return;
    }

    const row = result.rows[0];
    const post: EncryptedPost = {
      id: row.id,
      authorId: row.author_id,
      timestamp: Number(row.timestamp),
      encryptedContent: row.encrypted_content,
      iv: row.iv,
      wrappedKeys: row.wrapped_keys, // Already parsed by pg JSONB
      deletedAt: row.deleted_at ? row.deleted_at.getTime() : undefined,
    };

    res.json(post);
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({error: 'Failed to fetch post'});
  }
};

/**
 * Soft delete a post (mark as deleted, keep for threads)
 * DELETE /api/posts/:id
 */
export const deletePost = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {id} = req.params;

    // Verify post exists
    const checkQuery = 'SELECT id, author_id, deleted_at FROM posts WHERE id = $1';
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      res.status(404).json({error: 'Post not found'});
      return;
    }

    const post = checkResult.rows[0];

    // Check if already deleted
    if (post.deleted_at) {
      res.status(410).json({error: 'Post already deleted'});
      return;
    }

    // Authorization: verify the authenticated user is the post author
    if (!req.authorId || req.authorId !== post.author_id) {
      res.status(403).json({error: 'Forbidden: You can only delete your own posts'});
      return;
    }

    // Soft delete: set deleted_at timestamp
    const deleteQuery = `
      UPDATE posts
      SET deleted_at = NOW()
      WHERE id = $1
      RETURNING id, deleted_at
    `;

    const result = await pool.query(deleteQuery, [id]);

    console.log(`🗑️  Post soft-deleted: ${id}`);

    res.json({
      success: true,
      postId: result.rows[0].id,
      deletedAt: result.rows[0].deleted_at,
      message: 'Post deleted successfully. Replies are preserved.'
    });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({error: 'Failed to delete post'});
  }
};
