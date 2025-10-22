/**
 * Simple Bluetooth module implementation
 * This is a fallback implementation that doesn't require native linking
 */

import { NativeModules, NativeEventEmitter } from 'react-native';

// Check if the native module is available
const RNLCBluetoothModule = NativeModules.RNLCBluetoothModule;

if (!RNLCBluetoothModule) {
  console.warn('RNLCBluetoothModule not found. Using mock implementation.');
}

// Create a mock implementation for development
const mockModule = {
  initialize: () => Promise.resolve(),
  requestPermissions: () => Promise.resolve(true),
  startScanning: () => Promise.resolve(),
  stopScanning: () => Promise.resolve(),
  connect: (deviceId, timeoutMs) => Promise.resolve(),
  disconnect: (deviceId) => Promise.resolve(),
  readProfile: (deviceId) => Promise.resolve('{}'),
  writeFollowRequest: (deviceId, payloadJson) => Promise.resolve(),
  setProfileData: (profileJson) => Promise.resolve(),
  startAdvertising: (displayName, userHashHex, followTokenHex) => Promise.resolve(),
  updateAdvertisement: (displayName, userHashHex, followTokenHex) => Promise.resolve(),
  stopAdvertising: () => Promise.resolve(),
  isScanning: () => Promise.resolve(false),
  isAdvertising: () => Promise.resolve(false),
  isConnected: (deviceId) => Promise.resolve(false),
};

// Use the native module if available, otherwise use the mock
const BluetoothModule = RNLCBluetoothModule || mockModule;

// Event emitter for Bluetooth events
const eventEmitter = new NativeEventEmitter(RNLCBluetoothModule || {});
const EVENT_NAME = 'RNLCBluetoothEvent';

/**
 * Add a listener for Bluetooth events
 * @param listener Function to call when events occur
 * @returns Unsubscribe function
 */
export function addBluetoothListener(listener) {
  if (!RNLCBluetoothModule) {
    console.warn('RNLCBluetoothModule not available. Event listener will not work.');
    return () => {};
  }
  
  const subscription = eventEmitter.addListener(EVENT_NAME, listener);
  return () => subscription.remove();
}

/**
 * Main Bluetooth API
 * All methods return Promises for async/await usage
 */
export const Bluetooth = {
  /**
   * Initialize the Bluetooth module
   * Must be called before any other operations
   */
  initialize: () => BluetoothModule.initialize(),

  /**
   * Request necessary Bluetooth permissions
   * @returns true if permissions granted
   */
  requestPermissions: () => BluetoothModule.requestPermissions(),

  // Central role methods
  startScanning: () => BluetoothModule.startScanning(),
  stopScanning: () => BluetoothModule.stopScanning(),
  connect: (deviceId, timeoutMs = 10000) => BluetoothModule.connect(deviceId, timeoutMs),
  disconnect: (deviceId) => BluetoothModule.disconnect(deviceId),

  /**
   * Read profile from connected device
   * @param deviceId Device identifier
   * @returns Parsed ConnectionProfile object
   */
  readProfile: async (deviceId) => {
    const profileJson = await BluetoothModule.readProfile(deviceId);
    return JSON.parse(profileJson);
  },

  /**
   * Write follow request to connected device
   * @param deviceId Device identifier
   * @param payload Follow request payload object
   */
  writeFollowRequest: async (deviceId, payload) => {
    const payloadJson = JSON.stringify(payload);
    return BluetoothModule.writeFollowRequest(deviceId, payloadJson);
  },

  // Peripheral role methods
  /**
   * Set profile data for GATT server
   * @param profile Profile object to serve
   */
  setProfileData: async (profile) => {
    const profileJson = JSON.stringify(profile);
    return BluetoothModule.setProfileData(profileJson);
  },

  startAdvertising: (displayName, userHashHex, followTokenHex) => 
    BluetoothModule.startAdvertising(displayName, userHashHex, followTokenHex),

  updateAdvertisement: (displayName, userHashHex, followTokenHex) =>
    BluetoothModule.updateAdvertisement(displayName, userHashHex, followTokenHex),

  stopAdvertising: () => BluetoothModule.stopAdvertising(),

  // Utility methods
  isScanning: () => BluetoothModule.isScanning(),
  isAdvertising: () => BluetoothModule.isAdvertising(),
  isConnected: (deviceId) => BluetoothModule.isConnected(deviceId),
};

/**
 * Default export for convenience
 */
export default Bluetooth;
