/**
 * BLEAdvertiser - Manages BLE advertising (peripheral mode)
 *
 * Handles:
 * - Starting/stopping BLE advertising
 * - Broadcasting service UUIDs
 * - Managing advertising data with user profile
 */

import BleAdvertiser, {
  ADVERTISE_MODE_BALANCED,
  ADVERTISE_TX_POWER_MEDIUM,
} from 'react-native-ble-advertiser';
import {Platform} from 'react-native';
import {SERVICE_UUID} from './BLEConstants';
import IdentityService from '../IdentityService';

class BLEAdvertiserService {
  private isAdvertising: boolean = false;
  private advertisingListeners: Set<(isAdvertising: boolean) => void> = new Set();

  /**
   * Initialize BLE Advertiser
   */
  async init(): Promise<boolean> {
    try {
      console.log('Initializing BLE Advertiser...');

      // Set advertising settings
      BleAdvertiser.setCompanyId(0xFFFF); // Use 0xFFFF for development

      console.log('BLE Advertiser initialized successfully');
      return true;
    } catch (error) {
      console.error('Error initializing BLE Advertiser:', error);
      return false;
    }
  }

  /**
   * Start advertising as a BLE peripheral
   */
  async startAdvertising(): Promise<boolean> {
    if (this.isAdvertising) {
      console.log('Already advertising');
      return true;
    }

    try {
      console.log('Starting BLE advertising...');

      // Get current user identity for advertising data
      const currentUser = await IdentityService.getCurrentUser();
      if (!currentUser) {
        throw new Error('No user identity found');
      }

      // Prepare advertising data
      const advertisingOptions = {
        advertiseMode: ADVERTISE_MODE_BALANCED,
        txPowerLevel: ADVERTISE_TX_POWER_MEDIUM,
        connectable: true,
        includeDeviceName: true,
        includeTxPowerLevel: false,
      };

      // Service UUIDs to advertise
      const serviceUUIDs = [SERVICE_UUID];

      // Manufacturer data (optional - can include user info)
      // Format: [length, ...data]
      const manufacturerData = [];

      // Start advertising
      await BleAdvertiser.broadcast(
        serviceUUIDs,
        manufacturerData,
        advertisingOptions,
      );

      this.isAdvertising = true;
      this.notifyListeners(true);

      console.log('✅ BLE advertising started with service UUID:', SERVICE_UUID);
      console.log('📡 Device name:', currentUser.displayName);

      return true;
    } catch (error) {
      console.error('❌ Error starting advertising:', error);
      this.isAdvertising = false;
      this.notifyListeners(false);
      return false;
    }
  }

  /**
   * Stop advertising
   */
  async stopAdvertising(): Promise<void> {
    if (!this.isAdvertising) {
      return;
    }

    try {
      console.log('Stopping BLE advertising...');
      await BleAdvertiser.stopBroadcast();

      this.isAdvertising = false;
      this.notifyListeners(false);

      console.log('BLE advertising stopped');
    } catch (error) {
      console.error('Error stopping advertising:', error);
    }
  }

  /**
   * Check if currently advertising
   */
  getIsAdvertising(): boolean {
    return this.isAdvertising;
  }

  /**
   * Add listener for advertising state changes
   */
  addListener(listener: (isAdvertising: boolean) => void): void {
    this.advertisingListeners.add(listener);
  }

  /**
   * Remove listener
   */
  removeListener(listener: (isAdvertising: boolean) => void): void {
    this.advertisingListeners.delete(listener);
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(isAdvertising: boolean): void {
    this.advertisingListeners.forEach((listener) => {
      try {
        listener(isAdvertising);
      } catch (error) {
        console.error('Error in advertising listener:', error);
      }
    });
  }

  /**
   * Cleanup
   */
  async destroy(): Promise<void> {
    await this.stopAdvertising();
    this.advertisingListeners.clear();
  }
}

export default new BLEAdvertiserService();
