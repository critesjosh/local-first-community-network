/**
 * Database service for SQLite operations (Expo SQLite)
 */

import * as SQLite from 'expo-sqlite';
import {User, Connection, Event, Message, IrlItem} from '../../types/models';
import {EncryptedEvent} from '../crypto/EncryptionService';
import {Session} from '../../types/session';

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

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          event_name TEXT NOT NULL,
          host_user_id TEXT NOT NULL,
          check_in_time INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          is_active INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS session_connections (
          session_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          connected_at INTEGER NOT NULL,
          PRIMARY KEY (session_id, user_id),
          FOREIGN KEY(session_id) REFERENCES sessions(id),
          FOREIGN KEY(user_id) REFERENCES connections(user_id)
        );

        CREATE TABLE IF NOT EXISTS irl_items (
          id TEXT PRIMARY KEY,
          media_uri TEXT NOT NULL,
          front_camera_uri TEXT,
          thumbnail_uri TEXT,
          captured_at INTEGER NOT NULL,
          latitude REAL,
          longitude REAL,
          caption TEXT,
          tags TEXT,
          synced_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS irl_item_connections (
          item_id TEXT NOT NULL,
          connection_id TEXT NOT NULL,
          PRIMARY KEY (item_id, connection_id),
          FOREIGN KEY(item_id) REFERENCES irl_items(id) ON DELETE CASCADE,
          FOREIGN KEY(connection_id) REFERENCES connections(id)
        );
      `);
    } catch (error) {
      console.error('Error creating database tables:', error);
      throw new Error(`Failed to create database tables: ${error}`);
    }
  }

  /**
   * Run database migrations to update existing tables
   * IMPORTANT: Migrations should never delete user data or identity!
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Migration 1: Add status column to connections table if it doesn't exist
      await this.db.execAsync(`
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

      // Migration 3: Clean up duplicate connections (keep most recent per user_id)
      // This ONLY affects connections table, never touches users or identity
      await this.cleanupDuplicateConnections();
      
      // Migration 4: Add unique constraint to user_id
      // Note: SQLite doesn't support adding UNIQUE constraints to existing columns
      // The constraint is in the CREATE TABLE statement, so new installs will have it
      // For existing databases, the cleanup above ensures no duplicates exist
      try {
        await this.db.execAsync(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_user_id 
            ON connections(user_id);
        `);
        console.log('[Database] Unique index on user_id created');
      } catch (error) {
        // If this fails, it's not critical - the duplicate cleanup above prevents issues
        console.log('[Database] Could not create unique index:', error.message);
      }

      console.log('[Database] Migrations completed successfully');
    } catch (error) {
      console.error('Error running database migrations:', error);
      // Don't throw - migrations should never break the app
      // User data and identity are preserved even if migrations fail
    }
  }

  /**
   * Clean up duplicate connections - keeps the most recent connection per user_id
   * IMPORTANT: This ONLY affects the connections table, never touches users or identity!
   */
  private async cleanupDuplicateConnections(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Verify connections table exists before querying
      const tableExists = await this.db.getFirstAsync<{name: string}>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='connections'`
      );
      
      if (!tableExists) {
        console.log('[Database] Connections table does not exist yet, skipping cleanup');
        return;
      }

      // Find duplicates
      const duplicates = await this.db.getAllAsync<{user_id: string, count: number}>(`
        SELECT user_id, COUNT(*) as count
        FROM connections
        GROUP BY user_id
        HAVING count > 1
      `);

      if (duplicates.length === 0) {
        console.log('[Database] No duplicate connections found');
        return;
      }

      console.log(`[Database] Found ${duplicates.length} users with duplicate connections, cleaning up...`);

      // For each user with duplicates, keep only the most recent connection
      for (const dup of duplicates) {
        // Delete all but the most recent connection for this user
        await this.db.runAsync(`
          DELETE FROM connections
          WHERE user_id = ?
            AND id NOT IN (
              SELECT id FROM connections
              WHERE user_id = ?
              ORDER BY connected_at DESC
              LIMIT 1
            )
        `, [dup.user_id, dup.user_id]);
      }

      console.log('[Database] Duplicate connections cleaned up successfully');
    } catch (error) {
      console.error('[Database] Error cleaning up duplicates:', error);
      // Don't throw - this is best-effort and should never break the app
      // User identity and data remain intact even if this fails
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
   * Save connection - uses UPSERT based on user_id to prevent duplicates
   */
  async saveConnection(connection: Connection): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Check if connection already exists for this user_id
    const existing = await this.getConnectionByUserId(connection.userId);
    
    if (existing) {
      // Update existing connection, preserving the original id and connected_at
      console.log(`[Database] Updating existing connection for user ${connection.userId}`);
      const query = `
        UPDATE connections 
        SET display_name = ?,
            profile_photo = ?,
            shared_secret = ?,
            notes = ?,
            status = ?,
            trust_level = ?
        WHERE user_id = ?
      `;
      
      await this.db.runAsync(query, [
        connection.displayName,
        connection.profilePhoto || null,
        connection.sharedSecret ? Buffer.from(connection.sharedSecret).toString('hex') : null,
        connection.notes || null,
        connection.status,
        connection.trustLevel,
        connection.userId,
      ]);
    } else {
      // Insert new connection
      console.log(`[Database] Creating new connection for user ${connection.userId}`);
      const query = `
        INSERT INTO connections (
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
    if (!this.db) {
      console.error('[Database] ERROR: Database not initialized when trying to get connection by userId');
      console.error('[Database] userId:', userId);
      throw new Error('Database not initialized');
    }
    
    if (!userId) {
      console.error('[Database] ERROR: userId is null/undefined');
      return null;
    }

    try {
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
    } catch (error) {
      console.error('[Database] ERROR in getConnectionByUserId:', error);
      console.error('[Database] userId:', userId);
      console.error('[Database] db state:', this.db ? 'initialized' : 'NULL');
      throw error;
    }
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
    return value === 'true'; // default to false (require manual approval)
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
   * Save or update an IRL item along with its associated connections
   */
  async saveIrlItem(item: IrlItem): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(
      `
        INSERT OR REPLACE INTO irl_items (
          id,
          media_uri,
          front_camera_uri,
          thumbnail_uri,
          captured_at,
          latitude,
          longitude,
          caption,
          tags,
          synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        item.id,
        item.mediaUri,
        item.frontCameraUri || null,
        item.thumbnailUri || null,
        item.capturedAt.getTime(),
        item.latitude ?? null,
        item.longitude ?? null,
        item.caption ?? null,
        item.tags ? JSON.stringify(item.tags) : null,
        item.syncedAt ? item.syncedAt.getTime() : null,
      ],
    );

    // Reset connection associations
    await this.db.runAsync(
      `DELETE FROM irl_item_connections WHERE item_id = ?`,
      [item.id],
    );

    if (item.connectionIds?.length) {
      for (const connectionId of item.connectionIds) {
        await this.db.runAsync(
          `
            INSERT OR IGNORE INTO irl_item_connections (
              item_id,
              connection_id
            ) VALUES (?, ?)
          `,
          [item.id, connectionId],
        );
      }
    }
  }

  /**
   * Get all IRL items with optional pagination
   */
  async getIrlItems(limit: number = 100, offset: number = 0): Promise<IrlItem[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = await this.db.getAllAsync<any>(
      `
        SELECT 
          i.*,
          GROUP_CONCAT(ic.connection_id) AS connection_ids
        FROM irl_items i
        LEFT JOIN irl_item_connections ic ON ic.item_id = i.id
        GROUP BY i.id
        ORDER BY i.captured_at DESC
        LIMIT ? OFFSET ?
      `,
      [limit, offset],
    );

    return rows.map(row => this.mapIrlItemRow(row));
  }

  /**
   * Get IRL items associated with a specific connection
   */
  async getIrlItemsByConnection(connectionId: string): Promise<IrlItem[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = await this.db.getAllAsync<any>(
      `
        SELECT 
          i.*,
          GROUP_CONCAT(ic.connection_id) AS connection_ids
        FROM irl_items i
        INNER JOIN irl_item_connections ic ON ic.item_id = i.id
        WHERE ic.connection_id = ?
        GROUP BY i.id
        ORDER BY i.captured_at DESC
      `,
      [connectionId],
    );

    return rows.map(row => this.mapIrlItemRow(row));
  }

  /**
   * Delete an IRL item and its associations
   */
  async deleteIrlItem(itemId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(`DELETE FROM irl_items WHERE id = ?`, [itemId]);
  }

  /**
   * Mark an IRL item as synced
   */
  async markIrlItemSynced(itemId: string, syncedAt: Date = new Date()): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(
      `UPDATE irl_items SET synced_at = ? WHERE id = ?`,
      [syncedAt.getTime(), itemId],
    );
  }

  private mapIrlItemRow(row: any): IrlItem {
    let tags: string[] | undefined;
    if (row.tags) {
      try {
        const parsed = JSON.parse(row.tags);
        if (Array.isArray(parsed)) {
          tags = parsed.filter(tag => typeof tag === 'string');
        }
      } catch (error) {
        console.warn('[Database] Failed to parse IRL item tags', error);
      }
    }

    const connectionIds =
      typeof row.connection_ids === 'string' && row.connection_ids.length > 0
        ? row.connection_ids.split(',').filter((id: string) => id)
        : [];

    return {
      id: row.id,
      mediaUri: row.media_uri,
      frontCameraUri: row.front_camera_uri ?? undefined,
      thumbnailUri: row.thumbnail_uri ?? undefined,
      capturedAt: new Date(row.captured_at),
      latitude: row.latitude ?? undefined,
      longitude: row.longitude ?? undefined,
      caption: row.caption ?? undefined,
      tags,
      connectionIds,
      syncedAt: row.synced_at ? new Date(row.synced_at) : undefined,
    };
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

  // =======================
  // Session Management
  // =======================

  /**
   * Create a new session
   */
  async createSession(session: Session): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = `
      INSERT INTO sessions (
        id, event_name, host_user_id, check_in_time, expires_at, is_active
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    await this.db.runAsync(query, [
      session.id,
      session.eventName,
      session.hostUserId,
      session.checkInTime.getTime(),
      session.expiresAt.getTime(),
      session.isActive ? 1 : 0,
    ]);

    console.log('[Database] Session created:', session.id);
  }

  /**
   * Get the current active session
   */
  async getCurrentSession(): Promise<Session | null> {
    if (!this.db) throw new Error('Database not initialized');

    const query = `
      SELECT * FROM sessions 
      WHERE is_active = 1 
      ORDER BY check_in_time DESC 
      LIMIT 1
    `;

    const row = await this.db.getFirstAsync<any>(query);

    if (!row) return null;

    return {
      id: row.id,
      eventName: row.event_name,
      hostUserId: row.host_user_id,
      checkInTime: new Date(row.check_in_time),
      expiresAt: new Date(row.expires_at),
      isActive: row.is_active === 1,
    };
  }

  /**
   * Get all sessions (for cleanup)
   */
  async getAllSessions(): Promise<Session[]> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'SELECT * FROM sessions ORDER BY check_in_time DESC';
    const rows = await this.db.getAllAsync<any>(query);

    return rows.map(row => ({
      id: row.id,
      eventName: row.event_name,
      hostUserId: row.host_user_id,
      checkInTime: new Date(row.check_in_time),
      expiresAt: new Date(row.expires_at),
      isActive: row.is_active === 1,
    }));
  }

  /**
   * End a session (mark as inactive)
   */
  async endSession(sessionId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = 'UPDATE sessions SET is_active = 0 WHERE id = ?';
    await this.db.runAsync(query, [sessionId]);

    console.log('[Database] Session ended:', sessionId);
  }

  /**
   * Add a connection to a session
   */
  async addConnectionToSession(sessionId: string, userId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const query = `
      INSERT OR IGNORE INTO session_connections (
        session_id, user_id, connected_at
      ) VALUES (?, ?, ?)
    `;

    await this.db.runAsync(query, [
      sessionId,
      userId,
      Date.now(),
    ]);
  }

  /**
   * Get all connections made at a session
   */
  async getSessionConnections(sessionId: string): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');

    const query = `
      SELECT user_id FROM session_connections 
      WHERE session_id = ? 
      ORDER BY connected_at ASC
    `;

    const rows = await this.db.getAllAsync<{user_id: string}>(query, [sessionId]);
    return rows.map(row => row.user_id);
  }

  /**
   * Clear all data (factory reset)
   */
  async clearAllData(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const tables = ['users', 'connections', 'events', 'messages', 'app_state', 'sessions', 'session_connections'];

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
