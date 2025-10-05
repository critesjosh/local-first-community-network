/**
 * Tests for BLEManager service
 */

import '../../../__tests__/setup';
import BLEManager from '../../../src/services/bluetooth/BLEManager';
import {RSSI_THRESHOLD} from '../../../src/services/bluetooth/BLEConstants';

// Note: Platform and PermissionsAndroid are already mocked in setup.ts
// We rely on those mocks for this test file

describe('BLEManager', () => {
  let mockManager: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Reset the singleton state
    (BLEManager as any).state = {
      isScanning: false,
      isAdvertising: false,
      discoveredDevices: new Map(),
    };
    (BLEManager as any).scanListeners = new Set();
    (BLEManager as any).stateListeners = new Set();
    (BLEManager as any).deviceExpiryTimer = null;

    // Recreate the mock manager for this test
    const {BleManager: MockBleManager} = require('react-native-ble-plx');
    (BLEManager as any).manager = new MockBleManager();

    // Get the mock manager instance
    mockManager = (BLEManager as any).manager;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('init', () => {
    it('should check BLE state on initialization', async () => {
      await BLEManager.init();

      expect(mockManager.state).toHaveBeenCalled();
    });

    it('should return false if Bluetooth is unsupported', async () => {
      mockManager.state.mockResolvedValueOnce('Unsupported');

      const result = await BLEManager.init();

      expect(result).toBe(false);
    });

    // Note: Full permission testing requires integration tests on real devices
    // as Platform.OS mocking is complex and platform-specific
  });

  describe('scanning', () => {
    beforeEach(async () => {
      await BLEManager.init();
    });

    it('should start scanning successfully', async () => {
      await BLEManager.startScanning();

      const state = BLEManager.getState();
      expect(state.isScanning).toBe(true);
      expect(mockManager.startDeviceScan).toHaveBeenCalled();
    });

    it('should not start scanning if already scanning', async () => {
      await BLEManager.startScanning();
      const firstCallCount = mockManager.startDeviceScan.mock.calls.length;

      await BLEManager.startScanning();
      const secondCallCount = mockManager.startDeviceScan.mock.calls.length;

      expect(secondCallCount).toBe(firstCallCount);
    });

    it('should stop scanning', async () => {
      await BLEManager.startScanning();
      BLEManager.stopScanning();

      const state = BLEManager.getState();
      expect(state.isScanning).toBe(false);
      expect(mockManager.stopDeviceScan).toHaveBeenCalled();
    });

    it('should clear discovered devices when starting new scan', async () => {
      // Add a device to the state
      (BLEManager as any).state.discoveredDevices.set('device1', {
        id: 'device1',
        name: 'Test Device',
        rssi: -60,
        lastSeen: new Date(),
      });

      await BLEManager.startScanning();

      const devices = BLEManager.getDiscoveredDevices();
      expect(devices.length).toBe(0);
    });
  });

  describe('RSSI filtering', () => {
    beforeEach(async () => {
      await BLEManager.init();
      await BLEManager.startScanning();
    });

    it('should filter out devices with RSSI below threshold', () => {
      const scanCallback = mockManager.startDeviceScan.mock.calls[0][2];

      // Device too far away (below threshold)
      const weakDevice = {
        id: 'weak-device',
        name: 'Weak Device',
        rssi: RSSI_THRESHOLD - 10, // -80 dBm
        localName: 'Weak',
      };

      scanCallback(null, weakDevice);

      const devices = BLEManager.getDiscoveredDevices();
      expect(devices.length).toBe(0);
    });

    it('should accept devices with RSSI above threshold', () => {
      const scanCallback = mockManager.startDeviceScan.mock.calls[0][2];

      // Device close enough (above threshold)
      const strongDevice = {
        id: 'strong-device',
        name: 'Strong Device',
        rssi: RSSI_THRESHOLD + 10, // -60 dBm
        localName: 'Strong',
      };

      scanCallback(null, strongDevice);

      const devices = BLEManager.getDiscoveredDevices();
      expect(devices.length).toBe(1);
      expect(devices[0].id).toBe('strong-device');
    });

    it('should accept devices at exactly the RSSI threshold', () => {
      const scanCallback = mockManager.startDeviceScan.mock.calls[0][2];

      const borderlineDevice = {
        id: 'borderline-device',
        name: 'Borderline Device',
        rssi: RSSI_THRESHOLD, // -70 dBm
        localName: 'Borderline',
      };

      scanCallback(null, borderlineDevice);

      const devices = BLEManager.getDiscoveredDevices();
      expect(devices.length).toBe(1);
    });
  });

  describe('device discovery', () => {
    beforeEach(async () => {
      await BLEManager.init();
      await BLEManager.startScanning();
    });

    it('should add discovered device to map', () => {
      const scanCallback = mockManager.startDeviceScan.mock.calls[0][2];

      const device = {
        id: 'test-device',
        name: 'Test Device',
        rssi: -60,
        localName: 'Test',
      };

      scanCallback(null, device);

      const devices = BLEManager.getDiscoveredDevices();
      expect(devices.length).toBe(1);
      expect(devices[0].id).toBe('test-device');
      expect(devices[0].rssi).toBe(-60);
    });

    it('should update existing device on duplicate discovery', () => {
      const scanCallback = mockManager.startDeviceScan.mock.calls[0][2];

      const device = {
        id: 'test-device',
        name: 'Test Device',
        rssi: -60,
        localName: 'Test',
      };

      scanCallback(null, device);

      // Same device with different RSSI
      const updatedDevice = {
        ...device,
        rssi: -55,
      };

      scanCallback(null, updatedDevice);

      const devices = BLEManager.getDiscoveredDevices();
      expect(devices.length).toBe(1);
      expect(devices[0].rssi).toBe(-55);
    });

    it('should handle device with missing name', () => {
      const scanCallback = mockManager.startDeviceScan.mock.calls[0][2];

      const device = {
        id: 'unnamed-device',
        name: null,
        rssi: -60,
        localName: null,
      };

      scanCallback(null, device);

      const devices = BLEManager.getDiscoveredDevices();
      expect(devices.length).toBe(1);
      expect(devices[0].name).toBeNull();
    });
  });

  describe('listeners', () => {
    beforeEach(async () => {
      await BLEManager.init();
    });

    it('should notify scan listeners when device is discovered', async () => {
      const scanListener = jest.fn();
      BLEManager.addScanListener(scanListener);

      await BLEManager.startScanning();
      const scanCallback = mockManager.startDeviceScan.mock.calls[0][2];

      const device = {
        id: 'test-device',
        name: 'Test Device',
        rssi: -60,
        localName: 'Test',
      };

      scanCallback(null, device);

      expect(scanListener).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-device',
          rssi: -60,
        }),
      );
    });

    it('should notify state listeners when scanning state changes', async () => {
      const stateListener = jest.fn();
      BLEManager.addStateListener(stateListener);

      await BLEManager.startScanning();

      expect(stateListener).toHaveBeenCalledWith(
        expect.objectContaining({
          isScanning: true,
        }),
      );
    });

    it('should remove scan listener', async () => {
      const scanListener = jest.fn();
      BLEManager.addScanListener(scanListener);
      BLEManager.removeScanListener(scanListener);

      await BLEManager.startScanning();
      const scanCallback = mockManager.startDeviceScan.mock.calls[0][2];

      const device = {
        id: 'test-device',
        name: 'Test Device',
        rssi: -60,
        localName: 'Test',
      };

      scanCallback(null, device);

      expect(scanListener).not.toHaveBeenCalled();
    });

    it('should handle errors in listeners gracefully', async () => {
      const errorListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const normalListener = jest.fn();

      BLEManager.addScanListener(errorListener);
      BLEManager.addScanListener(normalListener);

      await BLEManager.startScanning();
      const scanCallback = mockManager.startDeviceScan.mock.calls[0][2];

      const device = {
        id: 'test-device',
        name: 'Test Device',
        rssi: -60,
        localName: 'Test',
      };

      scanCallback(null, device);

      expect(errorListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalled();
    });
  });

  describe('connection management', () => {
    beforeEach(async () => {
      await BLEManager.init();
    });

    it('should connect to a device', async () => {
      const deviceId = 'test-device-id';
      const device = await BLEManager.connectToDevice(deviceId);

      expect(device).not.toBeNull();
      expect(mockManager.connectToDevice).toHaveBeenCalledWith(deviceId);
      expect(device?.discoverAllServicesAndCharacteristics).toHaveBeenCalled();
    });

    it('should disconnect from a device', async () => {
      const deviceId = 'test-device-id';

      await BLEManager.disconnectFromDevice(deviceId);

      expect(mockManager.cancelDeviceConnection).toHaveBeenCalledWith(deviceId);
    });

    it('should check if device is connected', async () => {
      const deviceId = 'test-device-id';

      const isConnected = await BLEManager.isDeviceConnected(deviceId);

      expect(mockManager.isDeviceConnected).toHaveBeenCalledWith(deviceId);
      expect(typeof isConnected).toBe('boolean');
    });

    it('should read profile from connected device', async () => {
      const device = await BLEManager.connectToDevice('test-device');

      if (device) {
        const profile = await BLEManager.readProfile(device);

        expect(profile).not.toBeNull();
        expect(profile?.userId).toBe('mockUserId123');
        expect(profile?.displayName).toBe('Mock User');
        expect(device.readCharacteristicForService).toHaveBeenCalled();
      }
    });

    it('should write handshake data to connected device', async () => {
      const device = await BLEManager.connectToDevice('test-device');

      if (device) {
        const handshakeData = {
          userId: 'myUserId',
          displayName: 'My Name',
          ecdhPublicKey: 'mockPublicKey',
        };

        const success = await BLEManager.writeHandshake(device, handshakeData);

        expect(success).toBe(true);
        expect(device.writeCharacteristicWithResponseForService).toHaveBeenCalled();
      }
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources on destroy', async () => {
      await BLEManager.init();
      await BLEManager.startScanning();

      BLEManager.destroy();

      expect(mockManager.stopDeviceScan).toHaveBeenCalled();
      expect(mockManager.destroy).toHaveBeenCalled();
    });
  });

  describe('state management', () => {
    it('should return current state', async () => {
      await BLEManager.init();

      const state = BLEManager.getState();

      expect(state).toHaveProperty('isScanning');
      expect(state).toHaveProperty('isAdvertising');
      expect(state).toHaveProperty('discoveredDevices');
    });

    it('should return discovered devices as array', async () => {
      await BLEManager.init();
      await BLEManager.startScanning();

      const scanCallback = mockManager.startDeviceScan.mock.calls[0][2];

      scanCallback(null, {id: 'device1', name: 'Device 1', rssi: -60});
      scanCallback(null, {id: 'device2', name: 'Device 2', rssi: -65});

      const devices = BLEManager.getDiscoveredDevices();

      expect(Array.isArray(devices)).toBe(true);
      expect(devices.length).toBe(2);
    });
  });
});
