/**
 * Database service for SQLite operations (Expo SQLite)
 */

import * as SQLite from 'expo-sqlite';
import {User, Connection, Event, Message, EncryptedThreadReply} from '../../types/models';
import {EncryptedEvent} from '../crypto/EncryptionService';

class Database {
  private db: SQLite.SQLiteDatabase | null = null;
  private readonly dbName = 'localcommunity.db';

  /**
   * Initialize database and create tables
   */
  async init(): Promise<void> {
    try {
      this.db = await SQLite.openDatabaseAsync(this.dbName);
      await this.createTables();
      await this.runMigrations();
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

    try {
      // Execute all table creation statements in a transaction
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          profile_photo TEXT,
          bio TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS connections (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          display_name TEXT NOT NULL,
          profile_photo TEXT,
          shared_secret TEXT,
          connected_at INTEGER NOT NULL,
          notes TEXT,
          status TEXT NOT NULL DEFAULT 'pending-sent',
          trust_level TEXT NOT NULL DEFAULT 'pending'
        );

        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          author_id TEXT NOT NULL,
          title TEXT,
          description TEXT,
          datetime INTEGER NOT NULL,
          location TEXT,
          photo TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          encrypted_content TEXT,
          content_iv TEXT,
          wrapped_keys TEXT,
          encrypted_for TEXT,
          deleted_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          sender_id TEXT NOT NULL,
          recipient_id TEXT NOT NULL,
          content TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          delivered INTEGER DEFAULT 0,
          read INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS thread_replies (
          id TEXT PRIMARY KEY,
          thread_id TEXT NOT NULL,
          author_id TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          encrypted_content TEXT NOT NULL,
          iv TEXT NOT NULL,
          FOREIGN KEY (thread_id) REFERENCES events(id)
        );

        CREATE INDEX IF NOT EXISTS idx_thread_replies_thread_id
          ON thread_replies(thread_id);

        CREATE TABLE IF NOT EXISTS app_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    } catch (error) {
      console.error('Error creating database tables:', error);
      throw new Error(`Failed to create database tables: ${error}`);
    }
  }

  /**
   * Run database migrations to update existing tables
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Migration 1: Add status column to connections table if it doesn't exist
      await this.db.execAsync(`
        -- Check if status column exists, if not add it
        ALTER TABLE connections ADD COLUMN status TEXT NOT NULL DEFAULT 'pending-sent';
      `).catch(() => {
        // Column already exists, ignore error
        console.log('[Database] status column already exists');
      });

      // Migration 2: Add trust_level column to connections table if it doesn't exist
      await this.db.execAsync(`
        ALTER TABLE connections ADD COLUMN trust_level TEXT NOT NULL DEFAULT 'pending';
      `).catch(() => {
        // Column already exists, ignore error
        console.log('[Database] trust_level column already exists');
      });

      // Migration 3: Drop threads table (no longer needed)
      await this.db.execAsync(`
        DROP TABLE IF EXISTS threads;
      `).catch((error) => {
        console.log('[Database] Error dropping threads table (may not exist):', error);
      });

      // Migration 4: Remove wrapped_thread_keys column (we reuse event keys for replies)
      // Note: SQLite doesn't support DROP COLUMN easily, so we just ignore if it exists
      // New installs won't have the column, existing ones will have unused column (harmless)
      console.log('[Database] Note: wrapped_thread_keys column (if exists) is no longer used - event keys are reused for replies');

      // Migration 5: Add deleted_at column to events table for soft delete
      await this.db.execAsync(`
        ALTER TABLE events ADD COLUMN deleted_at INTEGER;
      `).catch(() => {
        // Column already exists, ignore error
        console.log('[Database] deleted_at column already exists');
      });

      console.log('[Database] Migrations completed successfully');
    } catch (error) {
      console.error('Error running database migrations:', error);
      // Don't throw - migrations are best-effort
    }
  }

  /**
   * Save or update user profile
   */
  async saveUser(user: User): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    console.log('[Database] Saving user:', user.id, user.displayName);

    const query = `
      INSERT OR REPLACE INTO users (
        id, display_name, profile_photo, bio, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    try {
      await this.db.runAsync(query, [
        user.id,
        user.displayName,
        user.profilePhoto || null,
        user.bio || null,
        user.createdAt.getTime(),
        user.updatedAt.getTime(),
      ]);
      console.log('[Database] User saved successfully');
    } catch (error) {
      console.error('[Database] Error saving user:', error);
      throw error;
    }
  }

  /**
   * Get user profile
   */
  async getUser(userId: string): Promise<User | null> {
    if (!this.db) throw new Error('Database not initialized');

    console.log('[Database] Getting user with ID:', userId);
    const query = 'SELECT * FROM users WHERE id = ?';
    
    try {
      const row = await this.db.getFirstAsync<any>(query, [userId]);

      if (!row) {
        console.log('[Database] No user found with ID:', userId);
        return null;
      }

      console.log('[Database] User found:', row.display_name);
      return {
        id: row.id,
        displayName: row.display_name,
        profilePhoto: row.profile_photo,
        bio: row.bio,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      };
    } catch (error) {
      console.error('[Database] Error getting user:', error);
      throw error;
    }
  }

  /**
   * Save connection
   */
  async saveConnection(connection: Connection): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = `
      INSERT OR REPLACE INTO connections (
        id, user_id, display_name, profile_photo, shared_secret,
        connected_at, notes, status, trust_level
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.runAsync(query, [
      connection.id,
      connection.userId,
      connection.displayName,
      connection.profilePhoto || null,
      connection.sharedSecret ? Buffer.from(connection.sharedSecret).toString('hex') : null,
      connection.connectedAt.getTime(),
      connection.notes || null,
      connection.status,
      connection.trustLevel,
    ]);
  }

  /**
   * Get all connections
   */
  async getConnections(): Promise<Connection[]> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'SELECT * FROM connections ORDER BY connected_at DESC';
    const rows = await this.db.getAllAsync<any>(query);

    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      displayName: row.display_name,
      profilePhoto: row.profile_photo,
      sharedSecret: row.shared_secret
        ? new Uint8Array(Buffer.from(row.shared_secret, 'hex'))
        : undefined,
      connectedAt: new Date(row.connected_at),
      notes: row.notes,
      status: (row.status || 'pending-sent') as 'mutual' | 'pending-sent' | 'pending-received',
      trustLevel: row.trust_level as 'verified' | 'pending',
    }));
  }

  /**
   * Get connection by ID
   */
  async getConnection(connectionId: string): Promise<Connection | null> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'SELECT * FROM connections WHERE id = ?';
    const row = await this.db.getFirstAsync<any>(query, [connectionId]);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      userId: row.user_id,
      displayName: row.display_name,
      profilePhoto: row.profile_photo,
      sharedSecret: row.shared_secret
        ? new Uint8Array(Buffer.from(row.shared_secret, 'hex'))
        : undefined,
      connectedAt: new Date(row.connected_at),
      notes: row.notes,
      status: (row.status || 'pending-sent') as 'mutual' | 'pending-sent' | 'pending-received',
      trustLevel: row.trust_level as 'verified' | 'pending',
    };
  }

  /**
   * Delete connection
   */
  async deleteConnection(connectionId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'DELETE FROM connections WHERE id = ?';
    await this.db.runAsync(query, [connectionId]);
  }

  /**
   * Update connection trust level
   */
  async updateConnectionTrustLevel(
    connectionId: string,
    trustLevel: 'verified' | 'pending',
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'UPDATE connections SET trust_level = ? WHERE id = ?';
    await this.db.runAsync(query, [trustLevel, connectionId]);
  }

  /**
   * Update connection status
   */
  async updateConnectionStatus(
    connectionId: string,
    status: 'mutual' | 'pending-sent' | 'pending-received',
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'UPDATE connections SET status = ? WHERE id = ?';
    await this.db.runAsync(query, [status, connectionId]);
  }

  /**
   * Get connection by user ID
   */
  async getConnectionByUserId(userId: string): Promise<Connection | null> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'SELECT * FROM connections WHERE user_id = ?';
    const row = await this.db.getFirstAsync<any>(query, [userId]);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      userId: row.user_id,
      displayName: row.display_name,
      profilePhoto: row.profile_photo,
      sharedSecret: row.shared_secret
        ? new Uint8Array(Buffer.from(row.shared_secret, 'hex'))
        : undefined,
      connectedAt: new Date(row.connected_at),
      notes: row.notes,
      status: (row.status || 'pending-sent') as 'mutual' | 'pending-sent' | 'pending-received',
      trustLevel: row.trust_level as 'verified' | 'pending',
    };
  }

  /**
   * Get pending received connections (connection requests)
   */
  async getPendingReceivedConnections(): Promise<Connection[]> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'SELECT * FROM connections WHERE status = ? ORDER BY connected_at DESC';
    const rows = await this.db.getAllAsync<any>(query, ['pending-received']);

    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      displayName: row.display_name,
      profilePhoto: row.profile_photo,
      sharedSecret: row.shared_secret
        ? new Uint8Array(Buffer.from(row.shared_secret, 'hex'))
        : undefined,
      connectedAt: new Date(row.connected_at),
      notes: row.notes,
      status: 'pending-received' as const,
      trustLevel: row.trust_level as 'verified' | 'pending',
    }));
  }

  /**
   * Get auto-accept connections setting
   */
  async getAutoAcceptConnections(): Promise<boolean> {
    const value = await this.getAppState('auto_accept_connections');
    return value === 'true' || value === null; // default to true
  }

  /**
   * Set auto-accept connections setting
   */
  async setAutoAcceptConnections(enabled: boolean): Promise<void> {
    await this.setAppState('auto_accept_connections', enabled ? 'true' : 'false');
  }

  /**
   * Save event
   */
  async saveEvent(event: Event): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = `
      INSERT OR REPLACE INTO events (
        id, author_id, title, description, datetime, location,
        photo, created_at, updated_at, encrypted_for
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.runAsync(query, [
      event.id,
      event.authorId,
      event.title,
      event.description || null,
      event.datetime.getTime(),
      event.location || null,
      event.photo || null,
      event.createdAt.getTime(),
      event.updatedAt.getTime(),
      JSON.stringify((event as any).encryptedFor || []),
    ]);
  }

  /**
   * Get all events
   */
  async getEvents(limit: number = 100, offset: number = 0): Promise<Event[]> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'SELECT * FROM events ORDER BY datetime DESC LIMIT ? OFFSET ?';
    const rows = await this.db.getAllAsync<any>(query, [limit, offset]);

    return rows.map(row => ({
      id: row.id,
      authorId: row.author_id,
      title: row.title,
      description: row.description,
      datetime: new Date(row.datetime),
      location: row.location,
      photo: row.photo,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      encryptedFor: JSON.parse(row.encrypted_for || '[]'),
    } as any));
  }

  /**
   * Get event by ID
   */
  async getEvent(eventId: string): Promise<Event | null> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'SELECT * FROM events WHERE id = ?';
    const row = await this.db.getFirstAsync<any>(query, [eventId]);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      authorId: row.author_id,
      title: row.title,
      description: row.description,
      datetime: new Date(row.datetime),
      location: row.location,
      photo: row.photo,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      encryptedFor: JSON.parse(row.encrypted_for || '[]'),
    } as any;
  }

  /**
   * Get events by connection (events visible to specific connection)
   */
  async getEventsByConnection(connectionId: string): Promise<Event[]> {
    if (!this.db) throw new Error('Database not initialized');

    const query = `
      SELECT * FROM events
      WHERE encrypted_for LIKE ?
      ORDER BY datetime DESC
    `;

    // SQLite LIKE pattern to find connection ID in JSON array
    const pattern = `%"${connectionId}"%`;
    const rows = await this.db.getAllAsync<any>(query, [pattern]);

    return rows.map(row => ({
      id: row.id,
      authorId: row.author_id,
      title: row.title,
      description: row.description,
      datetime: new Date(row.datetime),
      location: row.location,
      photo: row.photo,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      encryptedFor: JSON.parse(row.encrypted_for || '[]'),
    } as any));
  }

  /**
   * Delete event (hard delete - use sparingly)
   */
  async deleteEvent(eventId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'DELETE FROM events WHERE id = ?';
    await this.db.runAsync(query, [eventId]);
  }

  /**
   * Soft delete event (mark as deleted, preserve for threads)
   */
  async softDeleteEvent(eventId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'UPDATE events SET deleted_at = ? WHERE id = ?';
    await this.db.runAsync(query, [Date.now(), eventId]);
  }

  /**
   * Save encrypted event (hybrid encryption)
   */
  async saveEncryptedEvent(encryptedEvent: EncryptedEvent): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = `
      INSERT OR REPLACE INTO events (
        id, author_id, title, description, datetime, location,
        photo, created_at, updated_at, encrypted_content, content_iv, wrapped_keys, deleted_at
      ) VALUES (?, ?, NULL, NULL, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.runAsync(query, [
      encryptedEvent.id,
      encryptedEvent.authorId,
      encryptedEvent.timestamp,
      encryptedEvent.timestamp,
      encryptedEvent.timestamp,
      encryptedEvent.encryptedContent,
      encryptedEvent.iv,
      JSON.stringify(encryptedEvent.wrappedKeys),
      encryptedEvent.deletedAt || null,
    ]);
  }

  /**
   * Get all encrypted events
   */
  async getEncryptedEvents(
    limit: number = 100,
    offset: number = 0,
  ): Promise<EncryptedEvent[]> {
    if (!this.db) throw new Error('Database not initialized');

    const query = `
      SELECT * FROM events
      WHERE encrypted_content IS NOT NULL AND deleted_at IS NULL
      ORDER BY datetime DESC
      LIMIT ? OFFSET ?
    `;
    const rows = await this.db.getAllAsync<any>(query, [limit, offset]);

    return rows.map(row => ({
      id: row.id,
      authorId: row.author_id,
      timestamp: row.created_at,
      encryptedContent: row.encrypted_content,
      iv: row.content_iv,
      wrappedKeys: JSON.parse(row.wrapped_keys || '{}'),
      deletedAt: row.deleted_at || undefined,
    }));
  }

  /**
   * Get encrypted event by ID
   */
  async getEncryptedEvent(eventId: string): Promise<EncryptedEvent | null> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'SELECT * FROM events WHERE id = ? AND encrypted_content IS NOT NULL';
    const row = await this.db.getFirstAsync<any>(query, [eventId]);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      authorId: row.author_id,
      timestamp: row.created_at,
      encryptedContent: row.encrypted_content,
      iv: row.content_iv,
      wrappedKeys: JSON.parse(row.wrapped_keys || '{}'),
      deletedAt: row.deleted_at || undefined,
    };
  }

  /**
   * Save message
   */
  async saveMessage(message: Message): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = `
      INSERT OR REPLACE INTO messages (
        id, conversation_id, sender_id, recipient_id,
        content, timestamp, delivered, read
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.runAsync(query, [
      message.id,
      message.conversationId,
      message.senderId,
      message.recipientId,
      message.content,
      message.timestamp.getTime(),
      message.delivered ? 1 : 0,
      message.read ? 1 : 0,
    ]);
  }

  /**
   * Get messages for a conversation
   */
  async getMessages(
    conversationId: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<Message[]> {
    if (!this.db) throw new Error('Database not initialized');

    const query = `
      SELECT * FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp ASC
      LIMIT ? OFFSET ?
    `;
    const rows = await this.db.getAllAsync<any>(query, [conversationId, limit, offset]);

    return rows.map(row => ({
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      recipientId: row.recipient_id,
      content: row.content,
      timestamp: new Date(row.timestamp),
      delivered: row.delivered === 1,
      read: row.read === 1,
    }));
  }

  /**
   * Mark message as delivered
   */
  async markMessageAsDelivered(messageId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'UPDATE messages SET delivered = 1 WHERE id = ?';
    await this.db.runAsync(query, [messageId]);
  }

  /**
   * Mark message as read
   */
  async markMessageAsRead(messageId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'UPDATE messages SET read = 1 WHERE id = ?';
    await this.db.runAsync(query, [messageId]);
  }

  /**
   * Mark all messages in conversation as read
   */
  async markConversationAsRead(conversationId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'UPDATE messages SET read = 1 WHERE conversation_id = ?';
    await this.db.runAsync(query, [conversationId]);
  }

  /**
   * Get unread message count for conversation
   */
  async getUnreadCount(conversationId: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const query = `
      SELECT COUNT(*) as count FROM messages
      WHERE conversation_id = ? AND read = 0
    `;
    const row = await this.db.getFirstAsync<any>(query, [conversationId]);

    return row?.count || 0;
  }

  /**
   * Delete message
   */
  async deleteMessage(messageId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'DELETE FROM messages WHERE id = ?';
    await this.db.runAsync(query, [messageId]);
  }

  /**
   * Get app state value
   */
  async getAppState(key: string): Promise<string | null> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'SELECT value FROM app_state WHERE key = ?';
    const row = await this.db.getFirstAsync<any>(query, [key]);

    return row?.value || null;
  }

  /**
   * Set app state value
   */
  async setAppState(key: string, value: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)';
    await this.db.runAsync(query, [key, value]);
  }

  /**
   * Save encrypted thread reply
   */
  async saveEncryptedThreadReply(reply: EncryptedThreadReply): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = `
      INSERT OR REPLACE INTO thread_replies (
        id, thread_id, author_id, timestamp, encrypted_content, iv
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    await this.db.runAsync(query, [
      reply.id,
      reply.threadId,
      reply.authorId,
      reply.timestamp,
      reply.encryptedContent,
      reply.iv,
    ]);
  }

  /**
   * Get all encrypted replies for a thread
   */
  async getEncryptedThreadReplies(threadId: string): Promise<EncryptedThreadReply[]> {
    if (!this.db) throw new Error('Database not initialized');

    const query = `
      SELECT * FROM thread_replies
      WHERE thread_id = ?
      ORDER BY timestamp ASC
    `;
    const rows = await this.db.getAllAsync<any>(query, [threadId]);

    return rows.map(row => ({
      id: row.id,
      threadId: row.thread_id,
      authorId: row.author_id,
      timestamp: row.timestamp,
      encryptedContent: row.encrypted_content,
      iv: row.iv,
    }));
  }

  /**
   * Get encrypted thread reply by ID
   */
  async getEncryptedThreadReply(replyId: string): Promise<EncryptedThreadReply | null> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'SELECT * FROM thread_replies WHERE id = ?';
    const row = await this.db.getFirstAsync<any>(query, [replyId]);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      threadId: row.thread_id,
      authorId: row.author_id,
      timestamp: row.timestamp,
      encryptedContent: row.encrypted_content,
      iv: row.iv,
    };
  }

  /**
   * Get reply count for a thread
   */
  async getThreadReplyCount(threadId: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const query = `
      SELECT COUNT(*) as count FROM thread_replies
      WHERE thread_id = ?
    `;
    const row = await this.db.getFirstAsync<any>(query, [threadId]);

    return row?.count || 0;
  }

  /**
   * Clear all data (factory reset)
   */
  async clearAllData(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const tables = ['users', 'connections', 'events', 'messages', 'threads', 'thread_replies', 'app_state'];

    for (const table of tables) {
      await this.db.execAsync(`DELETE FROM ${table}`);
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
    }
  }
}

export default new Database();
