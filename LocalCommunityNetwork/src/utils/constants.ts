/**
 * Application constants
 *
 * Centralized configuration for BLE, crypto, and app settings
 */

/**
 * Bluetooth Low Energy (BLE) Configuration
 */
export const BLE = {
  // Service UUID for Local Community Network
  // This identifies our app during BLE scanning
  SERVICE_UUID: '0000FE10-0000-1000-8000-00805F9B34FB',

  // Characteristic UUIDs for data exchange
  CHARACTERISTICS: {
    // For exchanging public keys during connection
    PUBLIC_KEY: '0000FE11-0000-1000-8000-00805F9B34FB',

    // For exchanging profile information (name, photo)
    PROFILE_DATA: '0000FE12-0000-1000-8000-00805F9B34FB',

    // For connection confirmation signal
    CONFIRMATION: '0000FE13-0000-1000-8000-00805F9B34FB',
  },

  // RSSI threshold for proximity detection (in dBm)
  // -70 dBm = approximately 1-3 meters
  RSSI_THRESHOLD: -70,

  // Scan timeout (milliseconds)
  SCAN_TIMEOUT: 30000, // 30 seconds

  // Connection timeout (milliseconds)
  CONNECTION_TIMEOUT: 30000, // 30 seconds

  // Device name prefix for advertising
  DEVICE_NAME_PREFIX: 'LCN',
} as const;

/**
 * Cryptography Configuration
 */
export const CRYPTO = {
  // Key sizes in bytes
  KEY_SIZES: {
    ED25519_PUBLIC: 32,
    ED25519_PRIVATE: 64,
    AES256: 32,
    IV_GCM: 12, // 96 bits for GCM
  },

  // Algorithm versions (for future upgrades)
  VERSION: {
    IDENTITY: 1,
    ENCRYPTION: 1,
    KEY_DERIVATION: 1,
  },

  // HKDF contexts for key derivation
  HKDF_INFO: {
    CONNECTION_KEY: 'connection-key-v1',
    ENCRYPTION_KEY: 'encryption-key-v1',
    AUTH_KEY: 'auth-key-v1',
  },
} as const;

/**
 * Database Configuration
 */
export const DATABASE = {
  NAME: 'localcommunity.db',
  VERSION: 1,

  // Query limits
  DEFAULT_LIMIT: 100,
  MAX_LIMIT: 500,
} as const;

/**
 * Application Configuration
 */
export const APP = {
  // Version
  VERSION: '0.0.1',

  // Privacy and security settings
  PRIVACY: {
    // Maximum connections per user (Dunbar's number × 3)
    MAX_CONNECTIONS: 500,

    // Maximum profile photo size (bytes) - 500KB
    MAX_PHOTO_SIZE: 500 * 1024,

    // Maximum event photo size (bytes) - 1MB
    MAX_EVENT_PHOTO_SIZE: 1024 * 1024,

    // Character limits
    MAX_DISPLAY_NAME_LENGTH: 50,
    MAX_BIO_LENGTH: 500,
    MAX_EVENT_TITLE_LENGTH: 100,
    MAX_EVENT_DESCRIPTION_LENGTH: 1000,
    MAX_MESSAGE_LENGTH: 5000,
    MAX_NOTES_LENGTH: 500,
  },

  // Feature flags for MVP
  FEATURES: {
    BLUETOOTH_ENABLED: true,
    NFC_ENABLED: false, // Not in MVP
    DIRECT_MESSAGING: true,
    EVENT_POSTING: true,
    CLOUD_BACKUP: false, // Post-MVP
    MULTI_DEVICE_SYNC: false, // Post-MVP
  },

  // UI Configuration
  UI: {
    // Colors (iOS-style defaults)
    COLORS: {
      PRIMARY: '#007AFF',
      BACKGROUND: '#F2F2F7',
      CARD: '#FFFFFF',
      TEXT: '#000000',
      TEXT_SECONDARY: '#8E8E93',
      BORDER: '#C6C6C8',
      ERROR: '#FF3B30',
      SUCCESS: '#34C759',
    },

    // Spacing
    SPACING: {
      XS: 4,
      SM: 8,
      MD: 16,
      LG: 24,
      XL: 32,
    },

    // Border radius
    BORDER_RADIUS: {
      SM: 8,
      MD: 12,
      LG: 16,
    },
  },
} as const;

/**
 * Validation helpers
 */
export const VALIDATION = {
  isValidDisplayName: (name: string): boolean => {
    return (
      name.length > 0 && name.length <= APP.PRIVACY.MAX_DISPLAY_NAME_LENGTH
    );
  },

  isValidEventTitle: (title: string): boolean => {
    return (
      title.length > 0 && title.length <= APP.PRIVACY.MAX_EVENT_TITLE_LENGTH
    );
  },

  isValidPhotoSize: (size: number, isProfile: boolean = true): boolean => {
    const maxSize = isProfile
      ? APP.PRIVACY.MAX_PHOTO_SIZE
      : APP.PRIVACY.MAX_EVENT_PHOTO_SIZE;
    return size > 0 && size <= maxSize;
  },

  isValidMessageLength: (length: number): boolean => {
    return length > 0 && length <= APP.PRIVACY.MAX_MESSAGE_LENGTH;
  },
} as const;

/**
 * Error messages
 */
export const ERROR_MESSAGES = {
  // BLE errors
  BLE_NOT_AVAILABLE: 'Bluetooth is not available on this device',
  BLE_NOT_ENABLED: 'Please enable Bluetooth to connect with others',
  BLE_PERMISSION_DENIED: 'Bluetooth permission is required to connect',
  BLE_SCAN_FAILED: 'Failed to scan for nearby devices',
  BLE_CONNECTION_FAILED: 'Failed to connect to device',
  BLE_CONNECTION_TIMEOUT: 'Connection timed out',

  // Crypto errors
  CRYPTO_KEY_GENERATION_FAILED: 'Failed to generate cryptographic keys',
  CRYPTO_ENCRYPTION_FAILED: 'Failed to encrypt data',
  CRYPTO_DECRYPTION_FAILED: 'Failed to decrypt data',
  CRYPTO_NO_SHARED_SECRET: 'No shared secret found for connection',

  // Database errors
  DB_INIT_FAILED: 'Failed to initialize database',
  DB_QUERY_FAILED: 'Database query failed',
  DB_NOT_FOUND: 'Record not found',

  // Identity errors
  IDENTITY_NOT_FOUND: 'No identity found',
  IDENTITY_CREATION_FAILED: 'Failed to create identity',
  IDENTITY_LOAD_FAILED: 'Failed to load identity',

  // Validation errors
  VALIDATION_DISPLAY_NAME_INVALID: 'Display name must be 1-50 characters',
  VALIDATION_PHOTO_TOO_LARGE: 'Photo is too large',
  VALIDATION_INVALID_INPUT: 'Invalid input provided',
} as const;

/**
 * Success messages
 */
export const SUCCESS_MESSAGES = {
  CONNECTION_ESTABLISHED: 'Connected successfully!',
  EVENT_CREATED: 'Event created',
  MESSAGE_SENT: 'Message sent',
  PROFILE_UPDATED: 'Profile updated',
} as const;
