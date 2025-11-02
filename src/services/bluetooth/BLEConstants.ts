/**
 * BLE Constants - UUIDs and configuration for Bluetooth service
 *
 * ⚠️ PRODUCTION WARNING:
 * MANUFACTURER_ID (0x1337) is TEST ONLY
 * Must obtain official Company Identifier from Bluetooth SIG before production release
 * See: docs/BLE_PRODUCTION_READINESS.md
 */

// ============================================
// GATT Service Schema
// ============================================

// Custom service UUID for Local Community Network
// Generated using: uuidgen (or any UUID v4 generator)
export const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';

// Characteristic UUIDs
export const CHARACTERISTIC_PROFILE_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Read: User profile data
export const CHARACTERISTIC_HANDSHAKE_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Write + Notify: Connection handshake

// ============================================
// Discovery Configuration
// ============================================

// BLE Discovery Parameters
export const RSSI_THRESHOLD = -80; // dBm - proximity threshold (~5 meters, reduces noise)
export const SCAN_TIMEOUT = 30000; // 30 seconds - auto-stop scanning after this duration
export const DEVICE_EXPIRY_TIME = 15000; // 15 seconds - remove devices not seen recently

// ============================================
// Advertisement Configuration
// ============================================

// Android-specific (not used on iOS)
export const ADVERTISE_TX_POWER_LEVEL = 'Medium'; // Options: Low, Medium, High, Ultra
export const ADVERTISE_MODE = 'LowPower'; // Options: LowPower, Balanced, LowLatency

// ⚠️ TEST ONLY - Replace with official Bluetooth SIG Company ID for production
// Current value 0x1337 is for development/testing only
// See: https://www.bluetooth.com/specifications/assigned-numbers/
export const MANUFACTURER_ID = 0x1337;

// Advertisement Payload Sizes
export const BROADCAST_NAME_MAX_LENGTH = 12; // Max characters from display name in advertisement
export const USER_HASH_LENGTH = 6; // Bytes reserved for hashed user identifier (first 6 of SHA-256)
export const FOLLOW_TOKEN_LENGTH = 4; // Bytes reserved for rotating follow token

// Privacy: Rotate token periodically to prevent long-term tracking
export const FOLLOW_TOKEN_ROTATION_MS = 60000; // Rotate follow token every 60 seconds

// ============================================
// Connection Configuration
// ============================================

// Connection timeouts
export const CONNECTION_TIMEOUT = 8000; // 8 seconds - GATT connection timeout (reduced from 10s for faster connections)
export const MTU_SIZE = 512; // Maximum transmission unit size for GATT operations
