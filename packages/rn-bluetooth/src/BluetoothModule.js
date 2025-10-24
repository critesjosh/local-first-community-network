/**
 * Simple Bluetooth module implementation
 * This is a fallback implementation that doesn't require native linking
 */

import { NativeModules, NativeEventEmitter } from 'react-native';

// Check if the native modules are available
const RNLCBluetoothModule = NativeModules.RNLCBluetoothModule;
const RNLCBluetoothEventEmitter = NativeModules.RNLCBluetoothEventEmitter;

if (!RNLCBluetoothModule) {
  console.warn('RNLCBluetoothModule not found. Using mock implementation.');
}

if (!RNLCBluetoothEventEmitter) {
  console.warn('RNLCBluetoothEventEmitter not found. Events will not work.');
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

// Event emitter for Bluetooth events - use the dedicated EventEmitter module
const eventEmitter = new NativeEventEmitter(RNLCBluetoothEventEmitter);
const EVENT_NAME = 'RNLCBluetoothEvent';

console.log('🔌 Bluetooth Module Setup:');
console.log('  - RNLCBluetoothModule:', RNLCBluetoothModule ? 'Found' : 'NOT FOUND');
console.log('  - RNLCBluetoothEventEmitter:', RNLCBluetoothEventEmitter ? 'Found' : 'NOT FOUND');

/**
 * Add a listener for Bluetooth events
 * @param listener Function to call when events occur
 * @returns Unsubscribe function
 */
export function addBluetoothListener(listener) {
  if (!RNLCBluetoothEventEmitter) {
    console.warn('RNLCBluetoothEventEmitter not available. Event listener will not work.');
    return () => {};
  }
  
  // Wrap listener to log events
  const wrappedListener = (event) => {
    if (event.type === 'deviceDiscovered') {
      console.log('📱 [BluetoothModule] deviceDiscovered event received:');
      console.log('  - deviceId:', event.deviceId);
      console.log('  - rssi:', event.rssi);
      console.log('  - payload:', JSON.stringify(event.payload));
    }
    listener(event);
  };
  
  const subscription = eventEmitter.addListener(EVENT_NAME, wrappedListener);
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

  startAdvertising: (displayName, userHashHex, followTokenHex) => {
    console.log('📡 [BluetoothModule] startAdvertising called with:');
    console.log('  - displayName:', displayName);
    console.log('  - userHashHex:', userHashHex);
    console.log('  - followTokenHex:', followTokenHex);
    return BluetoothModule.startAdvertising(displayName, userHashHex, followTokenHex);
  },

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
