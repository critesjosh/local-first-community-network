/**
 * Mock for @localcommunity/rn-bluetooth custom TurboModule
 */

const mockBluetoothModule = {
  requestPermissions: jest.fn().mockResolvedValue(true),
  startAdvertising: jest.fn().mockResolvedValue(undefined),
  stopAdvertising: jest.fn().mockResolvedValue(undefined),
  setProfileData: jest.fn().mockResolvedValue(undefined),
  startScanning: jest.fn().mockResolvedValue(undefined),
  stopScanning: jest.fn().mockResolvedValue(undefined),
  connectToDevice: jest.fn().mockResolvedValue(undefined),
};

const addBluetoothListener = jest.fn((callback) => {
  // Return unsubscribe function
  return jest.fn();
});

module.exports = {
  Bluetooth: mockBluetoothModule,
  addBluetoothListener,
};
