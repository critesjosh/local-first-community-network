/**
 * Tests for Database service
 */

import '../../../__tests__/setup';
import * as SQLite from 'expo-sqlite';
import Database from '../../../src/services/storage/Database';
import {User, Connection} from '../../../src/types/models';
import {EncryptedEvent} from '../../../src/services/crypto/EncryptionService';

// Mock expo-sqlite
jest.mock('expo-sqlite');

describe('Database', () => {
  let mockDb: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create mock database with expo-sqlite async API
    mockDb = {
      execAsync: jest.fn().mockResolvedValue(undefined),
      runAsync: jest.fn().mockResolvedValue({changes: 1, lastInsertRowId: 1}),
      getFirstAsync: jest.fn().mockResolvedValue(null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      closeAsync: jest.fn().mockResolvedValue(undefined),
    };

    (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

    await Database.init();
  });

  afterEach(async () => {
    await Database.close();
  });

  describe('init', () => {
    it('should initialize database and create tables', async () => {
      // Database is already initialized in beforeEach
      expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith('localcommunity.db');

      // Should have executed table creation
      expect(mockDb.execAsync).toHaveBeenCalled();
      const execCall = mockDb.execAsync.mock.calls[0][0];

      // Check specific tables are created
      expect(execCall).toContain('CREATE TABLE IF NOT EXISTS users');
      expect(execCall).toContain('CREATE TABLE IF NOT EXISTS connections');
      expect(execCall).toContain('CREATE TABLE IF NOT EXISTS events');
      expect(execCall).toContain('CREATE TABLE IF NOT EXISTS messages');
      expect(execCall).toContain('CREATE TABLE IF NOT EXISTS app_state');
    });
  });

  describe('saveUser and getUser', () => {
    it('should save and retrieve user', async () => {
      const user: User = {
        id: 'user123',
        displayName: 'Test User',
        profilePhoto: 'photo_base64',
        bio: 'Test bio',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };

      await Database.saveUser(user);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO users'),
        [
          user.id,
          user.displayName,
          user.profilePhoto,
          user.bio,
          user.createdAt.getTime(),
          user.updatedAt.getTime(),
        ],
      );

      // Mock retrieval
      mockDb.getFirstAsync.mockResolvedValueOnce({
        id: user.id,
        display_name: user.displayName,
        profile_photo: user.profilePhoto,
        bio: user.bio,
        created_at: user.createdAt.getTime(),
        updated_at: user.updatedAt.getTime(),
      });

      const retrieved = await Database.getUser(user.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(user.id);
      expect(retrieved?.displayName).toBe(user.displayName);
    });
  });

  describe('saveConnection and getConnections', () => {
    it('should save and retrieve connections', async () => {
      const connection: Connection = {
        id: 'conn123',
        userId: 'user456',
        displayName: 'Alice',
        profilePhoto: null,
        sharedSecret: 'secret123',
        connectedAt: new Date('2024-01-01'),
        notes: null,
        status: 'mutual',
        trustLevel: 'verified',
      };

      await Database.saveConnection(connection);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO connections'),
        [
          connection.id,
          connection.userId,
          connection.displayName,
          connection.profilePhoto,
          connection.sharedSecret,
          connection.connectedAt.getTime(),
          connection.notes,
          connection.status,
          connection.trustLevel,
        ],
      );

      // Mock retrieval
      mockDb.getAllAsync.mockResolvedValueOnce([
        {
          id: connection.id,
          user_id: connection.userId,
          display_name: connection.displayName,
          profile_photo: connection.profilePhoto,
          shared_secret: connection.sharedSecret,
          connected_at: connection.connectedAt.getTime(),
          notes: connection.notes,
          status: connection.status,
          trust_level: connection.trustLevel,
        },
      ]);

      const connections = await Database.getConnections();
      expect(connections).toHaveLength(1);
      expect(connections[0].id).toBe(connection.id);
      expect(connections[0].userId).toBe(connection.userId);
      expect(connections[0].status).toBe(connection.status);
    });

    it('should filter connections by status', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      const connections = await Database.getConnections('mutual');

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status = ?'),
        ['mutual'],
      );
      expect(connections).toHaveLength(0);
    });
  });

  describe('deleteConnection', () => {
    it('should delete a connection', async () => {
      await Database.deleteConnection('conn123');

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM connections WHERE id = ?'),
        ['conn123'],
      );
    });
  });

  describe('saveEvent and getEvents', () => {
    it('should save encrypted event', async () => {
      const encryptedEvent: EncryptedEvent = {
        id: 'event123',
        authorId: 'author456',
        timestamp: Date.now(),
        encryptedContent: 'encrypted_data',
        iv: 'initialization_vector',
        wrappedKeys: {
          'recipient1': {
            wrappedKey: 'wrapped_key_1',
            keyWrapIV: 'key_wrap_iv_1',
          },
        },
      };

      await Database.saveEncryptedEvent(encryptedEvent);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO events'),
        expect.arrayContaining([
          encryptedEvent.id,
          encryptedEvent.authorId,
          encryptedEvent.timestamp,
          encryptedEvent.encryptedContent,
          encryptedEvent.iv,
          JSON.stringify(encryptedEvent.wrappedKeys),
        ]),
      );
    });

    it('should retrieve encrypted events', async () => {
      const mockEventRow = {
        id: 'event123',
        author_id: 'author456',
        encrypted_content: 'encrypted_data',
        content_iv: 'initialization_vector',
        wrapped_keys: '{"recipient1":{"wrappedKey":"wrapped_key_1","keyWrapIV":"key_wrap_iv_1"}}',
        created_at: Date.now(),
      };

      mockDb.getAllAsync.mockResolvedValueOnce([mockEventRow]);

      const events = await Database.getEncryptedEvents();

      expect(events).toHaveLength(1);
      expect(events[0].id).toBe(mockEventRow.id);
      expect(events[0].authorId).toBe(mockEventRow.author_id);
    });
  });

  describe('app state', () => {
    it('should save and retrieve app state', async () => {
      await Database.setAppState('testKey', 'testValue');

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO app_state'),
        ['testKey', 'testValue'],
      );

      // Mock retrieval
      mockDb.getFirstAsync.mockResolvedValueOnce({value: 'testValue'});

      const value = await Database.getAppState('testKey');
      expect(value).toBe('testValue');
    });

    it('should return null for missing app state', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce(null);

      const value = await Database.getAppState('missingKey');
      expect(value).toBeNull();
    });
  });

  describe('auto-accept setting', () => {
    it('should get auto-accept setting', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({value: 'true'});

      const autoAccept = await Database.getAutoAcceptConnections();
      expect(autoAccept).toBe(true);
    });

    it('should set auto-accept setting', async () => {
      await Database.setAutoAcceptConnections(false);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO app_state'),
        ['auto_accept_connections', 'false'],
      );
    });
  });

  describe('close', () => {
    it('should close database connection', async () => {
      await Database.close();

      expect(mockDb.closeAsync).toHaveBeenCalled();
    });
  });
});
