# CLAUDE.md - Expo Version

This file provides guidance to Claude Code when working with this Expo-based codebase.

## Project Overview

Local Community Network (Expo Version) - A privacy-first platform for discovering local events and building neighborhood connections through Bluetooth verification, end-to-end encryption, and server-based sync. This is an Expo managed workflow version migrated from the bare React Native project.

## Key Differences from Original Project

This Expo version uses managed workflow equivalents for several native modules:

### Storage Adaptations
- **SecureStorage**: Uses `expo-secure-store` instead of `react-native-keychain`
  - API: `setItemAsync(key, value)` vs `setGenericPassword(username, password, {service})`
- **Database**: Uses `expo-sqlite` (v16) instead of `react-native-sqlite-storage`
  - API: `openDatabaseAsync()`, `runAsync()`, `getAllAsync()` vs callback-based `executeSql()`

### Image Picker
- **CreateEventScreen**: Uses `expo-image-picker` instead of `react-native-image-picker`
  - Includes permission requests via `requestMediaLibraryPermissionsAsync()`

### Bluetooth
- **BLE**: Still uses `react-native-ble-plx` but requires Expo dev client for native modules
  - Run `npx expo prebuild` before testing BLE features

## Development Commands

```bash
# Start development server
npm start

# Start with dev client (required for BLE)
npm run start:dev-client

# Build native projects (required for BLE)
npm run prebuild

# Run on iOS
npm run ios

# Run on Android
npm run android

# Run tests
npm test
npm run test:watch
npm run test:coverage
```

## Testing

The project includes 171 tests covering:
- Cryptographic operations (Ed25519, ECDH, hybrid encryption)
- Storage services (adapted for Expo mocks)
- Identity management
- Screen rendering

**IMPORTANT**: Always run tests after making changes:
```bash
npm test
```

Current baseline: **171 tests** (to be verified after migration)

## Repository Structure

Same as original project, key directories:
```
src/
├── components/        # Reusable UI components
├── screens/          # Screen components (8 screens)
├── navigation/       # React Navigation setup
├── services/         # Core services
│   ├── bluetooth/    # BLE connection management
│   ├── crypto/       # Ed25519, ECDH, encryption
│   ├── storage/      # Expo-adapted storage services
│   ├── IdentityService.ts
│   └── ConnectionService.ts
├── types/           # TypeScript definitions
└── utils/           # Utility functions

__tests__/           # Test suite
__mocks__/          # Mocks (including Expo-specific)
```

## Expo-Specific Configuration

### app.json
- Permissions configured for iOS (NSBluetoothAlwaysUsageDescription, etc.)
- Android permissions array includes BLUETOOTH_SCAN, BLUETOOTH_CONNECT, etc.
- Plugins: expo-sqlite, expo-secure-store, expo-image-picker, react-native-ble-plx

### Native Module Support
For Bluetooth features, you must use Expo dev client:
```bash
# First time setup
npm run prebuild

# Then start with dev client
npm run start:dev-client
```

## API Differences Quick Reference

### SecureStorage (src/services/storage/SecureStorage.ts)
```typescript
// Expo version uses expo-secure-store
import * as SecureStore from 'expo-secure-store';

await SecureStore.setItemAsync(key, value);
const value = await SecureStore.getItemAsync(key);
await SecureStore.deleteItemAsync(key);
```

### Database (src/services/storage/Database.ts)
```typescript
// Expo version uses expo-sqlite
import * as SQLite from 'expo-sqlite';

const db = await SQLite.openDatabaseAsync('dbname');
await db.runAsync(query, params);        // INSERT/UPDATE/DELETE
const row = await db.getFirstAsync(query, params);  // SELECT first
const rows = await db.getAllAsync(query, params);   // SELECT all
```

### Image Picker (src/screens/CreateEventScreen.tsx)
```typescript
// Expo version uses expo-image-picker
import * as ImagePicker from 'expo-image-picker';

const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
const result = await ImagePicker.launchImageLibraryAsync({
  mediaTypes: ['images'],
  quality: 0.8,
  base64: true,
});
```

## Core Technologies

- **Expo SDK 54** with managed workflow
- **React Native 0.81.4** with TypeScript
- **Navigation**: React Navigation (bottom tabs + stack)
- **State**: Zustand
- **Storage**: expo-sqlite + expo-secure-store
- **BLE**: react-native-ble-plx (via dev client)
- **Crypto**: @noble/ed25519, @noble/hashes, @noble/secp256k1
- **Testing**: Jest + React Native Testing Library

## Testing Policy

**Always run tests after implementing features or making changes:**
```bash
npm test
```

If tests fail:
1. Fix the broken functionality
2. Update tests if behavior intentionally changed
3. Never commit with failing tests

## Common Issues & Solutions

### Expo-Specific Issues

**BLE not working:**
```bash
# Must use dev client for native modules
npm run prebuild
npm run start:dev-client
```

**Tests failing with Expo mocks:**
- Check `__mocks__/expo-*.js` files are present
- Verify jest.config.js includes Expo module mappings

**TypeScript errors:**
```bash
# Clear metro cache
npx expo start --clear
```

### Build Issues
```bash
# Clean build
npm run prebuild:clean

# Reset everything
rm -rf node_modules .expo android ios
npm install
npm run prebuild
```

## Key Implementation Notes

### Cryptographic Identity System
- Ed25519 key pairs for identity
- Public keys as base58-encoded user IDs
- Private keys in Expo SecureStore (iOS Keychain / Android EncryptedSharedPreferences)

### Bluetooth Implementation
- Requires `expo prebuild` and dev client
- RSSI threshold: -70 dBm for proximity
- ECDH key exchange for shared secrets

### Data Management
- SQLite with Expo's async API (v16)
- Hybrid encryption: AES-256-GCM + HMAC recipient lookup
- Server sync: POST encrypted events, GET to fetch

## Quick Reference

### Working with Identity
```typescript
import IdentityService from './src/services/IdentityService';

const hasIdentity = await IdentityService.hasIdentity();
const identity = await IdentityService.createIdentity('Name');
const user = await IdentityService.getCurrentUser();
```

### Database Operations
```typescript
import Database from './src/services/storage/Database';

await Database.init();
await Database.saveUser(user);
const connections = await Database.getConnections();
```

### Secure Storage
```typescript
import SecureStorage from './src/services/storage/SecureStorage';

await SecureStorage.storeKeyPair(keyPair);
const keyPair = await SecureStorage.getKeyPair();
const hasKeys = await SecureStorage.hasKeys();
```

## Migration Notes

This project was migrated from bare React Native to Expo. Key adaptations:
1. ✅ expo-secure-store replaces react-native-keychain
2. ✅ expo-sqlite replaces react-native-sqlite-storage
3. ✅ expo-image-picker replaces react-native-image-picker
4. ✅ Permissions configured in app.json
5. ✅ Test mocks created for Expo modules
6. ⚠️ BLE requires dev client (native module)

## Next Steps

1. Run `npm test` to verify all 171 tests pass
2. Test BLE functionality with `npm run prebuild` + dev client
3. Validate storage services work correctly with Expo APIs
4. Test image picker functionality
