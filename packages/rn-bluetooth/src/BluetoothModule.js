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
  sendConnectionResponse: (deviceId, responseJson) => Promise.resolve(),
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
  
  // Wrap listener to pass events through silently
  const wrappedListener = (event) => {
    // All events are silently passed to listeners with no logging
    // Only log critical errors (non-debug)
    if (event.type === 'error' && event.code !== 'DEBUG') {
      console.error('❌ [BluetoothModule] Error:', event.message);
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
  startScanning: () => {
    return BluetoothModule.startScanning();
  },
  stopScanning: () => BluetoothModule.stopScanning(),
  connect: (deviceId, timeoutMs = 10000) => BluetoothModule.connect(deviceId, timeoutMs),
  disconnect: (deviceId) => BluetoothModule.disconnect(deviceId),

  /**
   * Read profile from connected device
   * @param deviceId Device identifier
   * @returns Parsed ConnectionProfile object
   */
  readProfile: async (deviceId) => {
    console.log(`📖 [BluetoothModule] Calling native readProfile for device: ${deviceId}`);
    console.log(`📖 [BluetoothModule] Native module available: ${!!BluetoothModule.readProfile}`);
    
    // Add timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Profile read timeout after 10 seconds')), 10000)
    );
    
    const readPromise = BluetoothModule.readProfile(deviceId);
    
    try {
      const profileJson = await Promise.race([readPromise, timeoutPromise]);
      console.log(`✅ [BluetoothModule] Native readProfile returned (length: ${profileJson?.length} chars)`);
      
      // Log truncated version to avoid flooding console with huge base64 images
      const preview = profileJson?.length > 200 ? profileJson.substring(0, 200) + '...' : profileJson;
      console.log(`📝 [BluetoothModule] Profile JSON preview: ${preview}`);
      
      // Try to parse
      const parsed = JSON.parse(profileJson);
      
      // CRITICAL: Remove profilePhoto if present (causes 512-byte truncation and parse errors)
      if (parsed.profilePhoto) {
        console.warn(`⚠️ [BluetoothModule] Profile contains photo (legacy device) - stripping it out`);
        delete parsed.profilePhoto;
      }
      
      console.log(`✅ [BluetoothModule] Successfully parsed profile:`, {
        userId: parsed.userId?.substring(0, 10) + '...',
        displayName: parsed.displayName,
        hasPublicKey: !!parsed.publicKey,
        publicKeyLength: parsed.publicKey?.length,
      });
      return parsed;
    } catch (error) {
      console.error(`❌ [BluetoothModule] Native readProfile failed:`, error);
      
      // If JSON parse failed due to truncation, it's likely a profile photo issue
      if (error.message?.includes('JSON Parse error') || error.message?.includes('Unexpected end')) {
        console.error(`❌ [BluetoothModule] Profile appears to be truncated (likely contains profile photo)`);
        console.error(`❌ [BluetoothModule] Both devices must exclude profilePhoto from BLE GATT data`);
        console.error(`❌ [BluetoothModule] Received ${profileJson?.length} chars - max supported is ~512 bytes`);
      }
      throw error;
    }
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

  /**
   * Send connection response via BLE notification
   * @param deviceId Device identifier (required for Android, ignored on iOS)
   * @param response Connection response object
   */
  sendConnectionResponse: async (deviceId, response) => {
    try {
      const responseJson = JSON.stringify(response);
      console.log('[BluetoothModule] 📤 Calling native sendConnectionResponse');
      console.log('[BluetoothModule]   deviceId:', deviceId);
      console.log('[BluetoothModule]   responseJson length:', responseJson.length);
      
      // Call native method - Promise is automatically handled by React Native
      const result = await BluetoothModule.sendConnectionResponse(deviceId, responseJson);
      console.log('[BluetoothModule] ✅ sendConnectionResponse completed');
      return result;
    } catch (error) {
      console.error('[BluetoothModule] ❌ sendConnectionResponse failed:', error);
      console.error('[BluetoothModule] Error details:', {
        message: error.message,
        code: error.code,
        nativeStackAndroid: error.nativeStackAndroid
      });
      throw error;
    }
  },

  // Utility methods
  isScanning: () => BluetoothModule.isScanning(),
  isAdvertising: () => BluetoothModule.isAdvertising(),
  isConnected: (deviceId) => BluetoothModule.isConnected(deviceId),
};

/**
 * Default export for convenience
 */
export default Bluetooth;
