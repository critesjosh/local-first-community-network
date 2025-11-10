/**
 * Type definitions for @localcommunity/rn-bluetooth
 */

/**
 * Advertisement payload structure
 *
 * This represents the parsed data from BLE advertisements, which can come from either:
 * 1. Android devices: Manufacturer Specific Data (binary format)
 * 2. iOS devices: Local Name (string format "LCNS:name:hash:token")
 *
 * Both formats are parsed into this common structure for cross-platform compatibility.
 *
 * **Manufacturer Data Format (Android):**
 * ```
 * [Company ID: 2 bytes LE - handled by platform]
 * [version: 1 byte]
 * [nameLength: 1 byte]
 * [displayName: variable, max 12 bytes UTF-8]
 * [userHash: 6 bytes]
 * [followToken: 4 bytes]
 * ```
 *
 * **Local Name Format (iOS):**
 * ```
 * "LCNS:<displayName>:<userHashHex>:<followTokenHex>"
 * Example: "LCNS:Alice:a1b2c3d4e5f6:12345678"
 * ```
 */
export interface AdvertisementPayload {
  version: number; // Protocol version (currently 1)
  displayName: string | null; // User's display name, null if empty
  userHashHex: string; // First 6 bytes of SHA-256(userId), hex encoded (12 chars)
  followTokenHex: string; // Random 4-byte token, hex encoded (8 chars), rotates every 60s
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
 *
 * ⚠️ PRODUCTION WARNING:
 * MANUFACTURER_ID (0x1337) is TEST ONLY
 * Must obtain official Company Identifier from Bluetooth SIG before production release
 * See: docs/BLE_PRODUCTION_READINESS.md
 */
export const BLE_CONSTANTS = {
  // GATT Service and Characteristics
  SERVICE_UUID: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  CHARACTERISTIC_PROFILE_UUID: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  CHARACTERISTIC_HANDSHAKE_UUID: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',

  // ⚠️ TEST ONLY - Replace with official Company ID for production
  MANUFACTURER_ID: 0x1337,

  // Discovery and Connection Parameters
  RSSI_THRESHOLD: -70, // dBm - Signal strength threshold (~5 meters)
  SCAN_TIMEOUT: 30000, // ms - How long to scan before auto-stopping
  CONNECTION_TIMEOUT: 10000, // ms - GATT connection timeout

  // Advertisement Payload Sizes
  USER_HASH_LENGTH: 6, // bytes - First 6 bytes of SHA-256(userId)
  FOLLOW_TOKEN_LENGTH: 4, // bytes - Random rotating token
  BROADCAST_NAME_MAX_LENGTH: 12, // characters - Max display name in advertisement
};
