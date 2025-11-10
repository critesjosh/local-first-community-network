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

type BroadcastStateListener = (isAdvertising: boolean) => void;

class BLEBroadcastService {
  private isBroadcasting = false;
  private rotationTimer: NodeJS.Timeout | null = null;
  private currentProfile: BroadcastProfile | null = null;
  private localFingerprint: string | null = null;
  private stateListeners: Set<BroadcastStateListener> = new Set();

  /**
   * Start advertising the current user's presence
   */
  async start(profile: BroadcastProfile, fullProfile?: any): Promise<void> {
    this.currentProfile = profile;

    try {
      await this.checkBluetoothPermissions();
      
      if (fullProfile) {
        await this.setProfileData(JSON.stringify(fullProfile));
      }

      await this.refreshBroadcast();
      this.startRotationTimer();
      this.isBroadcasting = true;
      this.notifyStateListeners();
    } catch (error) {
      console.error('❌ Failed to start BLE broadcasting:', error);
      this.isBroadcasting = false;
      this.notifyStateListeners();
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
        this.isBroadcasting = false;
        this.notifyStateListeners();
      } catch (error) {
        console.warn('Failed to stop BLE broadcast', error);
        this.isBroadcasting = false;
        this.notifyStateListeners();
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
      await Bluetooth.initialize();
      await Bluetooth.requestPermissions();
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
      return;
    }

    const payload = this.buildManufacturerPayload(this.currentProfile);
    this.localFingerprint = payload.fingerprint;

    try {
      await Bluetooth.startAdvertising(
        payload.displayName,
        payload.userHashHex,
        payload.followTokenHex,
      );
      
      this.isBroadcasting = true;
    } catch (error) {
      this.isBroadcasting = false;
      
      // Provide more specific error messages
      if (error.message && error.message.includes('permission')) {
        throw new Error('Bluetooth advertising permission denied. Please grant permission in device settings.');
      } else if (error.message && error.message.includes('powered off')) {
        throw new Error('Bluetooth is powered off. Please enable Bluetooth in device settings.');
      } else if (error.message && error.message.includes('initializing')) {
        this.isBroadcasting = true;
        return;
      } else if (error.message && error.message.includes('already advertising')) {
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
    const normalizedName = this.normaliseName(profile.displayName);
    const truncatedName = normalizedName.slice(0, BROADCAST_NAME_MAX_LENGTH);

    const userHash = sha256(Buffer.from(profile.userId, 'utf8'));
    const userHashBytes = userHash.slice(0, USER_HASH_LENGTH);
    const userHashHex = Buffer.from(userHashBytes).toString('hex');

    const tokenBytes = this.generateRandomBytes(FOLLOW_TOKEN_LENGTH);
    const followTokenHex = Buffer.from(tokenBytes).toString('hex');

    const fingerprint = userHashHex;

    return {
      displayName: truncatedName,
      userHashHex,
      followTokenHex,
      fingerprint,
    };
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

  /**
   * Add a listener for broadcasting state changes
   */
  addStateListener(listener: BroadcastStateListener): void {
    this.stateListeners.add(listener);
    // Immediately notify of current state
    listener(this.isBroadcasting);
  }

  /**
   * Remove a state listener
   */
  removeStateListener(listener: BroadcastStateListener): void {
    this.stateListeners.delete(listener);
  }

  /**
   * Get current broadcasting state
   */
  isAdvertising(): boolean {
    return this.isBroadcasting;
  }

  /**
   * Notify all listeners of state change
   */
  private notifyStateListeners(): void {
    this.stateListeners.forEach(listener => listener(this.isBroadcasting));
  }
}

export default new BLEBroadcastService();
