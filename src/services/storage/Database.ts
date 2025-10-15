/**
 * Database service for SQLite operations (Expo SQLite)
 */

import * as SQLite from 'expo-sqlite';
import {User, Connection, Event, Message} from '../../types/models';
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
          encrypted_for TEXT
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
        connected_at, notes, trust_level
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.runAsync(query, [
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
   * Delete event
   */
  async deleteEvent(eventId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'DELETE FROM events WHERE id = ?';
    await this.db.runAsync(query, [eventId]);
  }

  /**
   * Save encrypted event (hybrid encryption)
   */
  async saveEncryptedEvent(encryptedEvent: EncryptedEvent): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = `
      INSERT OR REPLACE INTO events (
        id, author_id, title, description, datetime, location,
        photo, created_at, updated_at, encrypted_content, content_iv, wrapped_keys
      ) VALUES (?, ?, NULL, NULL, ?, NULL, NULL, ?, ?, ?, ?, ?)
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
      WHERE encrypted_content IS NOT NULL
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
   * Clear all data (factory reset)
   */
  async clearAllData(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const tables = ['users', 'connections', 'events', 'messages', 'app_state'];

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
