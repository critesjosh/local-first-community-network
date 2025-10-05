/**
 * Test setup and configuration
 */

// Mock react-native modules
jest.mock('react-native-keychain', () => ({
  setInternetCredentials: jest.fn().mockResolvedValue(true),
  getInternetCredentials: jest.fn(),
  resetInternetCredentials: jest.fn().mockResolvedValue(true),
  setGenericPassword: jest.fn().mockResolvedValue(true),
  getGenericPassword: jest.fn(),
  resetGenericPassword: jest.fn().mockResolvedValue(true),
  getSupportedBiometryType: jest.fn().mockResolvedValue('FaceID'),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn().mockResolvedValue(true),
  getItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(true),
  clear: jest.fn().mockResolvedValue(true),
}));

jest.mock('react-native-sqlite-storage', () => ({
  enablePromise: jest.fn(),
  openDatabase: jest.fn().mockResolvedValue({
    executeSql: jest.fn().mockResolvedValue([{rows: {length: 0, item: jest.fn()}}]),
    close: jest.fn().mockResolvedValue(true),
  }),
}));

jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: 'GestureHandlerRootView',
  PanGestureHandler: 'PanGestureHandler',
  State: {},
  Directions: {},
}));

jest.mock('react-native-ble-plx', () => {
  const mockDevice = {
    id: 'mock-device-id',
    name: 'Mock Device',
    rssi: -60,
    localName: 'Mock Local Name',
  };

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

// Mock crypto for Node environment
if (typeof global.crypto === 'undefined') {
  global.crypto = {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
  } as any;
}

export {};