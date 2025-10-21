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
  async start(profile: BroadcastProfile): Promise<void> {
    this.currentProfile = profile;

    // Set up GATT server profile data
    // Note: This should be called with full profile including userId, publicKey, etc.
    // For now, we'll let the caller handle this via setProfileData

    await this.refreshBroadcast();
    this.startRotationTimer();
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
        await Bluetooth.stopAdvertising();
      } catch (error) {
        console.warn('Failed to stop BLE broadcast', error);
      } finally {
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
   * Refresh advertising payload (rotate token and restart broadcast)
   */
  private async refreshBroadcast(): Promise<void> {
    if (!this.currentProfile) {
      return;
    }

    const payload = this.buildManufacturerPayload(this.currentProfile);
    this.localFingerprint = payload.fingerprint;

    try {
      // Check native advertising state (more reliable than local state)
      const isCurrentlyAdvertising = await Bluetooth.isAdvertising();

      if (isCurrentlyAdvertising) {
        // Update existing advertisement
        await Bluetooth.updateAdvertisement(
          payload.displayName,
          payload.userHashHex,
          payload.followTokenHex,
        );
        this.isBroadcasting = true;
      } else {
        // Start new advertisement
        await Bluetooth.startAdvertising(
          payload.displayName,
          payload.userHashHex,
          payload.followTokenHex,
        );
        // Wait a moment for advertising to actually start
        await new Promise(resolve => setTimeout(resolve, 500));
        // Check if it actually started
        this.isBroadcasting = await Bluetooth.isAdvertising();
        if (!this.isBroadcasting) {
          throw new Error('Advertising failed to start');
        }
      }
    } catch (error) {
      console.error('Error advertising BLE presence:', error);
      this.isBroadcasting = false;
      throw error;
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
}

export default new BLEBroadcastService();
