/**
 * Tests for Database service
 */

import '../../../__tests__/setup';
import * as SQLite from 'expo-sqlite';
import Database from '../../../src/services/storage/Database';
import {User, Connection} from '../../../src/types/models';
import {EncryptedEvent} from '../../../src/services/crypto/EncryptionService';

describe('Database', () => {
  let mockDb: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create mock database object
    mockDb = {
      execAsync: jest.fn().mockResolvedValue(undefined),
      runAsync: jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 1 }),
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

      // Should create tables using execAsync
      expect(mockDb.execAsync).toHaveBeenCalled();

      // Check that the SQL contains CREATE TABLE statements
      const execCall = mockDb.execAsync.mock.calls[0][0];
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

      const retrievedUser = await Database.getUser(user.id);

      expect(retrievedUser).toBeDefined();
      expect(retrievedUser?.id).toBe(user.id);
      expect(retrievedUser?.displayName).toBe(user.displayName);
      expect(retrievedUser?.bio).toBe(user.bio);
    });

    it('should return null for non-existent user', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce(null);

      const result = await Database.getUser('non_existent');

      expect(result).toBeNull();
    });

    it('should handle user without optional fields', async () => {
      const user: User = {
        id: 'user456',
        displayName: 'Simple User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await Database.saveUser(user);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO users'),
        expect.arrayContaining([
          user.id,
          user.displayName,
          null, // profilePhoto
          null, // bio
        ]),
      );
    });
  });

  describe('saveConnection and getConnections', () => {
    it('should save and retrieve connections', async () => {
      const connection: Connection = {
        id: 'conn123',
        userId: 'user456',
        displayName: 'Friend',
        profilePhoto: 'friend_photo',
        sharedSecret: new Uint8Array([1, 2, 3, 4]),
        connectedAt: new Date('2024-01-01'),
        notes: 'Met at event',
        trustLevel: 'verified',
      };

      await Database.saveConnection(connection);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO connections'),
        expect.arrayContaining([
          connection.id,
          connection.userId,
          connection.displayName,
        ]),
      );

      // Mock retrieval
      mockDb.getAllAsync.mockResolvedValueOnce([{
        id: connection.id,
        user_id: connection.userId,
        display_name: connection.displayName,
        profile_photo: connection.profilePhoto,
        shared_secret: '01020304',
        connected_at: connection.connectedAt.getTime(),
        notes: connection.notes,
        trust_level: connection.trustLevel,
      }]);

      const connections = await Database.getConnections();

      expect(connections).toHaveLength(1);
      expect(connections[0].id).toBe(connection.id);
      expect(connections[0].userId).toBe(connection.userId);
      expect(connections[0].trustLevel).toBe('verified');
    });

    it('should return empty array when no connections', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      const connections = await Database.getConnections();

      expect(connections).toEqual([]);
    });

    it('should handle connection without shared secret', async () => {
      const connection: Connection = {
        id: 'conn789',
        userId: 'user789',
        displayName: 'Pending Friend',
        connectedAt: new Date(),
        trustLevel: 'pending',
      };

      await Database.saveConnection(connection);

      const callArgs = mockDb.runAsync.mock.calls.find(call =>
        call[0].includes('INSERT OR REPLACE INTO connections'),
      );

      expect(callArgs[1]).toContain(null); // shared_secret should be null
    });
  });

  describe('getAppState and setAppState', () => {
    it('should set and get app state', async () => {
      await Database.setAppState('test_key', 'test_value');

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO app_state'),
        ['test_key', 'test_value'],
      );

      // Mock retrieval
      mockDb.getFirstAsync.mockResolvedValueOnce({
        value: 'test_value',
      });

      const value = await Database.getAppState('test_key');

      expect(value).toBe('test_value');
    });

    it('should return null for non-existent state', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce(null);

      const value = await Database.getAppState('non_existent');

      expect(value).toBeNull();
    });
  });

  describe('clearAllData', () => {
    it('should delete all data from all tables', async () => {
      await Database.clearAllData();

      const expectedTables = ['users', 'connections', 'events', 'messages', 'app_state'];

      expectedTables.forEach(table => {
        expect(mockDb.execAsync).toHaveBeenCalledWith(`DELETE FROM ${table}`);
      });
    });
  });

  describe('close', () => {
    it('should close database connection', async () => {
      await Database.close();

      expect(mockDb.closeAsync).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should throw error when database not initialized', async () => {
      // Close the database first
      await Database.close();

      // Try to use it
      await expect(Database.saveUser({
        id: 'test',
        displayName: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
      })).rejects.toThrow('Database not initialized');
    });

    it('should handle database errors gracefully', async () => {
      mockDb.getFirstAsync.mockRejectedValueOnce(new Error('SQL Error'));

      await expect(Database.getUser('test')).rejects.toThrow();
    });
  });

  describe('saveEncryptedEvent and getEncryptedEvents', () => {
    it('should save encrypted event with hybrid encryption structure', async () => {
      const encryptedEvent: EncryptedEvent = {
        id: 'event-123',
        authorId: 'author-456',
        timestamp: Date.now(),
        encryptedContent: 'base64_encrypted_content',
        iv: 'base64_iv',
        wrappedKeys: {
          'hmac_lookup_id_1': {
            wrappedKey: 'base64_wrapped_key_1',
            keyWrapIV: 'base64_key_wrap_iv_1',
          },
          'hmac_lookup_id_2': {
            wrappedKey: 'base64_wrapped_key_2',
            keyWrapIV: 'base64_key_wrap_iv_2',
          },
        },
      };

      await Database.saveEncryptedEvent(encryptedEvent);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO events'),
        [
          encryptedEvent.id,
          encryptedEvent.authorId,
          encryptedEvent.timestamp,
          encryptedEvent.timestamp,
          encryptedEvent.timestamp,
          encryptedEvent.encryptedContent,
          encryptedEvent.iv,
          JSON.stringify(encryptedEvent.wrappedKeys),
        ],
      );
    });

    it('should retrieve all encrypted events', async () => {
      const mockEvent = {
        id: 'event-789',
        author_id: 'author-123',
        created_at: 1234567890000,
        encrypted_content: 'base64_content',
        content_iv: 'base64_iv',
        wrapped_keys: JSON.stringify({
          'lookup_1': {wrappedKey: 'key1', keyWrapIV: 'iv1'},
        }),
      };

      mockDb.getAllAsync.mockResolvedValueOnce([mockEvent]);

      const events = await Database.getEncryptedEvents(50, 0);

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('WHERE encrypted_content IS NOT NULL'),
        [50, 0],
      );

      expect(events).toHaveLength(1);
      expect(events[0].id).toBe(mockEvent.id);
      expect(events[0].authorId).toBe(mockEvent.author_id);
      expect(events[0].timestamp).toBe(mockEvent.created_at);
      expect(events[0].encryptedContent).toBe(mockEvent.encrypted_content);
      expect(events[0].iv).toBe(mockEvent.content_iv);
      expect(events[0].wrappedKeys).toEqual(JSON.parse(mockEvent.wrapped_keys));
    });

    it('should retrieve encrypted event by ID', async () => {
      const mockEvent = {
        id: 'event-specific',
        author_id: 'author-456',
        created_at: 1234567890000,
        encrypted_content: 'base64_content_specific',
        content_iv: 'base64_iv_specific',
        wrapped_keys: JSON.stringify({
          'lookup_specific': {wrappedKey: 'key_specific', keyWrapIV: 'iv_specific'},
        }),
      };

      mockDb.getFirstAsync.mockResolvedValueOnce(mockEvent);

      const event = await Database.getEncryptedEvent('event-specific');

      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = ? AND encrypted_content IS NOT NULL'),
        ['event-specific'],
      );

      expect(event).not.toBeNull();
      expect(event!.id).toBe(mockEvent.id);
      expect(event!.encryptedContent).toBe(mockEvent.encrypted_content);
      expect(event!.wrappedKeys).toEqual(JSON.parse(mockEvent.wrapped_keys));
    });

    it('should return null for non-existent encrypted event', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce(null);

      const event = await Database.getEncryptedEvent('non-existent');

      expect(event).toBeNull();
    });

    it('should handle empty wrapped keys object', async () => {
      const encryptedEvent: EncryptedEvent = {
        id: 'event-empty-keys',
        authorId: 'author-789',
        timestamp: Date.now(),
        encryptedContent: 'content',
        iv: 'iv',
        wrappedKeys: {},
      };

      await Database.saveEncryptedEvent(encryptedEvent);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO events'),
        expect.arrayContaining([
          JSON.stringify({}),
        ]),
      );
    });

    it('should handle multiple wrapped keys (many recipients)', async () => {
      const wrappedKeys: EncryptedEvent['wrappedKeys'] = {};
      for (let i = 0; i < 100; i++) {
        wrappedKeys[`hmac_lookup_${i}`] = {
          wrappedKey: `key_${i}`,
          keyWrapIV: `iv_${i}`,
        };
      }

      const encryptedEvent: EncryptedEvent = {
        id: 'event-many-recipients',
        authorId: 'popular-user',
        timestamp: Date.now(),
        encryptedContent: 'shared_content',
        iv: 'iv',
        wrappedKeys,
      };

      await Database.saveEncryptedEvent(encryptedEvent);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO events'),
        expect.arrayContaining([
          JSON.stringify(wrappedKeys),
        ]),
      );
    });
  });
});