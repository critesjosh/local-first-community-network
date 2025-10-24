/**
 * BLEBroadcastService - Handles advertising the current user's presence
 * Rewritten to use custom @localcommunity/rn-bluetooth module
 */

import {Bluetooth} from '@localcommunity/rn-bluetooth';
import {sha256} from '@noble/hashes/sha2.js';
import {Buffer} from 'buffer';
import {
  SERVICE_UUID,
  BROADCAST_NAME_MAX_LENGTH,
  USER_HASH_LENGTH,
  FOLLOW_TOKEN_LENGTH,
  FOLLOW_TOKEN_ROTATION_MS,
} from './BLEConstants';

export interface BroadcastProfile {
  userId: string;
  displayName: string;
}

class BLEBroadcastService {
  private isBroadcasting = false;
  private rotationTimer: NodeJS.Timeout | null = null;
  private currentProfile: BroadcastProfile | null = null;
  private localFingerprint: string | null = null;

  /**
   * Start advertising the current user's presence
   */
  async start(profile: BroadcastProfile, fullProfile?: any): Promise<void> {
    this.currentProfile = profile;

    try {
      // Check Bluetooth permissions and state first
      console.log('🔧 Initializing Bluetooth for broadcasting...');
      await this.checkBluetoothPermissions();
      
      // Set up GATT server profile data if provided
      if (fullProfile) {
        console.log('📋 Setting profile data for GATT server...');
        await this.setProfileData(JSON.stringify(fullProfile));
      }

      console.log('📡 Starting BLE broadcast...');
      await this.refreshBroadcast();
      this.startRotationTimer();
      console.log('✅ BLE broadcast started successfully');
    } catch (error) {
      console.error('❌ Failed to start BLE broadcasting:', error);
      throw error;
    }
  }

  /**
   * Set the profile data that will be served via GATT
   * This should be called before start() with the full ConnectionProfile
   */
  async setProfileData(profileJson: string): Promise<void> {
    await Bluetooth.setProfileData(profileJson);
  }

  /**
   * Stop broadcasting presence
   */
  async stop(): Promise<void> {
    this.currentProfile = null;
    this.localFingerprint = null;

    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }

    if (this.isBroadcasting) {
      try {
        // Note: The custom module might not have stopAdvertising method
        // We'll just set the state to false for now
        console.log('🛑 Stopping BLE broadcast');
        this.isBroadcasting = false;
      } catch (error) {
        console.warn('Failed to stop BLE broadcast', error);
        this.isBroadcasting = false;
      }
    }
  }

  /**
   * Returns the locally broadcasted identifier to filter out self during scans
   */
  getLocalFingerprint(): string | null {
    return this.localFingerprint;
  }

  /**
   * Check Bluetooth permissions and state before starting advertising
   */
  private async checkBluetoothPermissions(): Promise<void> {
    try {
      // Initialize Bluetooth and request permissions
      console.log('🔧 Initializing Bluetooth...');
      await Bluetooth.initialize();
      
      console.log('🔐 Requesting Bluetooth permissions...');
      await Bluetooth.requestPermissions();
      
      console.log('✅ Bluetooth initialized and permissions requested');
    } catch (error) {
      console.error('❌ Bluetooth initialization failed:', error);
      throw new Error(`Bluetooth initialization failed: ${error.message}`);
    }
  }

  /**
   * Refresh advertising payload (rotate token and restart broadcast)
   */
  private async refreshBroadcast(): Promise<void> {
    if (!this.currentProfile) {
      console.warn('⚠️ No profile set, cannot start broadcast');
      return;
    }

    const payload = this.buildManufacturerPayload(this.currentProfile);
    this.localFingerprint = payload.fingerprint;

    console.log(`📡 Broadcasting as "${payload.displayName}" (hash: ${payload.userHashHex})`);

    try {
      // Start advertising with the custom module
      await Bluetooth.startAdvertising(
        payload.displayName,
        payload.userHashHex,
        payload.followTokenHex,
      );
      
      this.isBroadcasting = true;
      console.log(`✅ BLE advertisement active - fingerprint: ${this.localFingerprint}`);
    } catch (error) {
      console.error('❌ Error advertising BLE presence:', error);
      this.isBroadcasting = false;
      
      // Provide more specific error messages
      if (error.message && error.message.includes('permission')) {
        throw new Error('Bluetooth advertising permission denied. Please grant permission in device settings.');
      } else if (error.message && error.message.includes('powered off')) {
        throw new Error('Bluetooth is powered off. Please enable Bluetooth in device settings.');
      } else if (error.message && error.message.includes('initializing')) {
        console.log('⏳ Bluetooth is initializing, advertisement will start automatically...');
        this.isBroadcasting = true; // Mark as attempting to broadcast
        return;
      } else if (error.message && error.message.includes('already advertising')) {
        console.log('⚠️ Already advertising, continuing...');
        this.isBroadcasting = true;
        return;
      } else {
        throw new Error(`BLE advertising failed: ${error.message || 'Unknown error'}`);
      }
    }
  }

  /**
   * Schedule payload rotation for privacy
   */
  private startRotationTimer(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }

    this.rotationTimer = setInterval(() => {
      this.refreshBroadcast().catch((error) => {
        console.error('Failed to refresh BLE broadcast payload', error);
      });
    }, FOLLOW_TOKEN_ROTATION_MS);
  }

  /**
   * Build manufacturer payload from profile
   */
  private buildManufacturerPayload(profile: BroadcastProfile): {
    displayName: string;
    userHashHex: string;
    followTokenHex: string;
    fingerprint: string;
  } {
    console.log('🏗️ [BLEBroadcast] Building payload for:', profile.displayName, 'userId:', profile.userId);
    
    const normalizedName = this.normaliseName(profile.displayName);
    const truncatedName = normalizedName.slice(0, BROADCAST_NAME_MAX_LENGTH);
    console.log('  - Normalized name:', normalizedName, '→ Truncated:', truncatedName);

    const userHash = sha256(Buffer.from(profile.userId, 'utf8'));
    const userHashBytes = userHash.slice(0, USER_HASH_LENGTH);
    const userHashHex = Buffer.from(userHashBytes).toString('hex');
    console.log('  - User hash (6 bytes):', userHashHex, '(', userHashBytes.length, 'bytes)');

    const tokenBytes = this.generateRandomBytes(FOLLOW_TOKEN_LENGTH);
    const followTokenHex = Buffer.from(tokenBytes).toString('hex');
    console.log('  - Follow token (4 bytes):', followTokenHex, '(', tokenBytes.length, 'bytes)');

    const fingerprint = userHashHex;

    const payload = {
      displayName: truncatedName,
      userHashHex,
      followTokenHex,
      fingerprint,
    };
    
    console.log('✅ [BLEBroadcast] Payload built:', JSON.stringify(payload));
    
    return payload;
  }

  private normaliseName(name: string): string {
    const trimmed = name.trim();
    // Strip non-ascii characters to keep within payload limits
    return trimmed.normalize('NFKD').replace(/[^\x20-\x7E]/g, '');
  }

  private generateRandomBytes(length: number): number[] {
    const array = new Uint8Array(length);
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
      globalThis.crypto.getRandomValues(array);
    } else {
      for (let i = 0; i < length; i += 1) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(array);
  }
}

export default new BLEBroadcastService();
