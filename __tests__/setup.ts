/**
 * Test setup and configuration
 */

// Polyfill crypto.getRandomValues for tests
import 'react-native-get-random-values';

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

// Mock custom Bluetooth TurboModule
jest.mock('@localcommunity/rn-bluetooth');

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
if (typeof globalThis.crypto === 'undefined') {
  // Use Node's crypto module for Web Crypto API
  const nodeCrypto = require('crypto');
  globalThis.crypto = nodeCrypto.webcrypto;
}

export {};
