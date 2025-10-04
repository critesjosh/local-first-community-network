/**
 * SecureStorage - Handles secure storage of keys using device keychain
 */

import Keychain from 'react-native-keychain';
import {KeyPair, SecureKeyStorage} from '../../types/crypto';
import {uint8ArrayToHex, hexToUint8Array} from '../../utils/crypto';

const SERVICE_NAME = 'LocalCommunityNetwork';
const KEY_USERNAME = 'identity_keys';

class SecureStorage {
  /**
   * Store key pair securely in device keychain
   */
  async storeKeyPair(keyPair: KeyPair): Promise<boolean> {
    try {
      const storage: SecureKeyStorage = {
        publicKey: uint8ArrayToHex(keyPair.publicKey),
        privateKey: uint8ArrayToHex(keyPair.privateKey),
      };

      const result = await Keychain.setInternetCredentials(
        SERVICE_NAME,
        KEY_USERNAME,
        JSON.stringify(storage),
      );

      if (result === false) {
        throw new Error('Failed to store key pair securely');
      }

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
      const credentials = await Keychain.getInternetCredentials(SERVICE_NAME);

      if (!credentials) {
        return null;
      }

      const storage: SecureKeyStorage = JSON.parse(credentials.password);

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
      const credentials = await Keychain.getInternetCredentials(SERVICE_NAME);
      return credentials !== false;
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
      const result = await Keychain.resetInternetCredentials(SERVICE_NAME);
      return result;
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
      const result = await Keychain.setInternetCredentials(
        `${SERVICE_NAME}_${key}`,
        key,
        value,
      );
      return result !== false;
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
      const credentials = await Keychain.getInternetCredentials(
        `${SERVICE_NAME}_${key}`,
      );

      if (!credentials) {
        return null;
      }

      return credentials.password;
    } catch (error) {
      console.error(`Error retrieving secure data for ${key}:`, error);
      return null;
    }
  }

  /**
   * Check device security support
   */
  async checkDeviceSecurity(): Promise<{
    supported: boolean;
    biometryType: string | null;
  }> {
    try {
      const biometryType = await Keychain.getSupportedBiometryType();
      return {
        supported: biometryType !== null,
        biometryType,
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