/**
 * SecureStorage - Handles secure storage of keys using expo-secure-store
 */

import * as SecureStore from 'expo-secure-store';
import {KeyPair, SecureKeyStorage} from '../../types/crypto';
import {uint8ArrayToHex, hexToUint8Array} from '../../utils/crypto';

const KEY_IDENTITY = 'identity_keys';

class SecureStorage {
  /**
   * Store key pair securely in device secure storage
   */
  async storeKeyPair(keyPair: KeyPair): Promise<boolean> {
    try {
      const storage: SecureKeyStorage = {
        publicKey: uint8ArrayToHex(keyPair.publicKey),
        privateKey: uint8ArrayToHex(keyPair.privateKey),
      };

      await SecureStore.setItemAsync(KEY_IDENTITY, JSON.stringify(storage));
      return true;
    } catch (error) {
      console.error('Error storing key pair:', error);
      throw new Error('Failed to store key pair securely');
    }
  }

  /**
   * Retrieve key pair from secure storage
   */
  async getKeyPair(): Promise<KeyPair | null> {
    try {
      const value = await SecureStore.getItemAsync(KEY_IDENTITY);

      if (!value) {
        return null;
      }

      const storage: SecureKeyStorage = JSON.parse(value);

      return {
        publicKey: hexToUint8Array(storage.publicKey),
        privateKey: hexToUint8Array(storage.privateKey),
      };
    } catch (error) {
      console.error('Error retrieving key pair:', error);
      return null;
    }
  }

  /**
   * Check if keys exist in secure storage
   */
  async hasKeys(): Promise<boolean> {
    try {
      const value = await SecureStore.getItemAsync(KEY_IDENTITY);
      return value !== null;
    } catch (error) {
      console.error('Error checking for keys:', error);
      return false;
    }
  }

  /**
   * Delete keys from secure storage
   */
  async deleteKeys(): Promise<boolean> {
    try {
      await SecureStore.deleteItemAsync(KEY_IDENTITY);
      return true;
    } catch (error) {
      console.error('Error deleting keys:', error);
      return false;
    }
  }

  /**
   * Store generic secure data
   */
  async storeSecureData(key: string, value: string): Promise<boolean> {
    try {
      await SecureStore.setItemAsync(key, value);
      return true;
    } catch (error) {
      console.error(`Error storing secure data for ${key}:`, error);
      return false;
    }
  }

  /**
   * Retrieve generic secure data
   */
  async getSecureData(key: string): Promise<string | null> {
    try {
      const value = await SecureStore.getItemAsync(key);
      return value;
    } catch (error) {
      console.error(`Error retrieving secure data for ${key}:`, error);
      return null;
    }
  }

  /**
   * Check device security support
   * Note: expo-secure-store doesn't provide biometry type detection
   * It always uses the most secure storage available on the device
   */
  async checkDeviceSecurity(): Promise<{
    supported: boolean;
    biometryType: string | null;
  }> {
    try {
      // expo-secure-store is always supported on iOS and Android
      // It uses Keychain on iOS and EncryptedSharedPreferences on Android
      return {
        supported: true,
        biometryType: null, // Not available in expo-secure-store
      };
    } catch (error) {
      console.error('Error checking device security:', error);
      return {
        supported: false,
        biometryType: null,
      };
    }
  }
}

export default new SecureStorage();
