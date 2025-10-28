/**
 * Database setup script
 *
 * Creates the necessary tables for the Local Community backend.
 * Run with: npm run db:setup
 */

import pool from '../config/database.js';

async function setupDatabase() {
  const client = await pool.connect();

  try {
    console.log('🔧 Setting up database...');

    // Create posts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id VARCHAR(36) PRIMARY KEY,
        author_id VARCHAR(100) NOT NULL,
        timestamp BIGINT NOT NULL,
        encrypted_content TEXT NOT NULL,
        iv VARCHAR(100) NOT NULL,
        wrapped_keys JSONB NOT NULL,
        deleted_at TIMESTAMP DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Posts table created');

    // Create thread_replies table
    await client.query(`
      CREATE TABLE IF NOT EXISTS thread_replies (
        id VARCHAR(36) PRIMARY KEY,
        thread_id VARCHAR(36) NOT NULL,
        author_id VARCHAR(100) NOT NULL,
        timestamp BIGINT NOT NULL,
        encrypted_content TEXT NOT NULL,
        iv VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (thread_id) REFERENCES posts(id)
      );
    `);

    console.log('✅ Thread replies table created');

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_timestamp
      ON posts (timestamp DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_author
      ON posts (author_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_created_at
      ON posts (created_at DESC);
    `);

    // Create index on wrapped_keys for faster recipient lookups (GIN index for JSONB)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_wrapped_keys
      ON posts USING GIN (wrapped_keys);
    `);

    // Thread replies indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_thread_replies_thread_id
      ON thread_replies (thread_id, timestamp ASC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_thread_replies_author
      ON thread_replies (author_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_thread_replies_timestamp
      ON thread_replies (timestamp DESC);
    `);

    console.log('✅ Indexes created');

    console.log('🎉 Database setup complete!');
  } catch (error) {
    console.error('❌ Error setting up database:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run setup
setupDatabase().catch(console.error);
