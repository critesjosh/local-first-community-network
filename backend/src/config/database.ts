/**
 * PostgreSQL database configuration
 */

import {Pool} from 'pg';

// Create connection pool with production-ready settings
export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'local_community',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',

  // Connection pool limits
  max: parseInt(process.env.DB_POOL_MAX || '20'), // Maximum number of clients
  min: parseInt(process.env.DB_POOL_MIN || '2'), // Minimum number of clients

  // Timeouts (in milliseconds)
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 5000, // Timeout if connection takes > 5 seconds

  // Query timeout
  statement_timeout: 30000, // Cancel queries that take > 30 seconds

  // Enable keep-alive to detect broken connections
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Test database connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1);
});

export default pool;
