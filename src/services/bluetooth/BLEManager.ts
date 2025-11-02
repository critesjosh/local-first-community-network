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
import {log, logError, logSync, logErrorSync} from '../../utils/logger';

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
  private pulseTimer: NodeJS.Timeout | null = null;
  private isPulsing: boolean = false;

  /**
   * Initialize BLE manager and request permissions
   */
  async init(): Promise<boolean> {
    try {
      // Initialize the Bluetooth module
      await Bluetooth.initialize();

      // Wait for CoreBluetooth to initialize (iOS needs time to power on)
      // This prevents "Bluetooth is initializing" errors when trying to scan immediately
      await new Promise(resolve => setTimeout(resolve, 500));

      // Request permissions
      const permissionsGranted = await Bluetooth.requestPermissions();
      if (!permissionsGranted) {
        await logError('Bluetooth permissions not granted');
        return false;
      }

      // Setup event listeners
      this.bluetoothEventUnsubscribe = addBluetoothListener(this.handleBluetoothEvent.bind(this));

      await log('✅ BLE Manager initialized and ready');
      return true;
    } catch (error) {
      await logError('Error initializing BLE Manager:', error);
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
        // Handle critical Bluetooth state errors
        if (event.code === 'BLUETOOTH_OFF') {
          console.error('[BLEManager] ❌ Bluetooth was turned off');
          this.handleBluetoothOff();
        } else if (event.code === 'PERMISSION_DENIED') {
          console.error('[BLEManager] ❌ Bluetooth permission denied');
        }
        break;
    }
  }

  /**
   * Handle Bluetooth being turned off
   */
  private handleBluetoothOff(): void {
    console.log('[BLEManager] Handling Bluetooth off state...');
    
    // Stop all ongoing operations
    this.state.isScanning = false;
    this.state.isAdvertising = false;
    this.stopDeviceExpiryTimer();
    
    // Clear discovered devices
    this.state.discoveredDevices.clear();
    
    // Stop pulsed scanning if active
    if (this.isPulsing) {
      this.isPulsing = false;
      if (this.pulseTimer) {
        clearTimeout(this.pulseTimer);
        this.pulseTimer = null;
      }
    }
    
    // Notify listeners
    this.notifyStateListeners();
    
    console.log('[BLEManager] Stopped all BLE operations due to Bluetooth off');
  }

  /**
   * Handle device discovered event
   */
  private handleDeviceDiscovered(event: BluetoothEvent & {type: 'deviceDiscovered'}): void {
    const {deviceId, rssi, payload} = event;

    // Filter by RSSI threshold
    if (rssi < RSSI_THRESHOLD) {
      return; // Silently filter weak signals
    }

    // Check if this is our own broadcast
    const localFingerprint = BLEBroadcastService.getLocalFingerprint();
    if (
      localFingerprint &&
      payload.userHashHex &&
      payload.userHashHex === localFingerprint
    ) {
      // Ignore our own broadcast (silently)
      return;
    }

    // Skip devices with no data (too noisy)
    if (!payload.displayName && !payload.userHashHex) {
      return; // Silently ignore devices without our protocol data
    }

    // Use userHashHex as stable device key, fallback to deviceId
    const deviceKey = payload.userHashHex || deviceId;
    const displayName = payload.displayName || null;

    // Check if this is a new device or an update
    const existingDevice = this.state.discoveredDevices.get(deviceKey);
    const isNewDevice = !existingDevice;
    const hasNameChanged = existingDevice && existingDevice.name !== displayName;
    const hasSignificantRssiChange = existingDevice && Math.abs(existingDevice.rssi - rssi) > 20;

    // DIAGNOSTIC: Log ALL new devices to see what's happening
    if (isNewDevice) {
      logSync(`🆕 [BLE] Found: ${displayName || '(no name)'} | userHash: ${payload.userHashHex || '(none)'} | followToken: ${payload.followTokenHex || '(none)'}`);
    }

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
    
    // Silently notify listeners (logging done above for new devices only)
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
      this.startDeviceExpiryTimer();
      await Bluetooth.startScanning();

      // Auto-stop after timeout
      setTimeout(() => {
        this.stopScanning();
      }, SCAN_TIMEOUT);
    } catch (error) {
      const errorMessage = error?.message || String(error);
      
      // If Bluetooth is initializing, wait and retry once
      if (errorMessage.includes('initializing') || errorMessage.includes('not ready')) {
        console.log('[BLE] Bluetooth still initializing, waiting 1s and retrying...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        try {
          await Bluetooth.startScanning();
          // Successfully started on retry
          return;
        } catch (retryError) {
          await logError('[BLE] Error starting scan after retry:', retryError);
          this.state.isScanning = false;
          this.notifyStateListeners();
          throw retryError;
        }
      }
      
      await logError('[BLE] Error starting scan:', error);
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

    try {
      await Bluetooth.stopScanning();
      this.state.isScanning = false;
      this.stopDeviceExpiryTimer();
      this.notifyStateListeners();
    } catch (error) {
      await logError('[BLE] Error stopping scan:', error);
    }
  }

  /**
   * Start pulsed scanning - alternates between scan bursts and pauses
   * This works better with simultaneous advertising on iOS
   */
  async startPulsedScanning(durationMs: number = 30000): Promise<void> {
    if (this.isPulsing) {
      return;
    }

    this.isPulsing = true;

    const scanDuration = 3000; // 3 seconds of scanning
    const pauseDuration = 2000; // 2 seconds pause (advertising gets priority)
    const startTime = Date.now();

    const doPulse = async () => {
      if (!this.isPulsing) {
        return;
      }

      // Check if total duration exceeded
      if (Date.now() - startTime >= durationMs) {
        await this.stopPulsedScanning();
        return;
      }

      try {
        // Scan burst (silent - too noisy to log every pulse)
        this.state.isScanning = true;
        this.notifyStateListeners();
        this.startDeviceExpiryTimer();
        await Bluetooth.startScanning();

        // Scan for scanDuration
        setTimeout(async () => {
          if (!this.isPulsing) return;

          // Stop scanning (silent)
          try {
            await Bluetooth.stopScanning();
            this.state.isScanning = false;
            this.stopDeviceExpiryTimer();
            this.notifyStateListeners();
          } catch (error) {
            await logError('Error stopping pulse scan:', error);
          }

          // Pause for pauseDuration, then repeat
          setTimeout(() => {
            if (this.isPulsing) {
              doPulse();
            }
          }, pauseDuration);
        }, scanDuration);
      } catch (error) {
        await logError('❌ Error in pulse scanning:', error);
        await this.stopPulsedScanning();
      }
    };

    // Start first pulse
    doPulse();
  }

  /**
   * Stop pulsed scanning
   */
  async stopPulsedScanning(): Promise<void> {
    if (!this.isPulsing) {
      return;
    }

    this.isPulsing = false;

    if (this.state.isScanning) {
      try {
        await Bluetooth.stopScanning();
        this.state.isScanning = false;
        this.stopDeviceExpiryTimer();
        this.notifyStateListeners();
      } catch (error) {
        await logError('[BLE] Error stopping scan:', error);
      }
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
        logErrorSync('Error in scan listener:', error);
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
        logErrorSync('Error in state listener:', error);
      }
    });
  }

  /**
   * Connect to a discovered device with retry logic
   */
  async connectToDevice(deviceId: string, maxRetries: number = 2): Promise<any> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
          console.log(`[BLEManager] 🔄 Retry attempt ${attempt}/${maxRetries} after ${backoffMs}ms delay...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
        
        console.log(`[BLEManager] 🔌 Connecting to device ${deviceId}... (attempt ${attempt + 1}/${maxRetries + 1})`);
        await Bluetooth.connect(deviceId, 8000); // 8 second timeout (reduced from 10s for faster connections)
        console.log(`[BLEManager] ✅ Connected to device ${deviceId}`);
        await log(`✅ [BLEManager] Connected to device ${deviceId}`);
        return {id: deviceId}; // Return a minimal device object
      } catch (error) {
        lastError = error;
        console.error(`[BLEManager] ❌ Connection attempt ${attempt + 1} failed:`, error);
        
        // Don't retry on certain errors
        const errorMessage = error?.message || String(error);
        if (errorMessage.includes('powered off') || errorMessage.includes('unauthorized')) {
          console.log('[BLEManager] Fatal error - not retrying');
          break;
        }
      }
    }
    
    await logError('❌ [BLEManager] Failed to connect after all retries:', lastError);
    return null;
  }

  /**
   * Disconnect from a device
   */
  async disconnectFromDevice(deviceId: string): Promise<void> {
    try {
      await Bluetooth.disconnect(deviceId);
      await log(`Disconnected from device ${deviceId}`);
    } catch (error) {
      await logError('Error disconnecting from device:', error);
    }
  }

  /**
   * Read profile data from connected device with retry logic
   */
  async readProfile(device: any, maxRetries: number = 2): Promise<ConnectionProfile | null> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const backoffMs = 500 * attempt; // Shorter backoff for reads: 500ms, 1000ms
          console.log(`[BLEManager] 🔄 Read retry attempt ${attempt}/${maxRetries} after ${backoffMs}ms delay...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
        
        console.log(`[BLEManager] 📖 Reading profile from device ${device.id}... (attempt ${attempt + 1}/${maxRetries + 1})`);
        const profile: ConnectionProfile = await Bluetooth.readProfile(device.id);
        console.log(`[BLEManager] ✅ Profile read successfully`);
        await log(`✅ [BLEManager] Profile received:`, JSON.stringify(profile));
        return profile;
      } catch (error) {
        lastError = error;
        console.error(`[BLEManager] ❌ Profile read attempt ${attempt + 1} failed:`, error);
        
        // Check if error is due to disconnection
        const errorMessage = error?.message || String(error);
        if (errorMessage.includes('not connected')) {
          console.log('[BLEManager] Device disconnected - not retrying');
          break;
        }
      }
    }
    
    await logError('❌ [BLEManager] Failed to read profile after all retries:', lastError);
    return null;
  }

  /**
   * Write handshake data to connected device
   * @param device Connected device
   * @param handshakeData Data to write (will be JSON stringified)
   */
  async writeHandshake(device: any, handshakeData: any): Promise<boolean> {
    try {
      await log(`✍️ [BLEManager] Writing handshake to device ${device.id}...`);
      await log(`✍️ [BLEManager] Handshake data: ${JSON.stringify(handshakeData).substring(0, 100)}...`);
      await Bluetooth.writeFollowRequest(device.id, handshakeData);
      await log('✅ [BLEManager] Handshake data written successfully');
      return true;
    } catch (error) {
      await logError('❌ [BLEManager] Error writing handshake:', error);
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
