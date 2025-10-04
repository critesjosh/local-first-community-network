/**
 * Test setup and configuration
 */

// Mock react-native modules
jest.mock('react-native-keychain', () => ({
  setInternetCredentials: jest.fn().mockResolvedValue(true),
  getInternetCredentials: jest.fn(),
  resetInternetCredentials: jest.fn().mockResolvedValue(true),
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

// Add a dummy test to prevent "must contain at least one test" error
describe('Test Setup', () => {
  it('should have mocks configured', () => {
    expect(jest.isMockFunction(require('react-native-keychain').setInternetCredentials)).toBe(true);
  });
});

export {};