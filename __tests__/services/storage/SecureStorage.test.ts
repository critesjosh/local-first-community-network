/**
 * Tests for SecureStorage service
 */

import '../../../__tests__/setup';
import * as SecureStore from 'expo-secure-store';
import SecureStorage from '../../../src/services/storage/SecureStorage';
import {KeyPair} from '../../../src/types/crypto';

describe('SecureStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('storeKeyPair', () => {
    it('should store key pair successfully', async () => {
      const keyPair: KeyPair = {
        publicKey: new Uint8Array([1, 2, 3, 4]),
        privateKey: new Uint8Array([5, 6, 7, 8]),
      };

      const result = await SecureStorage.storeKeyPair(keyPair);

      expect(result).toBe(true);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'identity_keys',
        expect.stringContaining('publicKey'),
      );
    });

    it('should handle storage failure', async () => {
      (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(
        new Error('Storage error')
      );

      const keyPair: KeyPair = {
        publicKey: new Uint8Array([1, 2, 3]),
        privateKey: new Uint8Array([4, 5, 6]),
      };

      await expect(SecureStorage.storeKeyPair(keyPair)).rejects.toThrow(
        'Failed to store key pair securely',
      );
    });
  });

  describe('getKeyPair', () => {
    it('should retrieve stored key pair', async () => {
      const storedData = JSON.stringify({
        publicKey: '01020304',
        privateKey: '05060708',
      });

      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(storedData);

      const result = await SecureStorage.getKeyPair();

      expect(result).toBeDefined();
      expect(result?.publicKey).toEqual(new Uint8Array([1, 2, 3, 4]));
      expect(result?.privateKey).toEqual(new Uint8Array([5, 6, 7, 8]));
    });

    it('should return null if no keys stored', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);

      const result = await SecureStorage.getKeyPair();

      expect(result).toBeNull();
    });

    it('should handle retrieval errors gracefully', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(
        new Error('SecureStore error'),
      );

      const result = await SecureStorage.getKeyPair();

      expect(result).toBeNull();
    });
  });

  describe('hasKeys', () => {
    it('should return true if keys exist', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('some_data');

      const result = await SecureStorage.hasKeys();

      expect(result).toBe(true);
    });

    it('should return false if no keys exist', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);

      const result = await SecureStorage.hasKeys();

      expect(result).toBe(false);
    });

    it('should handle errors and return false', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(
        new Error('Error'),
      );

      const result = await SecureStorage.hasKeys();

      expect(result).toBe(false);
    });
  });

  describe('deleteKeys', () => {
    it('should delete keys successfully', async () => {
      (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValueOnce(undefined);

      const result = await SecureStorage.deleteKeys();

      expect(result).toBe(true);
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('identity_keys');
    });

    it('should handle deletion failure', async () => {
      (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(
        new Error('Delete error')
      );

      const result = await SecureStorage.deleteKeys();

      expect(result).toBe(false);
    });
  });

  describe('storeSecureData and getSecureData', () => {
    it('should store and retrieve generic secure data', async () => {
      const key = 'test_key';
      const value = 'test_value';

      const storeResult = await SecureStorage.storeSecureData(key, value);
      expect(storeResult).toBe(true);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(key, value);

      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(value);

      const retrievedValue = await SecureStorage.getSecureData(key);
      expect(retrievedValue).toBe(value);
    });

    it('should return null for non-existent data', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);

      const result = await SecureStorage.getSecureData('non_existent');

      expect(result).toBeNull();
    });
  });

  describe('checkDeviceSecurity', () => {
    it('should return supported (expo-secure-store always supported)', async () => {
      const result = await SecureStorage.checkDeviceSecurity();

      expect(result).toEqual({
        supported: true,
        biometryType: null, // expo-secure-store doesn't provide biometry type
      });
    });

    it('should return supported with null biometry type', async () => {
      const result = await SecureStorage.checkDeviceSecurity();

      expect(result).toEqual({
        supported: true,
        biometryType: null,
      });
    });
  });

  describe('round-trip storage', () => {
    it('should store and retrieve key pair correctly', async () => {
      const originalKeyPair: KeyPair = {
        publicKey: new Uint8Array(32).fill(42),
        privateKey: new Uint8Array(32).fill(137),
      };

      // Store
      await SecureStorage.storeKeyPair(originalKeyPair);

      // Mock retrieval
      const storedCall = (SecureStore.setItemAsync as jest.Mock).mock.calls[0];
      const storedData = storedCall[1]; // value is second argument

      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(storedData);

      // Retrieve
      const retrievedKeyPair = await SecureStorage.getKeyPair();

      expect(retrievedKeyPair).toBeDefined();
      expect(retrievedKeyPair?.publicKey).toEqual(originalKeyPair.publicKey);
      expect(retrievedKeyPair?.privateKey).toEqual(originalKeyPair.privateKey);
    });
  });
});