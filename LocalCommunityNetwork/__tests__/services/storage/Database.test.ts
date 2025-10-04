/**
 * Tests for Database service
 */

import '../../../__tests__/setup';
import SQLite from 'react-native-sqlite-storage';
import Database from '../../../src/services/storage/Database';
import {User, Connection} from '../../../src/types/models';

describe('Database', () => {
  let mockExecuteSql: jest.Mock;
  let mockClose: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockExecuteSql = jest.fn().mockResolvedValue([{
      rows: {
        length: 0,
        item: jest.fn(),
      },
    }]);

    mockClose = jest.fn().mockResolvedValue(true);

    (SQLite.openDatabase as jest.Mock).mockResolvedValue({
      executeSql: mockExecuteSql,
      close: mockClose,
    });

    await Database.init();
  });

  afterEach(async () => {
    await Database.close();
  });

  describe('init', () => {
    it('should initialize database and create tables', async () => {
      // Database is already initialized in beforeEach
      expect(SQLite.openDatabase).toHaveBeenCalledWith({
        name: 'localcommunity.db',
        location: 'default',
      });

      // Should create all required tables
      const createTableCalls = mockExecuteSql.mock.calls.filter(call =>
        call[0].includes('CREATE TABLE'),
      );
      expect(createTableCalls.length).toBeGreaterThan(0);

      // Check specific tables are created
      const tableQueries = createTableCalls.map(call => call[0]);
      expect(tableQueries.some(q => q.includes('users'))).toBe(true);
      expect(tableQueries.some(q => q.includes('connections'))).toBe(true);
      expect(tableQueries.some(q => q.includes('events'))).toBe(true);
      expect(tableQueries.some(q => q.includes('messages'))).toBe(true);
      expect(tableQueries.some(q => q.includes('app_state'))).toBe(true);
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

      expect(mockExecuteSql).toHaveBeenCalledWith(
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
      mockExecuteSql.mockResolvedValueOnce([{
        rows: {
          length: 1,
          item: jest.fn().mockReturnValue({
            id: user.id,
            display_name: user.displayName,
            profile_photo: user.profilePhoto,
            bio: user.bio,
            created_at: user.createdAt.getTime(),
            updated_at: user.updatedAt.getTime(),
          }),
        },
      }]);

      const retrievedUser = await Database.getUser(user.id);

      expect(retrievedUser).toBeDefined();
      expect(retrievedUser?.id).toBe(user.id);
      expect(retrievedUser?.displayName).toBe(user.displayName);
      expect(retrievedUser?.bio).toBe(user.bio);
    });

    it('should return null for non-existent user', async () => {
      mockExecuteSql.mockResolvedValueOnce([{
        rows: {
          length: 0,
          item: jest.fn(),
        },
      }]);

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

      expect(mockExecuteSql).toHaveBeenCalledWith(
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

      expect(mockExecuteSql).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO connections'),
        expect.arrayContaining([
          connection.id,
          connection.userId,
          connection.displayName,
        ]),
      );

      // Mock retrieval
      mockExecuteSql.mockResolvedValueOnce([{
        rows: {
          length: 1,
          item: jest.fn().mockReturnValue({
            id: connection.id,
            user_id: connection.userId,
            display_name: connection.displayName,
            profile_photo: connection.profilePhoto,
            shared_secret: '01020304',
            connected_at: connection.connectedAt.getTime(),
            notes: connection.notes,
            trust_level: connection.trustLevel,
          }),
        },
      }]);

      const connections = await Database.getConnections();

      expect(connections).toHaveLength(1);
      expect(connections[0].id).toBe(connection.id);
      expect(connections[0].userId).toBe(connection.userId);
      expect(connections[0].trustLevel).toBe('verified');
    });

    it('should return empty array when no connections', async () => {
      mockExecuteSql.mockResolvedValueOnce([{
        rows: {
          length: 0,
          item: jest.fn(),
        },
      }]);

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

      const callArgs = mockExecuteSql.mock.calls.find(call =>
        call[0].includes('INSERT OR REPLACE INTO connections'),
      );

      expect(callArgs[1]).toContain(null); // shared_secret should be null
    });
  });

  describe('getAppState and setAppState', () => {
    it('should set and get app state', async () => {
      await Database.setAppState('test_key', 'test_value');

      expect(mockExecuteSql).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO app_state'),
        ['test_key', 'test_value'],
      );

      // Mock retrieval
      mockExecuteSql.mockResolvedValueOnce([{
        rows: {
          length: 1,
          item: jest.fn().mockReturnValue({
            value: 'test_value',
          }),
        },
      }]);

      const value = await Database.getAppState('test_key');

      expect(value).toBe('test_value');
    });

    it('should return null for non-existent state', async () => {
      mockExecuteSql.mockResolvedValueOnce([{
        rows: {
          length: 0,
          item: jest.fn(),
        },
      }]);

      const value = await Database.getAppState('non_existent');

      expect(value).toBeNull();
    });
  });

  describe('clearAllData', () => {
    it('should delete all data from all tables', async () => {
      await Database.clearAllData();

      const expectedTables = ['users', 'connections', 'events', 'messages', 'app_state'];

      expectedTables.forEach(table => {
        expect(mockExecuteSql).toHaveBeenCalledWith(`DELETE FROM ${table}`);
      });
    });
  });

  describe('close', () => {
    it('should close database connection', async () => {
      await Database.close();

      expect(mockClose).toHaveBeenCalled();
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
      mockExecuteSql.mockRejectedValueOnce(new Error('SQL Error'));

      await expect(Database.getUser('test')).rejects.toThrow();
    });
  });
});