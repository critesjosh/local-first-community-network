/**
 * IdentityService - Main service for managing user identity
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import KeyManager from './crypto/KeyManager';
import SecureStorage from './storage/SecureStorage';
import Database from './storage/Database';
import {Identity, KeyPair} from '../types/crypto';
import {User} from '../types/models';

const keyManager = new KeyManager();

class IdentityService {
  private identity: Identity | null = null;
  private keyPair: KeyPair | null = null;

  /**
   * Initialize the identity service
   */
  async init(): Promise<void> {
    try {
      // Initialize database
      await Database.init();

      // Check if identity exists
      const hasKeys = await SecureStorage.hasKeys();
      if (hasKeys) {
        await this.loadIdentity();
      }
    } catch (error) {
      console.error('Error initializing IdentityService:', error);
      throw error;
    }
  }

  /**
   * Check if user has created identity
   */
  async hasIdentity(): Promise<boolean> {
    return await SecureStorage.hasKeys();
  }

  /**
   * Create a new identity
   */
  async createIdentity(displayName: string, profilePhoto?: string): Promise<Identity> {
    try {
      // Generate new key pair
      const keyPair = await keyManager.generateKeyPair();

      // Create identity from key pair
      const identity = keyManager.createIdentity(keyPair);

      // Store keys securely
      const stored = await SecureStorage.storeKeyPair(keyPair);
      if (!stored) {
        throw new Error('Failed to store keys securely');
      }

      // Create user profile
      const user: User = {
        id: identity.id,
        displayName,
        profilePhoto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Save user to database
      await Database.saveUser(user);

      // Mark app as not first launch
      await AsyncStorage.setItem('isFirstLaunch', 'false');
      await Database.setAppState('identity_created', 'true');

      // Store in memory
      this.identity = identity;
      this.keyPair = keyPair;

      return identity;
    } catch (error) {
      console.error('Error creating identity:', error);
      throw new Error('Failed to create identity');
    }
  }

  /**
   * Load existing identity
   */
  async loadIdentity(): Promise<Identity | null> {
    try {
      // Retrieve keys from secure storage
      const keyPair = await SecureStorage.getKeyPair();
      if (!keyPair) {
        return null;
      }

      // Create identity from stored keys
      const identity = keyManager.createIdentity(keyPair);

      // Store in memory
      this.identity = identity;
      this.keyPair = keyPair;

      return identity;
    } catch (error) {
      console.error('Error loading identity:', error);
      return null;
    }
  }

  /**
   * Get current identity
   */
  getCurrentIdentity(): Identity | null {
    return this.identity;
  }

  /**
   * Get current user profile
   */
  async getCurrentUser(): Promise<User | null> {
    if (!this.identity) {
      return null;
    }

    return await Database.getUser(this.identity.id);
  }

  /**
   * Update user profile
   */
  async updateProfile(updates: Partial<User>): Promise<void> {
    if (!this.identity) {
      throw new Error('No identity found');
    }

    const currentUser = await this.getCurrentUser();
    if (!currentUser) {
      throw new Error('User profile not found');
    }

    const updatedUser: User = {
      ...currentUser,
      ...updates,
      id: currentUser.id, // Ensure ID cannot be changed
      updatedAt: new Date(),
    };

    await Database.saveUser(updatedUser);
  }

  /**
   * Sign data with identity private key
   */
  async signData(data: Uint8Array): Promise<Uint8Array> {
    if (!this.keyPair) {
      throw new Error('No key pair loaded');
    }

    return await keyManager.signData(data, this.keyPair.privateKey);
  }

  /**
   * Verify signature
   */
  async verifySignature(
    data: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
  ): Promise<boolean> {
    return await keyManager.verifySignature(data, signature, publicKey);
  }

  /**
   * Export identity for backup (WARNING: Contains private key!)
   */
  async exportIdentity(_password: string): Promise<string> {
    if (!this.keyPair) {
      throw new Error('No key pair loaded');
    }

    // In production, this should encrypt with password
    // For MVP, we'll return a warning
    console.warn('Identity export should be encrypted with password in production');

    const serialized = keyManager.serializeKeyPair(this.keyPair);
    return JSON.stringify({
      version: 1,
      keys: serialized,
      exportedAt: new Date().toISOString(),
    });
  }

  /**
   * Reset identity (factory reset)
   */
  async resetIdentity(): Promise<void> {
    try {
      // Delete keys from secure storage
      await SecureStorage.deleteKeys();

      // Clear database
      await Database.clearAllData();

      // Clear app state
      await AsyncStorage.clear();

      // Clear memory
      this.identity = null;
      this.keyPair = null;
    } catch (error) {
      console.error('Error resetting identity:', error);
      throw new Error('Failed to reset identity');
    }
  }

  /**
   * Check if this is first launch
   */
  async isFirstLaunch(): Promise<boolean> {
    const value = await AsyncStorage.getItem('isFirstLaunch');
    return value !== 'false';
  }
}

export default new IdentityService();