/**
 * TurboModule spec for RNLCBluetooth
 * This interface is used by React Native codegen to generate native code
 */

import {NativeModules} from 'react-native';

export interface Spec {
  /**
   * Initialize the Bluetooth module
   * Must be called before any other operations
   */
  initialize(): Promise<void>;

  /**
   * Request Bluetooth permissions
   * On Android 12+: BLUETOOTH_SCAN, BLUETOOTH_CONNECT, BLUETOOTH_ADVERTISE
   * On Android <12: ACCESS_FINE_LOCATION
   * On iOS: Handled via Info.plist
   *
   * @returns true if permissions granted
   */
  requestPermissions(): Promise<boolean>;

  // ===== Central Role (Scanning & Connection) =====

  /**
   * Start scanning for nearby devices
   * Filters by service UUID and RSSI threshold automatically
   * Emits 'deviceDiscovered' events
   */
  startScanning(): Promise<void>;

  /**
   * Stop scanning for devices
   * Emits 'scanStopped' event
   */
  stopScanning(): Promise<void>;

  /**
   * Connect to a discovered device
   * @param deviceId Device identifier from discovery
   * @param timeoutMs Connection timeout in milliseconds
   */
  connect(deviceId: string, timeoutMs: number): Promise<void>;

  /**
   * Disconnect from a connected device
   * @param deviceId Device identifier
   */
  disconnect(deviceId: string): Promise<void>;

  /**
   * Read profile data from connected device
   * Reads from Profile characteristic (6e400002-b5a3-f393-e0a9-e50e24dcca9e)
   *
   * @param deviceId Device identifier
   * @returns JSON string of ConnectionProfile
   */
  readProfile(deviceId: string): Promise<string>;

  /**
   * Write follow request to connected device
   * Writes to Handshake characteristic (6e400003-b5a3-f393-e0a9-e50e24dcca9e)
   *
   * @param deviceId Device identifier
   * @param payloadJson JSON string of FollowRequestPayload
   */
  writeFollowRequest(deviceId: string, payloadJson: string): Promise<void>;

  // ===== Peripheral Role (Advertising & GATT Server) =====

  /**
   * Set the profile data that will be served via GATT
   * This data is returned when other devices read the Profile characteristic
   *
   * @param profileJson JSON string of ConnectionProfile
   */
  setProfileData(profileJson: string): Promise<void>;

  /**
   * Start advertising presence
   * Advertises service UUID and manufacturer data
   *
   * @param displayName User's display name (max 12 chars)
   * @param userHashHex User hash as hex string (12 chars = 6 bytes)
   * @param followTokenHex Follow token as hex string (8 chars = 4 bytes)
   */
  startAdvertising(
    displayName: string,
    userHashHex: string,
    followTokenHex: string,
  ): Promise<void>;

  /**
   * Update advertisement data without stopping/starting
   * Used for rotating follow tokens
   *
   * @param displayName User's display name (max 12 chars)
   * @param userHashHex User hash as hex string (12 chars = 6 bytes)
   * @param followTokenHex Follow token as hex string (8 chars = 4 bytes)
   */
  updateAdvertisement(
    displayName: string,
    userHashHex: string,
    followTokenHex: string,
  ): Promise<void>;

  /**
   * Stop advertising
   */
  stopAdvertising(): Promise<void>;

  // ===== Utility Methods =====

  /**
   * Check if currently scanning
   */
  isScanning(): Promise<boolean>;

  /**
   * Check if currently advertising
   */
  isAdvertising(): Promise<boolean>;

  /**
   * Check if device is connected
   * @param deviceId Device identifier
   */
  isConnected(deviceId: string): Promise<boolean>;
}

export default NativeModules.RNLCBluetoothModule;
