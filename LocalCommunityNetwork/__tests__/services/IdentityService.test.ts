/**
 * Tests for IdentityService
 */

import '../../__tests__/setup';
import AsyncStorage from '@react-native-async-storage/async-storage';
import IdentityService from '../../src/services/IdentityService';
import SecureStorage from '../../src/services/storage/SecureStorage';
import Database from '../../src/services/storage/Database';
import KeyManager from '../../src/services/crypto/KeyManager';
import {KeyPair, Identity} from '../../src/types/crypto';
import {User} from '../../src/types/models';

// Mock dependencies
jest.mock('../../src/services/storage/SecureStorage');
jest.mock('../../src/services/storage/Database');

describe('IdentityService', () => {
  const mockKeyPair: KeyPair = {
    publicKey: new Uint8Array([1, 2, 3, 4]),
    privateKey: new Uint8Array([5, 6, 7, 8]),
  };

  const mockIdentity: Identity = {
    id: 'test_user_id',
    publicKey: mockKeyPair.publicKey,
    createdAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the service state
    (IdentityService as any).identity = null;
    (IdentityService as any).keyPair = null;
  });

  describe('init', () => {
    it('should initialize database and load existing identity', async () => {
      (Database.init as jest.Mock).mockResolvedValue(undefined);
      (SecureStorage.hasKeys as jest.Mock).mockResolvedValue(true);
      (SecureStorage.getKeyPair as jest.Mock).mockResolvedValue(mockKeyPair);

      await IdentityService.init();

      expect(Database.init).toHaveBeenCalled();
      expect(SecureStorage.hasKeys).toHaveBeenCalled();
      expect(SecureStorage.getKeyPair).toHaveBeenCalled();
    });

    it('should initialize without loading identity if no keys exist', async () => {
      (Database.init as jest.Mock).mockResolvedValue(undefined);
      (SecureStorage.hasKeys as jest.Mock).mockResolvedValue(false);

      await IdentityService.init();

      expect(Database.init).toHaveBeenCalled();
      expect(SecureStorage.hasKeys).toHaveBeenCalled();
      expect(SecureStorage.getKeyPair).not.toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      (Database.init as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(IdentityService.init()).rejects.toThrow('Database error');
    });
  });

  describe('hasIdentity', () => {
    it('should return true if keys exist', async () => {
      (SecureStorage.hasKeys as jest.Mock).mockResolvedValue(true);

      const result = await IdentityService.hasIdentity();

      expect(result).toBe(true);
      expect(SecureStorage.hasKeys).toHaveBeenCalled();
    });

    it('should return false if no keys exist', async () => {
      (SecureStorage.hasKeys as jest.Mock).mockResolvedValue(false);

      const result = await IdentityService.hasIdentity();

      expect(result).toBe(false);
    });
  });

  describe('createIdentity', () => {
    it('should create and store a new identity', async () => {
      const displayName = 'Test User';
      const profilePhoto = 'photo_base64';

      (SecureStorage.storeKeyPair as jest.Mock).mockResolvedValue(true);
      (Database.saveUser as jest.Mock).mockResolvedValue(undefined);
      (Database.setAppState as jest.Mock).mockResolvedValue(undefined);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      const result = await IdentityService.createIdentity(displayName, profilePhoto);

      expect(result).toBeDefined();
      expect(result.publicKey).toBeInstanceOf(Uint8Array);
      expect(result.publicKey.length).toBe(32);
      expect(result.id).toBeTruthy();
      expect(SecureStorage.storeKeyPair).toHaveBeenCalledWith(
        expect.objectContaining({
          publicKey: expect.any(Uint8Array),
          privateKey: expect.any(Uint8Array),
        })
      );
      expect(Database.saveUser).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName,
          profilePhoto,
        }),
      );
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('isFirstLaunch', 'false');
      expect(Database.setAppState).toHaveBeenCalledWith('identity_created', 'true');
    });

    it('should handle storage failure', async () => {
      (SecureStorage.storeKeyPair as jest.Mock).mockResolvedValue(false);

      await expect(IdentityService.createIdentity('Test')).rejects.toThrow(
        'Failed to create identity',
      );
    });

    it('should create identity without profile photo', async () => {
      const displayName = 'Test User';

      // Mock key generation
      const keyManager = new KeyManager();
      jest.spyOn(keyManager, 'generateKeyPair').mockResolvedValue(mockKeyPair);
      jest.spyOn(keyManager, 'createIdentity').mockReturnValue(mockIdentity);

      (SecureStorage.storeKeyPair as jest.Mock).mockResolvedValue(true);
      (Database.saveUser as jest.Mock).mockResolvedValue(undefined);
      (Database.setAppState as jest.Mock).mockResolvedValue(undefined);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      const result = await IdentityService.createIdentity(displayName);

      expect(result).toBeDefined();
      expect(Database.saveUser).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName,
          profilePhoto: undefined,
        }),
      );
    });
  });

  describe('loadIdentity', () => {
    it('should load existing identity from secure storage', async () => {
      (SecureStorage.getKeyPair as jest.Mock).mockResolvedValue(mockKeyPair);

      const result = await IdentityService.loadIdentity();

      expect(result).toBeDefined();
      expect(result?.publicKey).toEqual(mockKeyPair.publicKey);
      expect(SecureStorage.getKeyPair).toHaveBeenCalled();
    });

    it('should return null if no keys stored', async () => {
      (SecureStorage.getKeyPair as jest.Mock).mockResolvedValue(null);

      const result = await IdentityService.loadIdentity();

      expect(result).toBeNull();
    });

    it('should handle loading errors gracefully', async () => {
      (SecureStorage.getKeyPair as jest.Mock).mockRejectedValue(new Error('Load error'));

      const result = await IdentityService.loadIdentity();

      expect(result).toBeNull();
    });
  });

  describe('getCurrentIdentity', () => {
    it('should return current identity if loaded', async () => {
      // Load identity first
      (SecureStorage.getKeyPair as jest.Mock).mockResolvedValue(mockKeyPair);
      await IdentityService.loadIdentity();

      const result = IdentityService.getCurrentIdentity();

      expect(result).toBeDefined();
      expect(result?.publicKey).toEqual(mockKeyPair.publicKey);
    });

    it('should return null if no identity loaded', () => {
      const result = IdentityService.getCurrentIdentity();

      expect(result).toBeNull();
    });
  });

  describe('getCurrentUser', () => {
    it('should return user profile for current identity', async () => {
      // Load identity first
      (SecureStorage.getKeyPair as jest.Mock).mockResolvedValue(mockKeyPair);
      await IdentityService.loadIdentity();

      // Get the actual identity ID that was created
      const actualIdentity = await IdentityService.getCurrentIdentity();
      const mockUser: User = {
        id: actualIdentity!.id,
        displayName: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (Database.getUser as jest.Mock).mockResolvedValue(mockUser);

      const result = await IdentityService.getCurrentUser();

      expect(result).toEqual(mockUser);
      expect(Database.getUser).toHaveBeenCalledWith(actualIdentity!.id);
    });

    it('should return null if no identity loaded', async () => {
      const result = await IdentityService.getCurrentUser();

      expect(result).toBeNull();
      expect(Database.getUser).not.toHaveBeenCalled();
    });
  });

  describe('updateProfile', () => {
    it('should update user profile', async () => {
      const mockUser: User = {
        id: mockIdentity.id,
        displayName: 'Old Name',
        bio: 'Old bio',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Load identity first
      (SecureStorage.getKeyPair as jest.Mock).mockResolvedValue(mockKeyPair);
      await IdentityService.loadIdentity();

      (Database.getUser as jest.Mock).mockResolvedValue(mockUser);
      (Database.saveUser as jest.Mock).mockResolvedValue(undefined);

      const updates = {
        displayName: 'New Name',
        bio: 'New bio',
      };

      await IdentityService.updateProfile(updates);

      expect(Database.saveUser).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockUser.id, // ID should not change
          displayName: 'New Name',
          bio: 'New bio',
        }),
      );
    });

    it('should throw error if no identity loaded', async () => {
      await expect(IdentityService.updateProfile({displayName: 'Test'})).rejects.toThrow(
        'No identity found',
      );
    });

    it('should throw error if user profile not found', async () => {
      // Load identity first
      (SecureStorage.getKeyPair as jest.Mock).mockResolvedValue(mockKeyPair);
      await IdentityService.loadIdentity();

      (Database.getUser as jest.Mock).mockResolvedValue(null);

      await expect(IdentityService.updateProfile({displayName: 'Test'})).rejects.toThrow(
        'User profile not found',
      );
    });
  });

  describe('signData and verifySignature', () => {
    it('should sign data with private key', async () => {
      const data = new TextEncoder().encode('Test data');
      const mockSignature = new Uint8Array([9, 10, 11, 12]);

      // Load identity first
      (SecureStorage.getKeyPair as jest.Mock).mockResolvedValue(mockKeyPair);
      await IdentityService.loadIdentity();

      // Mock KeyManager's signData
      const keyManager = new KeyManager();
      jest.spyOn(keyManager, 'signData').mockResolvedValue(mockSignature);

      const signature = await IdentityService.signData(data);

      expect(signature).toBeDefined();
      expect(signature.length).toBeGreaterThan(0);
    });

    it('should throw error if no key pair loaded', async () => {
      const data = new TextEncoder().encode('Test data');

      await expect(IdentityService.signData(data)).rejects.toThrow('No key pair loaded');
    });

    it('should verify signature', async () => {
      const data = new TextEncoder().encode('Test data');
      const publicKey = new Uint8Array(32); // All zeros
      // Derive private key (publicKey XOR 0xFF)
      const privateKey = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        privateKey[i] = 0xFF;
      }

      // Create valid signature using the mock's sign logic
      const signature = new Uint8Array(64);
      for (let i = 0; i < 64; i++) {
        signature[i] = (data[i % data.length] + privateKey[i % 32]) % 256;
      }

      const isValid = await IdentityService.verifySignature(data, signature, publicKey);

      expect(isValid).toBe(true);
    });
  });

  describe('exportIdentity', () => {
    it('should export identity with warning', async () => {
      // Load identity first
      (SecureStorage.getKeyPair as jest.Mock).mockResolvedValue(mockKeyPair);
      await IdentityService.loadIdentity();

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await IdentityService.exportIdentity('password123');

      expect(result).toContain('version');
      expect(result).toContain('keys');
      expect(result).toContain('exportedAt');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Identity export should be encrypted with password in production',
      );

      consoleSpy.mockRestore();
    });

    it('should throw error if no key pair loaded', async () => {
      await expect(IdentityService.exportIdentity('password')).rejects.toThrow(
        'No key pair loaded',
      );
    });
  });

  describe('resetIdentity', () => {
    it('should reset all identity data', async () => {
      // Load identity first
      (SecureStorage.getKeyPair as jest.Mock).mockResolvedValue(mockKeyPair);
      await IdentityService.loadIdentity();

      (SecureStorage.deleteKeys as jest.Mock).mockResolvedValue(true);
      (Database.clearAllData as jest.Mock).mockResolvedValue(undefined);
      (AsyncStorage.clear as jest.Mock).mockResolvedValue(undefined);

      await IdentityService.resetIdentity();

      expect(SecureStorage.deleteKeys).toHaveBeenCalled();
      expect(Database.clearAllData).toHaveBeenCalled();
      expect(AsyncStorage.clear).toHaveBeenCalled();
      expect(IdentityService.getCurrentIdentity()).toBeNull();
    });

    it('should handle reset errors', async () => {
      (SecureStorage.deleteKeys as jest.Mock).mockRejectedValue(new Error('Delete error'));

      await expect(IdentityService.resetIdentity()).rejects.toThrow('Failed to reset identity');
    });
  });

  describe('isFirstLaunch', () => {
    it('should return true if first launch', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const result = await IdentityService.isFirstLaunch();

      expect(result).toBe(true);
    });

    it('should return false if not first launch', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('false');

      const result = await IdentityService.isFirstLaunch();

      expect(result).toBe(false);
    });

    it('should return true for any value other than "false"', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('true');

      const result = await IdentityService.isFirstLaunch();

      expect(result).toBe(true);
    });
  });
});