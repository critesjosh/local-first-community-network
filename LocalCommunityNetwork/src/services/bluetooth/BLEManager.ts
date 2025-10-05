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
} from '../../types/bluetooth';

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

    // Create or update discovered device
    const discoveredDevice: DiscoveredDevice = {
      id: device.id,
      name: device.name || device.localName || null,
      rssi: device.rssi || -100,
      device,
      lastSeen: new Date(),
    };

    this.state.discoveredDevices.set(device.id, discoveredDevice);
    this.notifyScanListeners(discoveredDevice);
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
