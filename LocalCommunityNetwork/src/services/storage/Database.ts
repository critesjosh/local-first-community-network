/**
 * Database service for SQLite operations
 */

import SQLite, {SQLiteDatabase} from 'react-native-sqlite-storage';
import {User, Connection, Event, Message} from '../../types/models';

// Enable promise-based API
SQLite.enablePromise(true);

class Database {
  private db: SQLiteDatabase | null = null;
  private readonly dbName = 'localcommunity.db';

  /**
   * Initialize database and create tables
   */
  async init(): Promise<void> {
    try {
      this.db = await SQLite.openDatabase({
        name: this.dbName,
        location: 'default',
      });

      await this.createTables();
    } catch (error) {
      console.error('Error initializing database:', error);
      throw new Error('Failed to initialize database');
    }
  }

  /**
   * Create all required tables
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const queries = [
      // User profile table
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        profile_photo TEXT,
        bio TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,

      // Connections table
      `CREATE TABLE IF NOT EXISTS connections (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        profile_photo TEXT,
        shared_secret TEXT,
        connected_at INTEGER NOT NULL,
        notes TEXT,
        trust_level TEXT NOT NULL DEFAULT 'pending'
      )`,

      // Events table
      `CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        datetime INTEGER NOT NULL,
        location TEXT,
        photo TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        encrypted_for TEXT
      )`,

      // Messages table
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        delivered INTEGER DEFAULT 0,
        read INTEGER DEFAULT 0
      )`,

      // App state table
      `CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
    ];

    for (const query of queries) {
      await this.db.executeSql(query);
    }
  }

  /**
   * Save or update user profile
   */
  async saveUser(user: User): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = `
      INSERT OR REPLACE INTO users (
        id, display_name, profile_photo, bio, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    await this.db.executeSql(query, [
      user.id,
      user.displayName,
      user.profilePhoto || null,
      user.bio || null,
      user.createdAt.getTime(),
      user.updatedAt.getTime(),
    ]);
  }

  /**
   * Get user profile
   */
  async getUser(userId: string): Promise<User | null> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'SELECT * FROM users WHERE id = ?';
    const [results] = await this.db.executeSql(query, [userId]);

    if (results.rows.length === 0) {
      return null;
    }

    const row = results.rows.item(0);
    return {
      id: row.id,
      displayName: row.display_name,
      profilePhoto: row.profile_photo,
      bio: row.bio,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Save connection
   */
  async saveConnection(connection: Connection): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = `
      INSERT OR REPLACE INTO connections (
        id, user_id, display_name, profile_photo, shared_secret,
        connected_at, notes, trust_level
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.executeSql(query, [
      connection.id,
      connection.userId,
      connection.displayName,
      connection.profilePhoto || null,
      connection.sharedSecret ? Buffer.from(connection.sharedSecret).toString('hex') : null,
      connection.connectedAt.getTime(),
      connection.notes || null,
      connection.trustLevel,
    ]);
  }

  /**
   * Get all connections
   */
  async getConnections(): Promise<Connection[]> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'SELECT * FROM connections ORDER BY connected_at DESC';
    const [results] = await this.db.executeSql(query);

    const connections: Connection[] = [];
    for (let i = 0; i < results.rows.length; i++) {
      const row = results.rows.item(i);
      connections.push({
        id: row.id,
        userId: row.user_id,
        displayName: row.display_name,
        profilePhoto: row.profile_photo,
        sharedSecret: row.shared_secret
          ? new Uint8Array(Buffer.from(row.shared_secret, 'hex'))
          : undefined,
        connectedAt: new Date(row.connected_at),
        notes: row.notes,
        trustLevel: row.trust_level as 'verified' | 'pending',
      });
    }

    return connections;
  }

  /**
   * Get app state value
   */
  async getAppState(key: string): Promise<string | null> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'SELECT value FROM app_state WHERE key = ?';
    const [results] = await this.db.executeSql(query, [key]);

    if (results.rows.length === 0) {
      return null;
    }

    return results.rows.item(0).value;
  }

  /**
   * Set app state value
   */
  async setAppState(key: string, value: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)';
    await this.db.executeSql(query, [key, value]);
  }

  /**
   * Clear all data (factory reset)
   */
  async clearAllData(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const tables = ['users', 'connections', 'events', 'messages', 'app_state'];

    for (const table of tables) {
      await this.db.executeSql(`DELETE FROM ${table}`);
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}

export default new Database();