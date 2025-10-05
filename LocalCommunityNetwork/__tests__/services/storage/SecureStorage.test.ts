/**
 * Tests for SecureStorage service
 */

import '../../../__tests__/setup';
import Keychain from 'react-native-keychain';
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
      expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
        'identity_keys',
        expect.stringContaining('publicKey'),
        {service: 'LocalCommunityNetwork'},
      );
    });

    it('should handle storage failure', async () => {
      (Keychain.setGenericPassword as jest.Mock).mockResolvedValueOnce(false);

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

      (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce({
        password: storedData,
      });

      const result = await SecureStorage.getKeyPair();

      expect(result).toBeDefined();
      expect(result?.publicKey).toEqual(new Uint8Array([1, 2, 3, 4]));
      expect(result?.privateKey).toEqual(new Uint8Array([5, 6, 7, 8]));
    });

    it('should return null if no keys stored', async () => {
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce(false);

      const result = await SecureStorage.getKeyPair();

      expect(result).toBeNull();
    });

    it('should handle retrieval errors gracefully', async () => {
      (Keychain.getGenericPassword as jest.Mock).mockRejectedValueOnce(
        new Error('Keychain error'),
      );

      const result = await SecureStorage.getKeyPair();

      expect(result).toBeNull();
    });
  });

  describe('hasKeys', () => {
    it('should return true if keys exist', async () => {
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce({
        password: 'some_data',
      });

      const result = await SecureStorage.hasKeys();

      expect(result).toBe(true);
    });

    it('should return false if no keys exist', async () => {
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce(false);

      const result = await SecureStorage.hasKeys();

      expect(result).toBe(false);
    });

    it('should handle errors and return false', async () => {
      (Keychain.getGenericPassword as jest.Mock).mockRejectedValueOnce(
        new Error('Error'),
      );

      const result = await SecureStorage.hasKeys();

      expect(result).toBe(false);
    });
  });

  describe('deleteKeys', () => {
    it('should delete keys successfully', async () => {
      (Keychain.resetGenericPassword as jest.Mock).mockResolvedValueOnce(true);

      const result = await SecureStorage.deleteKeys();

      expect(result).toBe(true);
      expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({
        service: 'LocalCommunityNetwork',
      });
    });

    it('should handle deletion failure', async () => {
      (Keychain.resetGenericPassword as jest.Mock).mockResolvedValueOnce(false);

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
      expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
        key,
        value,
        {service: `LocalCommunityNetwork_${key}`},
      );

      (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce({
        password: value,
      });

      const retrievedValue = await SecureStorage.getSecureData(key);
      expect(retrievedValue).toBe(value);
    });

    it('should return null for non-existent data', async () => {
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce(false);

      const result = await SecureStorage.getSecureData('non_existent');

      expect(result).toBeNull();
    });
  });

  describe('checkDeviceSecurity', () => {
    it('should return supported with biometry type', async () => {
      (Keychain.getSupportedBiometryType as jest.Mock).mockResolvedValueOnce('FaceID');

      const result = await SecureStorage.checkDeviceSecurity();

      expect(result).toEqual({
        supported: true,
        biometryType: 'FaceID',
      });
    });

    it('should return not supported if no biometry', async () => {
      (Keychain.getSupportedBiometryType as jest.Mock).mockResolvedValueOnce(null);

      const result = await SecureStorage.checkDeviceSecurity();

      expect(result).toEqual({
        supported: false,
        biometryType: null,
      });
    });

    it('should handle errors gracefully', async () => {
      (Keychain.getSupportedBiometryType as jest.Mock).mockRejectedValueOnce(
        new Error('Error'),
      );

      const result = await SecureStorage.checkDeviceSecurity();

      expect(result).toEqual({
        supported: false,
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
      const storedCall = (Keychain.setGenericPassword as jest.Mock).mock.calls[0];
      const storedData = storedCall[1]; // password is second argument now

      (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce({
        password: storedData,
      });

      // Retrieve
      const retrievedKeyPair = await SecureStorage.getKeyPair();

      expect(retrievedKeyPair).toBeDefined();
      expect(retrievedKeyPair?.publicKey).toEqual(originalKeyPair.publicKey);
      expect(retrievedKeyPair?.privateKey).toEqual(originalKeyPair.privateKey);
    });
  });
});