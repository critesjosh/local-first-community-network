/**
 * Bluetooth type definitions
 */

import {Device} from 'react-native-ble-plx';

export interface DiscoveredDevice {
  id: string; // stable identifier for UI (broadcast hash or device id)
  deviceId: string; // underlying BLE device id used for connections
  name: string | null;
  rssi: number;
  device: Device;
  lastSeen: Date;
  broadcastPayload?: BroadcastPayload;
}

export interface BroadcastPayload {
  version: number;
  displayName: string | null;
  userHash: string;
  followToken: string;
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
  profilePhoto?: string;
}

export type BLEScanListener = (device: DiscoveredDevice) => void;
export type BLEStateListener = (state: BLEConnectionState) => void;
