/**
 * Mock for react-native-ble-plx
 */

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

module.exports = {
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

