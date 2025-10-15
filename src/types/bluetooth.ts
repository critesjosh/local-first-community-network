/**
 * Bluetooth type definitions
 */

import {Device} from 'react-native-ble-plx';

export interface DiscoveredDevice {
  id: string;
  name: string | null;
  rssi: number;
  device: Device;
  lastSeen: Date;
}

export interface BLEConnectionState {
  isScanning: boolean;
  isAdvertising: boolean;
  discoveredDevices: Map<string, DiscoveredDevice>;
}

export interface ConnectionProfile {
  userId: string;
  displayName: string;
  publicKey: string; // base58 encoded
}

export type BLEScanListener = (device: DiscoveredDevice) => void;
export type BLEStateListener = (state: BLEConnectionState) => void;
