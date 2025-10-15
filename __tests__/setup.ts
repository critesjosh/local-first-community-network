/**
 * Test setup and configuration
 */

// Mock Expo modules
jest.mock('expo-secure-store');
jest.mock('expo-sqlite');
jest.mock('expo-image-picker');

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn().mockResolvedValue(true),
  getItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(true),
  clear: jest.fn().mockResolvedValue(true),
}));

jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: 'GestureHandlerRootView',
  PanGestureHandler: 'PanGestureHandler',
  State: {},
  Directions: {},
}));

jest.mock('react-native-ble-plx', () => {
  class MockBleManager {
    state = jest.fn().mockResolvedValue('PoweredOn');
    startDeviceScan = jest.fn();
    stopDeviceScan = jest.fn();
    onStateChange = jest.fn((callback, emitCurrentState) => {
      if (emitCurrentState) {
        callback('PoweredOn');
      }
      return { remove: jest.fn() };
    });
    destroy = jest.fn();
    connectToDevice = jest.fn().mockResolvedValue({
      id: 'mock-device-id',
      discoverAllServicesAndCharacteristics: jest.fn().mockResolvedValue(true),
      readCharacteristicForService: jest.fn().mockResolvedValue({
        value: Buffer.from(JSON.stringify({
          userId: 'mockUserId123',
          displayName: 'Mock User',
          publicKey: Buffer.from(new Uint8Array(32)).toString('base64'),
        })).toString('base64'),
      }),
      writeCharacteristicWithResponseForService: jest.fn().mockResolvedValue(true),
    });
    cancelDeviceConnection = jest.fn().mockResolvedValue(true);
    isDeviceConnected = jest.fn().mockResolvedValue(false);
  }

  return {
    BleManager: MockBleManager,
    State: {
      Unknown: 'Unknown',
      Resetting: 'Resetting',
      Unsupported: 'Unsupported',
      Unauthorized: 'Unauthorized',
      PoweredOff: 'PoweredOff',
      PoweredOn: 'PoweredOn',
    },
  };
});

// Mock expo-crypto for tests
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn((length: number) => {
    const arr = new Uint8Array(length);
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
    return Promise.resolve(arr);
  }),
}));

// Mock crypto for Node environment
if (typeof global.crypto === 'undefined') {
  // Use Node's crypto module for Web Crypto API
  const nodeCrypto = require('crypto');
  global.crypto = nodeCrypto.webcrypto;
}

export {};