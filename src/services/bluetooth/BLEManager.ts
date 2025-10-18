/**
 * BLEManager - Manages Bluetooth Low Energy operations
 *
 * Handles:
 * - BLE initialization and permissions
 * - Device scanning with RSSI filtering
 * - Device discovery management
 * - Advertising (peripheral mode)
 */

import {BleManager, Device, State} from 'react-native-ble-plx';
import {Platform, PermissionsAndroid} from 'react-native';
import {Buffer} from 'buffer';
import {
  SERVICE_UUID,
  CHARACTERISTIC_PROFILE_UUID,
  CHARACTERISTIC_HANDSHAKE_UUID,
  RSSI_THRESHOLD,
  SCAN_TIMEOUT,
  DEVICE_EXPIRY_TIME,
  USER_HASH_LENGTH,
  FOLLOW_TOKEN_LENGTH,
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
  private manager: BleManager;
  private state: BLEConnectionState = {
    isScanning: false,
    isAdvertising: false,
    discoveredDevices: new Map(),
  };
  private scanListeners: Set<BLEScanListener> = new Set();
  private stateListeners: Set<BLEStateListener> = new Set();
  private deviceExpiryTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.manager = new BleManager();
  }

  /**
   * Initialize BLE manager and request permissions
   */
  async init(): Promise<boolean> {
    try {
      // Check if Bluetooth is supported
      const state = await this.manager.state();
      console.log('BLE State:', state);

      if (state === State.Unsupported) {
        console.error('Bluetooth is not supported on this device');
        return false;
      }

      // Request permissions
      const permissionsGranted = await this.requestPermissions();
      if (!permissionsGranted) {
        console.error('Bluetooth permissions not granted');
        return false;
      }

      // Wait for Bluetooth to be powered on
      if (state !== State.PoweredOn) {
        await this.waitForPoweredOn();
      }

      console.log('BLE Manager initialized successfully');
      return true;
    } catch (error) {
      console.error('Error initializing BLE Manager:', error);
      return false;
    }
  }

  /**
   * Request Bluetooth permissions
   */
  private async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      if (Platform.Version >= 31) {
        // Android 12+ (API 31+)
        const permissions = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        ]);

        return (
          permissions[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          permissions[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          permissions[PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE] ===
            PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        // Android 11 and below
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message:
              'Bluetooth Low Energy requires location permission to scan for devices',
            buttonPositive: 'OK',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    }

    // iOS permissions are handled via Info.plist
    return true;
  }

  /**
   * Wait for Bluetooth to be powered on
   */
  private async waitForPoweredOn(timeout: number = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        subscription.remove();
        reject(new Error('Bluetooth power on timeout'));
      }, timeout);

      const subscription = this.manager.onStateChange((state) => {
        if (state === State.PoweredOn) {
          clearTimeout(timeoutId);
          subscription.remove();
          resolve();
        }
      }, true);
    });
  }

  /**
   * Start scanning for nearby devices
   */
  async startScanning(): Promise<void> {
    if (this.state.isScanning) {
      console.log('Already scanning');
      return;
    }

    try {
      console.log('Starting BLE scan...');
      this.state.isScanning = true;
      this.state.discoveredDevices.clear();
      this.notifyStateListeners();

      // Start device expiry timer
      this.startDeviceExpiryTimer();

      // Start scanning with service UUID filter
      this.manager.startDeviceScan(
        [SERVICE_UUID],
        {allowDuplicates: true},
        this.handleDeviceDiscovered.bind(this),
      );

      // Auto-stop after timeout
      setTimeout(() => {
        this.stopScanning();
      }, SCAN_TIMEOUT);
    } catch (error) {
      console.error('Error starting scan:', error);
      this.state.isScanning = false;
      this.notifyStateListeners();
      throw error;
    }
  }

  /**
   * Stop scanning for devices
   */
  stopScanning(): void {
    if (!this.state.isScanning) {
      return;
    }

    console.log('Stopping BLE scan');
    this.manager.stopDeviceScan();
    this.state.isScanning = false;
    this.stopDeviceExpiryTimer();
    this.notifyStateListeners();
  }

  /**
   * Handle discovered device
   */
  private handleDeviceDiscovered(error: any, device: Device | null): void {
    if (error) {
      console.error('Scan error:', error);
      return;
    }

    if (!device) {
      return;
    }

    // Filter by RSSI threshold (proximity)
    if (device.rssi && device.rssi < RSSI_THRESHOLD) {
      return; // Device too far away
    }

    const broadcastPayload = this.parseManufacturerData(device.manufacturerData);
    const localFingerprint = BLEBroadcastService.getLocalFingerprint();
    if (
      broadcastPayload &&
      localFingerprint &&
      broadcastPayload.userHash === localFingerprint
    ) {
      // Ignore our own broadcast
      return;
    }

    const deviceKey = broadcastPayload?.userHash || device.id;
    const displayName =
      broadcastPayload?.displayName || device.name || device.localName || null;

    // Create or update discovered device
    const discoveredDevice: DiscoveredDevice = {
      id: deviceKey,
      deviceId: device.id,
      name: displayName,
      rssi: device.rssi || -100,
      device,
      lastSeen: new Date(),
      broadcastPayload: broadcastPayload,
    };

    this.state.discoveredDevices.set(deviceKey, discoveredDevice);
    this.notifyScanListeners(discoveredDevice);
  }

  /**
   * Decode manufacturer data payload into broadcast metadata
   */
  private parseManufacturerData(data?: string | null): BroadcastPayload | undefined {
    if (!data) {
      return undefined;
    }

    try {
      const bytes = Buffer.from(data, 'base64');
      if (bytes.length < 2) {
        return undefined;
      }

      const version = bytes[0];
      const nameLength = bytes[1];
      const expectedLength = 2 + nameLength + USER_HASH_LENGTH + FOLLOW_TOKEN_LENGTH;
      if (bytes.length < expectedLength) {
        return undefined;
      }

      const nameBytes = bytes.slice(2, 2 + nameLength);
      const displayName = nameBytes.length ? nameBytes.toString('utf8') : null;

      const hashStart = 2 + nameLength;
      const userHashBytes = bytes.slice(hashStart, hashStart + USER_HASH_LENGTH);
      const tokenStart = hashStart + USER_HASH_LENGTH;
      const followTokenBytes = bytes.slice(tokenStart, tokenStart + FOLLOW_TOKEN_LENGTH);

      return {
        version,
        displayName,
        userHash: Buffer.from(userHashBytes).toString('hex'),
        followToken: Buffer.from(followTokenBytes).toString('hex'),
      };
    } catch (error) {
      console.warn('Failed to parse manufacturer data', error);
      return undefined;
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
  async connectToDevice(deviceId: string): Promise<Device | null> {
    try {
      console.log(`Connecting to device ${deviceId}...`);
      const device = await this.manager.connectToDevice(deviceId);

      // Discover services and characteristics
      await device.discoverAllServicesAndCharacteristics();

      console.log(`Connected to device ${deviceId}`);
      return device;
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
      await this.manager.cancelDeviceConnection(deviceId);
      console.log(`Disconnected from device ${deviceId}`);
    } catch (error) {
      console.error('Error disconnecting from device:', error);
    }
  }

  /**
   * Read profile data from connected device
   */
  async readProfile(device: Device): Promise<ConnectionProfile | null> {
    try {
      const characteristic = await device.readCharacteristicForService(
        SERVICE_UUID,
        CHARACTERISTIC_PROFILE_UUID,
      );

      if (!characteristic.value) {
        console.error('No profile data received');
        return null;
      }

      // Decode base64 value
      const profileJson = Buffer.from(characteristic.value, 'base64').toString('utf-8');
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
  async writeHandshake(device: Device, handshakeData: any): Promise<boolean> {
    try {
      const dataJson = JSON.stringify(handshakeData);
      const dataBase64 = Buffer.from(dataJson, 'utf-8').toString('base64');

      await device.writeCharacteristicWithResponseForService(
        SERVICE_UUID,
        CHARACTERISTIC_HANDSHAKE_UUID,
        dataBase64,
      );

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
      return await this.manager.isDeviceConnected(deviceId);
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
    this.manager.destroy();
  }
}

export default new BLEManagerService();
