/**
 * Type definitions for @localcommunity/rn-bluetooth
 */

/**
 * Advertisement payload structure
 * Parsed from manufacturer data
 */
export interface AdvertisementPayload {
  version: number;
  displayName: string | null;
  userHashHex: string; // 6 bytes as hex string (12 chars)
  followTokenHex: string; // 4 bytes as hex string (8 chars)
}

/**
 * User profile structure
 * Read from Profile characteristic
 */
export interface ConnectionProfile {
  userId: string;
  displayName: string;
  publicKey: string; // base58 encoded Ed25519 public key
  profilePhoto?: string;
}

/**
 * Follow request payload
 * Written to Handshake characteristic
 */
export interface FollowRequestPayload {
  type: 'follow-request';
  follower: {
    userId: string;
    displayName: string;
    publicKey: string; // base64 encoded
    profilePhoto?: string;
  };
  timestamp: string; // ISO 8601
}

/**
 * Bluetooth events emitted by native module
 */
export type BluetoothEvent =
  | {
      type: 'deviceDiscovered';
      deviceId: string;
      rssi: number;
      payload: AdvertisementPayload;
    }
  | {
      type: 'connectionStateChanged';
      deviceId: string;
      state: 'connecting' | 'connected' | 'disconnected' | 'failed';
    }
  | {
      type: 'followRequestReceived';
      fromDeviceId: string;
      payload: FollowRequestPayload;
    }
  | {
      type: 'connectionResponseReceived';
      fromDeviceId: string;
      payload: {
        type: string;
        status: 'accepted' | 'rejected' | 'pending';
        responder: {
          userId: string;
          displayName: string;
          publicKey: string;
          profilePhoto?: string;
        };
        timestamp: string;
      };
    }
  | {
      type: 'scanStopped';
    }
  | {
      type: 'error';
      message: string;
      code?: string;
    };

/**
 * Listener function for Bluetooth events
 */
export type BluetoothEventListener = (event: BluetoothEvent) => void;

/**
 * Constants for BLE protocol
 */
export const BLE_CONSTANTS = {
  SERVICE_UUID: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  CHARACTERISTIC_PROFILE_UUID: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  CHARACTERISTIC_HANDSHAKE_UUID: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
  MANUFACTURER_ID: 0x1337,
  RSSI_THRESHOLD: -70, // dBm
  SCAN_TIMEOUT: 30000, // ms
  CONNECTION_TIMEOUT: 10000, // ms
  USER_HASH_LENGTH: 6, // bytes
  FOLLOW_TOKEN_LENGTH: 4, // bytes
  BROADCAST_NAME_MAX_LENGTH: 12, // characters
};
