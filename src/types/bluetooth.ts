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
  publicKey: string; // base64 encoded
  profilePhoto?: string;
}

/**
 * Connection request sent from requester to responder
 */
export interface ConnectionRequest {
  type: 'connection-request';
  requester: {
    userId: string; // base58 public key
    displayName: string;
    publicKey: string; // base64 encoded for JSON transmission
    profilePhoto?: string;
  };
  timestamp: string; // ISO string
}

/**
 * Connection response sent from responder back to requester
 */
export interface ConnectionResponse {
  type: 'connection-response';
  status: 'accepted' | 'rejected' | 'pending';
  responder: {
    userId: string; // base58 public key
    displayName: string;
    publicKey: string; // base64 encoded for JSON transmission
    profilePhoto?: string;
  };
  timestamp: string; // ISO string
}

export type BLEScanListener = (device: DiscoveredDevice) => void;
export type BLEStateListener = (state: BLEConnectionState) => void;
