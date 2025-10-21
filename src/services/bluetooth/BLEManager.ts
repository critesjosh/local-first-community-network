/**
 * BLEManager - Manages Bluetooth Low Energy operations
 * Rewritten to use custom @localcommunity/rn-bluetooth module
 *
 * Handles:
 * - BLE initialization and permissions
 * - Device scanning with RSSI filtering
 * - Device discovery management
 * - Connection and GATT operations
 */

import {Platform} from 'react-native';
import {Bluetooth, addBluetoothListener, type BluetoothEvent} from '@localcommunity/rn-bluetooth';
import {Buffer} from 'buffer';
import {
  SERVICE_UUID,
  RSSI_THRESHOLD,
  SCAN_TIMEOUT,
  DEVICE_EXPIRY_TIME,
} from './BLEConstants';
import {
  DiscoveredDevice,
  BLEConnectionState,
  BLEScanListener,
  BLEStateListener,
  ConnectionProfile,
  BroadcastPayload,
} from '../../types/bluetooth';
import BLEBroadcastService from './BLEBroadcastService';

class BLEManagerService {
  private state: BLEConnectionState = {
    isScanning: false,
    isAdvertising: false,
    discoveredDevices: new Map(),
  };
  private scanListeners: Set<BLEScanListener> = new Set();
  private stateListeners: Set<BLEStateListener> = new Set();
  private deviceExpiryTimer: NodeJS.Timeout | null = null;
  private bluetoothEventUnsubscribe: (() => void) | null = null;

  /**
   * Initialize BLE manager and request permissions
   */
  async init(): Promise<boolean> {
    try {
      // Initialize the Bluetooth module
      await Bluetooth.initialize();

      // Request permissions
      const permissionsGranted = await Bluetooth.requestPermissions();
      if (!permissionsGranted) {
        console.error('Bluetooth permissions not granted');
        return false;
      }

      // Setup event listeners
      this.bluetoothEventUnsubscribe = addBluetoothListener(this.handleBluetoothEvent.bind(this));

      console.log('BLE Manager initialized successfully');
      return true;
    } catch (error) {
      console.error('Error initializing BLE Manager:', error);
      return false;
    }
  }

  /**
   * Handle Bluetooth events from native module
   */
  private handleBluetoothEvent(event: BluetoothEvent): void {
    switch (event.type) {
      case 'deviceDiscovered':
        this.handleDeviceDiscovered(event);
        break;
      case 'scanStopped':
        this.state.isScanning = false;
        this.stopDeviceExpiryTimer();
        this.notifyStateListeners();
        break;
      case 'connectionStateChanged':
        // Silently handle - calling code will log if needed
        break;
      case 'followRequestReceived':
        // Silently handle - calling code will log if needed
        break;
      case 'error':
        // Silently handle errors - these are mostly debug events
        break;
    }
  }

  /**
   * Handle device discovered event
   */
  private handleDeviceDiscovered(event: BluetoothEvent & {type: 'deviceDiscovered'}): void {
    const {deviceId, rssi, payload} = event;

    // Filter by RSSI threshold
    if (rssi < RSSI_THRESHOLD) {
      return;
    }

    // Check if this is our own broadcast
    const localFingerprint = BLEBroadcastService.getLocalFingerprint();
    if (
      localFingerprint &&
      payload.userHashHex &&
      payload.userHashHex === localFingerprint
    ) {
      // Ignore our own broadcast
      return;
    }

    // Use userHashHex as stable device key, fallback to deviceId
    const deviceKey = payload.userHashHex || deviceId;
    const displayName = payload.displayName || null;

    // Create or update discovered device
    const discoveredDevice: DiscoveredDevice = {
      id: deviceKey,
      deviceId: deviceId,
      name: displayName,
      rssi: rssi,
      device: null as any, // No longer using react-native-ble-plx Device type
      lastSeen: new Date(),
      broadcastPayload: payload as BroadcastPayload,
    };

    this.state.discoveredDevices.set(deviceKey, discoveredDevice);
    this.notifyScanListeners(discoveredDevice);
  }

  /**
   * Start scanning for nearby devices
   */
  async startScanning(): Promise<void> {
    if (this.state.isScanning) {
      return;
    }

    try {
      this.state.isScanning = true;
      this.state.discoveredDevices.clear();
      this.notifyStateListeners();

      // Start device expiry timer
      this.startDeviceExpiryTimer();

      // Start scanning
      await Bluetooth.startScanning();

      // Auto-stop after timeout
      setTimeout(() => {
        this.stopScanning();
      }, SCAN_TIMEOUT);
    } catch (error) {
      console.error('Error starting BLE scan:', error);
      this.state.isScanning = false;
      this.notifyStateListeners();
      throw error;
    }
  }

