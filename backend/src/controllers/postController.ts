/**
 * Post Controller - handles encrypted post storage and retrieval
 */

import {Request, Response} from 'express';
import pool from '../config/database';
import {EncryptedPost, PostRow} from '../models/Post';

/**
 * Create a new encrypted post
 * POST /api/posts
 */
export const createPost = async (req: Request, res: Response): Promise<void> => {
  try {
    const post: EncryptedPost = req.body;

    // Validate required fields
    if (!post.id || !post.authorId || !post.encryptedContent || !post.iv) {
      res.status(400).json({error: 'Missing required fields'});
      return;
    }

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

    const query = `
      SELECT id, author_id, timestamp, encrypted_content, iv, wrapped_keys, created_at
      FROM posts
      WHERE timestamp > $1
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
      SELECT id, author_id, timestamp, encrypted_content, iv, wrapped_keys, created_at
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
    };

    res.json(post);
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({error: 'Failed to fetch post'});
  }
};
