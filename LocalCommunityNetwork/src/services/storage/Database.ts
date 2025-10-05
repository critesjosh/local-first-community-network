/**
 * Database service for SQLite operations
 */

import SQLite, {SQLiteDatabase} from 'react-native-sqlite-storage';
import {User, Connection, Event, Message} from '../../types/models';
import {EncryptedEvent} from '../crypto/EncryptionService';

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
      // Stores encrypted events using hybrid encryption:
      // - encrypted_content: Event data encrypted once with random key
      // - iv: Initialization vector for content encryption
      // - wrapped_keys: JSON object with HMAC-based recipient lookup IDs
      // For plaintext fields (title, description, etc.), store NULL when using encryption
      `CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL,
        title TEXT,
        description TEXT,
        datetime INTEGER NOT NULL,
        location TEXT,
        photo TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        -- Hybrid encryption fields (new structure)
        encrypted_content TEXT,
        content_iv TEXT,
        wrapped_keys TEXT,
        -- Legacy field (for backward compatibility during transition)
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
   * Get connection by ID
   */
  async getConnection(connectionId: string): Promise<Connection | null> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'SELECT * FROM connections WHERE id = ?';
    const [results] = await this.db.executeSql(query, [connectionId]);

    if (results.rows.length === 0) {
      return null;
    }

    const row = results.rows.item(0);
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
    await this.db.executeSql(query, [connectionId]);
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
    await this.db.executeSql(query, [trustLevel, connectionId]);
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

    await this.db.executeSql(query, [
      event.id,
      event.authorId,
      event.title,
      event.description || null,
      event.datetime.getTime(),
      event.location || null,
      event.photo || null,
      event.createdAt.getTime(),
      event.updatedAt.getTime(),
      JSON.stringify(event.encryptedFor),
    ]);
  }

  /**
   * Get all events
   */
  async getEvents(limit: number = 100, offset: number = 0): Promise<Event[]> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'SELECT * FROM events ORDER BY datetime DESC LIMIT ? OFFSET ?';
    const [results] = await this.db.executeSql(query, [limit, offset]);

    const events: Event[] = [];
    for (let i = 0; i < results.rows.length; i++) {
      const row = results.rows.item(i);
      events.push({
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
      });
    }

    return events;
  }

  /**
   * Get event by ID
   */
  async getEvent(eventId: string): Promise<Event | null> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'SELECT * FROM events WHERE id = ?';
    const [results] = await this.db.executeSql(query, [eventId]);

    if (results.rows.length === 0) {
      return null;
    }

    const row = results.rows.item(0);
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
    };
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
    const [results] = await this.db.executeSql(query, [pattern]);

    const events: Event[] = [];
    for (let i = 0; i < results.rows.length; i++) {
      const row = results.rows.item(i);
      events.push({
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
      });
    }

    return events;
  }

  /**
   * Delete event
   */
  async deleteEvent(eventId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'DELETE FROM events WHERE id = ?';
    await this.db.executeSql(query, [eventId]);
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

    await this.db.executeSql(query, [
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
    const [results] = await this.db.executeSql(query, [limit, offset]);

    const events: EncryptedEvent[] = [];
    for (let i = 0; i < results.rows.length; i++) {
      const row = results.rows.item(i);
      events.push({
        id: row.id,
        authorId: row.author_id,
        timestamp: row.created_at,
        encryptedContent: row.encrypted_content,
        iv: row.content_iv,
        wrappedKeys: JSON.parse(row.wrapped_keys || '{}'),
      });
    }

    return events;
  }

  /**
   * Get encrypted event by ID
   */
  async getEncryptedEvent(eventId: string): Promise<EncryptedEvent | null> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'SELECT * FROM events WHERE id = ? AND encrypted_content IS NOT NULL';
    const [results] = await this.db.executeSql(query, [eventId]);

    if (results.rows.length === 0) {
      return null;
    }

    const row = results.rows.item(0);
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

    await this.db.executeSql(query, [
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
    const [results] = await this.db.executeSql(query, [conversationId, limit, offset]);

    const messages: Message[] = [];
    for (let i = 0; i < results.rows.length; i++) {
      const row = results.rows.item(i);
      messages.push({
        id: row.id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        recipientId: row.recipient_id,
        content: row.content,
        timestamp: new Date(row.timestamp),
        delivered: row.delivered === 1,
        read: row.read === 1,
      });
    }

    return messages;
  }

  /**
   * Mark message as delivered
   */
  async markMessageAsDelivered(messageId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'UPDATE messages SET delivered = 1 WHERE id = ?';
    await this.db.executeSql(query, [messageId]);
  }

  /**
   * Mark message as read
   */
  async markMessageAsRead(messageId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'UPDATE messages SET read = 1 WHERE id = ?';
    await this.db.executeSql(query, [messageId]);
  }

  /**
   * Mark all messages in conversation as read
   */
  async markConversationAsRead(conversationId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'UPDATE messages SET read = 1 WHERE conversation_id = ?';
    await this.db.executeSql(query, [conversationId]);
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
    const [results] = await this.db.executeSql(query, [conversationId]);

    return results.rows.item(0).count;
  }

  /**
   * Delete message
   */
  async deleteMessage(messageId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'DELETE FROM messages WHERE id = ?';
    await this.db.executeSql(query, [messageId]);
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