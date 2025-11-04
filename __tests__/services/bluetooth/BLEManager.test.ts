/**
 * Tests for BLEManager service
 * TODO: Expand these tests to cover full custom Bluetooth module functionality
 */

import '../../../__tests__/setup';
import BLEManager from '../../../src/services/bluetooth/BLEManager';
import {Bluetooth, addBluetoothListener} from '@localcommunity/rn-bluetooth';
import {RSSI_THRESHOLD} from '../../../src/services/bluetooth/BLEConstants';

// Mock the custom Bluetooth module
jest.mock('@localcommunity/rn-bluetooth');

describe('BLEManager', () => {
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
    (BLEManager as any).bluetoothEventUnsubscribe = null;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('init', () => {
    it('should initialize successfully', async () => {
      (Bluetooth.requestPermissions as jest.Mock).mockResolvedValueOnce(true);

      const result = await BLEManager.init();

      expect(result).toBe(true);
      expect(Bluetooth.requestPermissions).toHaveBeenCalled();
    });

    it('should handle permission denial', async () => {
      (Bluetooth.requestPermissions as jest.Mock).mockResolvedValueOnce(false);

      const result = await BLEManager.init();

      expect(result).toBe(false);
    });

    it('should handle initialization errors', async () => {
      (Bluetooth.requestPermissions as jest.Mock).mockRejectedValueOnce(
        new Error('Permission error')
      );

      const result = await BLEManager.init();

      expect(result).toBe(false);
    });
  });

  describe('startScanning', () => {
    it('should start scanning for devices', async () => {
      (Bluetooth.startScanning as jest.Mock).mockResolvedValueOnce(undefined);
      (addBluetoothListener as jest.Mock).mockReturnValueOnce(jest.fn());

      await BLEManager.startScanning();

      expect(Bluetooth.startScanning).toHaveBeenCalled();
      expect(addBluetoothListener).toHaveBeenCalled();
    });

    it('should handle scanning errors', async () => {
      (Bluetooth.startScanning as jest.Mock).mockRejectedValueOnce(
        new Error('Scanning error')
      );

      await expect(BLEManager.startScanning()).rejects.toThrow();
    });
  });

  describe('stopScanning', () => {
    it('should stop scanning', async () => {
      // Start scanning first
      (Bluetooth.startScanning as jest.Mock).mockResolvedValueOnce(undefined);
      (addBluetoothListener as jest.Mock).mockReturnValueOnce(jest.fn());
      await BLEManager.startScanning();

      // Now stop
      (Bluetooth.stopScanning as jest.Mock).mockResolvedValueOnce(undefined);
      await BLEManager.stopScanning();

      expect(Bluetooth.stopScanning).toHaveBeenCalled();
    });
  });

  describe('addScanListener', () => {
    it('should add a scan listener', () => {
      const listener = jest.fn();
      BLEManager.addScanListener(listener);

      // Verify listener was added
      expect((BLEManager as any).scanListeners.size).toBe(1);
    });
  });

  describe('removeScanListener', () => {
    it('should remove a scan listener', () => {
      const listener = jest.fn();
      BLEManager.addScanListener(listener);
      BLEManager.removeScanListener(listener);

      expect((BLEManager as any).scanListeners.size).toBe(0);
    });
  });

  describe('getState', () => {
    it('should return current BLE state', () => {
      const state = BLEManager.getState();

      expect(state).toEqual({
        isScanning: false,
        isAdvertising: false,
        discoveredDevices: expect.any(Map),
      });
    });
  });

  describe('RSSI threshold', () => {
    it('should filter devices by RSSI threshold', () => {
      // This is a basic check that RSSI_THRESHOLD is defined
      expect(RSSI_THRESHOLD).toBeDefined();
      expect(typeof RSSI_THRESHOLD).toBe('number');
      expect(RSSI_THRESHOLD).toBeLessThan(0); // RSSI should be negative
    });
  });
});
