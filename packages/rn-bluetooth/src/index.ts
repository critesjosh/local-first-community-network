/**
 * @localcommunity/rn-bluetooth
 * Custom Bluetooth TurboModule for Local Community Network
 */

import {NativeEventEmitter, NativeModules} from 'react-native';
import NativeBluetooth from './NativeBluetooth';
import type {
  BluetoothEvent,
  BluetoothEventListener,
  AdvertisementPayload,
  ConnectionProfile,
  FollowRequestPayload,
} from './types';

export * from './types';

// Event emitter for Bluetooth events
const eventEmitter = new NativeEventEmitter(NativeModules.RNLCBluetooth);
const EVENT_NAME = 'RNLCBluetoothEvent';

/**
 * Add a listener for Bluetooth events
 * @param listener Function to call when events occur
 * @returns Unsubscribe function
 */
export function addBluetoothListener(
  listener: BluetoothEventListener,
): () => void {
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
  initialize: () => NativeBluetooth.initialize(),

  /**
   * Request necessary Bluetooth permissions
   * @returns true if permissions granted
   */
  requestPermissions: () => NativeBluetooth.requestPermissions(),

  // Central role methods
  startScanning: () => NativeBluetooth.startScanning(),
  stopScanning: () => NativeBluetooth.stopScanning(),
  connect: (deviceId: string, timeoutMs: number = 10000) =>
    NativeBluetooth.connect(deviceId, timeoutMs),
  disconnect: (deviceId: string) => NativeBluetooth.disconnect(deviceId),

  /**
   * Read profile from connected device
   * @param deviceId Device identifier
   * @returns Parsed ConnectionProfile object
   */
  readProfile: async (deviceId: string): Promise<ConnectionProfile> => {
    const profileJson = await NativeBluetooth.readProfile(deviceId);
    return JSON.parse(profileJson);
  },

  /**
   * Write follow request to connected device
   * @param deviceId Device identifier
   * @param payload Follow request payload object
   */
  writeFollowRequest: async (
    deviceId: string,
    payload: FollowRequestPayload,
  ): Promise<void> => {
    const payloadJson = JSON.stringify(payload);
    return NativeBluetooth.writeFollowRequest(deviceId, payloadJson);
  },

  // Peripheral role methods
  /**
   * Set profile data for GATT server
   * @param profile Profile object to serve
   */
  setProfileData: async (profile: ConnectionProfile): Promise<void> => {
    const profileJson = JSON.stringify(profile);
    return NativeBluetooth.setProfileData(profileJson);
  },

  startAdvertising: (
    displayName: string,
    userHashHex: string,
    followTokenHex: string,
  ) => NativeBluetooth.startAdvertising(displayName, userHashHex, followTokenHex),

  updateAdvertisement: (
    displayName: string,
    userHashHex: string,
    followTokenHex: string,
  ) =>
    NativeBluetooth.updateAdvertisement(displayName, userHashHex, followTokenHex),

  stopAdvertising: () => NativeBluetooth.stopAdvertising(),

  // Utility methods
  isScanning: () => NativeBluetooth.isScanning(),
  isAdvertising: () => NativeBluetooth.isAdvertising(),
  isConnected: (deviceId: string) => NativeBluetooth.isConnected(deviceId),
};

/**
 * Default export for convenience
 */
export default Bluetooth;