  /**
   * Stop scanning for devices
   */
  async stopScanning(): Promise<void> {
    if (!this.state.isScanning) {
      return;
    }

    console.log('Stopping BLE scan');
    try {
      await Bluetooth.stopScanning();
      this.state.isScanning = false;
      this.stopDeviceExpiryTimer();
      this.notifyStateListeners();
    } catch (error) {
      console.error('Error stopping scan:', error);
    }
  }

  /**
   * Start device expiry timer - removes devices not seen recently
   */
  private startDeviceExpiryTimer(): void {
    this.deviceExpiryTimer = setInterval(() => {
      const now = Date.now();
      const devicesToRemove: string[] = [];

      this.state.discoveredDevices.forEach((device, id) => {
        if (now - device.lastSeen.getTime() > DEVICE_EXPIRY_TIME) {
          devicesToRemove.push(id);
        }
      });

      devicesToRemove.forEach((id) => {
        this.state.discoveredDevices.delete(id);
      });

      if (devicesToRemove.length > 0) {
        this.notifyStateListeners();
      }
    }, 2000); // Check every 2 seconds
  }

  /**
   * Stop device expiry timer
   */
  private stopDeviceExpiryTimer(): void {
    if (this.deviceExpiryTimer) {
      clearInterval(this.deviceExpiryTimer);
      this.deviceExpiryTimer = null;
    }
  }

  /**
   * Get current discovered devices
   */
  getDiscoveredDevices(): DiscoveredDevice[] {
    return Array.from(this.state.discoveredDevices.values());
  }

  /**
   * Get current BLE state
   */
  getState(): BLEConnectionState {
    return {...this.state};
  }

  /**
   * Add scan listener
   */
  addScanListener(listener: BLEScanListener): void {
    this.scanListeners.add(listener);
  }

  /**
   * Remove scan listener
   */
  removeScanListener(listener: BLEScanListener): void {
    this.scanListeners.delete(listener);
  }

  /**
   * Add state listener
   */
  addStateListener(listener: BLEStateListener): void {
    this.stateListeners.add(listener);
  }

  /**
   * Remove state listener
   */
  removeStateListener(listener: BLEStateListener): void {
    this.stateListeners.delete(listener);
  }

  /**
   * Notify scan listeners
   */
  private notifyScanListeners(device: DiscoveredDevice): void {
    this.scanListeners.forEach((listener) => {
      try {
        listener(device);
      } catch (error) {
        console.error('Error in scan listener:', error);
      }
    });
  }

  /**
   * Notify state listeners
   */
  private notifyStateListeners(): void {
    this.stateListeners.forEach((listener) => {
      try {
        listener(this.state);
      } catch (error) {
        console.error('Error in state listener:', error);
      }
    });
  }

  /**
   * Connect to a discovered device
   */
  async connectToDevice(deviceId: string): Promise<any> {
    try {
      console.log(`Connecting to device ${deviceId}...`);
      await Bluetooth.connect(deviceId, 10000); // 10 second timeout
      console.log(`Connected to device ${deviceId}`);
      return {id: deviceId}; // Return a minimal device object
    } catch (error) {
      console.error('Error connecting to device:', error);
      return null;
    }
  }

  /**
   * Disconnect from a device
   */
  async disconnectFromDevice(deviceId: string): Promise<void> {
    try {
      await Bluetooth.disconnect(deviceId);
      console.log(`Disconnected from device ${deviceId}`);
    } catch (error) {
      console.error('Error disconnecting from device:', error);
    }
  }

  /**
   * Read profile data from connected device
   */
  async readProfile(device: any): Promise<ConnectionProfile | null> {
    try {
      const profileJson = await Bluetooth.readProfile(device.id);
      const profile: ConnectionProfile = JSON.parse(profileJson);
      console.log('Profile received:', profile);
      return profile;
    } catch (error) {
      console.error('Error reading profile:', error);
      return null;
    }
  }

  /**
   * Write handshake data to connected device
   * @param device Connected device
   * @param handshakeData Data to write (will be JSON stringified)
   */
  async writeHandshake(device: any, handshakeData: any): Promise<boolean> {
    try {
      await Bluetooth.writeFollowRequest(device.id, handshakeData);
      console.log('Handshake data written');
      return true;
    } catch (error) {
      console.error('Error writing handshake:', error);
      return false;
    }
  }

  /**
   * Check if device is connected
   */
  async isDeviceConnected(deviceId: string): Promise<boolean> {
    try {
      return await Bluetooth.isConnected(deviceId);
    } catch (error) {
      return false;
    }
  }

  /**
   * Cleanup and destroy manager
   */
  destroy(): void {
    this.stopScanning();
    this.scanListeners.clear();
    this.stateListeners.clear();
    if (this.bluetoothEventUnsubscribe) {
      this.bluetoothEventUnsubscribe();
      this.bluetoothEventUnsubscribe = null;
    }
  }
}

export default new BLEManagerService();
