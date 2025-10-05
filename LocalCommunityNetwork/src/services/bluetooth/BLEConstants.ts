/**
 * BLE Constants - UUIDs and configuration for Bluetooth service
 */

// Custom service UUID for Local Community Network
// Generated using: uuidgen (or any UUID v4 generator)
export const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';

// Characteristic UUIDs
export const CHARACTERISTIC_PROFILE_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Read: User profile data
export const CHARACTERISTIC_HANDSHAKE_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Write: Connection handshake

// BLE Configuration
export const RSSI_THRESHOLD = -70; // dBm - proximity threshold (1-3 meters)
export const SCAN_TIMEOUT = 30000; // 30 seconds
export const DEVICE_EXPIRY_TIME = 10000; // 10 seconds - remove devices not seen recently

// Advertising configuration
export const ADVERTISE_TX_POWER_LEVEL = 'Medium'; // Options: Low, Medium, High, Ultra
export const ADVERTISE_MODE = 'LowPower'; // Options: LowPower, Balanced, LowLatency

// Connection timeouts
export const CONNECTION_TIMEOUT = 10000; // 10 seconds
export const MTU_SIZE = 512; // Maximum transmission unit size
