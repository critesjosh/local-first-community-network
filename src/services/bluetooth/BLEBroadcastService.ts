import {Platform} from 'react-native';
import BLEAdvertiser, {BroadcastOptions} from 'react-native-ble-advertiser';
import {sha256} from '@noble/hashes/sha256';
import {Buffer} from 'buffer';
import {
  SERVICE_UUID,
  ADVERTISE_MODE,
  ADVERTISE_TX_POWER_LEVEL,
  MANUFACTURER_ID,
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
  private currentPayload: number[] | null = null;
  private localFingerprint: string | null = null;

  /**
   * Start advertising the current user's presence
   */
  async start(profile: BroadcastProfile): Promise<void> {
    this.currentProfile = profile;

    BLEAdvertiser.setCompanyId(MANUFACTURER_ID);

    await this.refreshBroadcast();
    this.startRotationTimer();
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
        await BLEAdvertiser.stopBroadcast();
      } catch (error) {
        console.warn('Failed to stop BLE broadcast', error);
      } finally {
        this.isBroadcasting = false;
        this.currentPayload = null;
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
    this.currentPayload = payload.bytes;
    this.localFingerprint = payload.fingerprint;

    // Restart broadcast with new payload
    if (this.isBroadcasting) {
      try {
        await BLEAdvertiser.stopBroadcast();
      } catch (error) {
        console.warn('Failed to stop broadcast before refreshing payload', error);
      } finally {
        this.isBroadcasting = false;
      }
    }

    try {
      await BLEAdvertiser.broadcast(
        SERVICE_UUID,
        this.currentPayload,
        this.getBroadcastOptions(),
      );
      this.isBroadcasting = true;
    } catch (error) {
      console.error('Error starting BLE broadcast', error);
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
    bytes: number[];
    fingerprint: string;
  } {
    const normalizedName = this.normaliseName(profile.displayName);
    const nameBytes = Array.from(Buffer.from(normalizedName, 'utf8')).slice(
      0,
      BROADCAST_NAME_MAX_LENGTH,
    );
    const nameLength = nameBytes.length;

    const userHash = sha256(Buffer.from(profile.userId, 'utf8'));
    const userHashBytes = Array.from(userHash.slice(0, USER_HASH_LENGTH));

    const tokenBytes = this.generateRandomBytes(FOLLOW_TOKEN_LENGTH);

    const payload = [1 /* version */, nameLength, ...nameBytes, ...userHashBytes, ...tokenBytes];

    const fingerprint = Buffer.from(userHashBytes).toString('hex');

    return {
      bytes: payload,
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

  private getBroadcastOptions(): BroadcastOptions {
    const options: BroadcastOptions = {
      connectable: true,
      includeDeviceName: false,
      includeTxPowerLevel: false,
    };

    if (ADVERTISE_MODE === 'LowLatency') {
      options.advertiseMode = BLEAdvertiser.ADVERTISE_MODE_LOW_LATENCY;
    } else if (ADVERTISE_MODE === 'Balanced') {
      options.advertiseMode = BLEAdvertiser.ADVERTISE_MODE_BALANCED;
    } else {
      options.advertiseMode = BLEAdvertiser.ADVERTISE_MODE_LOW_POWER;
    }

    switch (ADVERTISE_TX_POWER_LEVEL) {
      case 'High':
        options.txPowerLevel = BLEAdvertiser.ADVERTISE_TX_POWER_HIGH;
        break;
      case 'Low':
        options.txPowerLevel = BLEAdvertiser.ADVERTISE_TX_POWER_LOW;
        break;
      case 'UltraLow':
        options.txPowerLevel = BLEAdvertiser.ADVERTISE_TX_POWER_ULTRA_LOW;
        break;
      default:
        options.txPowerLevel = BLEAdvertiser.ADVERTISE_TX_POWER_MEDIUM;
        break;
    }

    // Android keeps broadcasting when app backgrounded if we don't explicitly stop.
    // iOS requires Background Modes (handled via native config).
    if (Platform.OS === 'android') {
      options.includeTxPowerLevel = false;
    }

    return options;
  }
}

export default new BLEBroadcastService();
