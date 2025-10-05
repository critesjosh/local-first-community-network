# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Local Community Network is a privacy-first platform for discovering local events and building neighborhood connections through Bluetooth verification, end-to-end encryption, and a simple server backend. This is a 1-month MVP focused on proving the core concept: Bluetooth-verified connections + encrypted event discovery with server-based sync.

## Repository Structure

```
.
├── LocalCommunityNetwork/          # React Native mobile app
│   ├── src/
│   │   ├── components/            # Reusable UI components
│   │   │   └── events/            # Event-related components
│   │   │       └── EventCard.tsx  # Event display card
│   │   ├── screens/               # Screen components
│   │   │   ├── HomeScreen.tsx
│   │   │   ├── ConnectionsScreen.tsx
│   │   │   ├── CreateEventScreen.tsx
│   │   │   ├── ProfileScreen.tsx
│   │   │   ├── SettingsScreen.tsx
│   │   │   └── OnboardingScreen.tsx
│   │   ├── navigation/            # React Navigation setup
│   │   ├── services/              # Core services
│   │   │   ├── bluetooth/        # BLE connection management (planned)
│   │   │   ├── crypto/           # Cryptographic services
│   │   │   │   └── KeyManager.ts # Ed25519 key operations
│   │   │   ├── storage/          # Data persistence
│   │   │   │   ├── Database.ts   # SQLite operations
│   │   │   │   └── SecureStorage.ts # Keychain storage
│   │   │   ├── IdentityService.ts # Identity management
│   │   │   ├── api/              # Server API client (planned)
│   │   │   └── sync/             # Future: P2P BLE sync (deferred to Month 2)
│   │   ├── types/                # TypeScript definitions
│   │   │   ├── crypto.ts         # Crypto type definitions
│   │   │   ├── models.ts         # Data models
│   │   │   └── navigation.ts     # Navigation types
│   │   └── utils/                # Utility functions
│   │       ├── base58.ts         # Base58 encoding
│   │       └── crypto.ts         # Crypto utilities
│   ├── __tests__/                # Test suite
│   │   ├── services/             # Service tests
│   │   ├── utils/                # Utility tests
│   │   └── setup.ts              # Test configuration
│   ├── ios/                      # iOS native code
│   └── android/                  # Android native code
├── PRD.md                        # Product Requirements Document
├── IMPLEMENTATION_PLAN.md        # 4-week development roadmap
├── TESTING.md                    # Testing documentation
└── package.json                  # Root package with scripts
```

## ⚠️ IMPORTANT: Testing Policy

**Always run tests after implementing new features or making changes:**
```bash
npm run mobile:test
```

If any tests fail after your changes:
1. Fix the broken functionality
2. Update tests if the behavior intentionally changed
3. Never commit with failing tests

Current test baseline: **171 tests passing (100%)**

## Development Commands

### Mobile App Development

From the root directory:
```bash
# Install dependencies
npm run mobile:install

# Start Metro bundler
npm run mobile:start

# Run on iOS (requires Mac with Xcode)
npm run mobile:ios

# Run on Android (requires Android Studio/emulator)
npm run mobile:android

# Run linting
npm run mobile:lint

# Run tests
npm run mobile:test
```

From LocalCommunityNetwork directory:
```bash
# iOS-specific setup (first time only)
cd ios && pod install && cd ..

# Run with specific device
npx react-native run-ios --device "iPhone 15 Pro"
npx react-native run-android --deviceId emulator-5554

# Clear caches
npx react-native start --reset-cache
cd android && ./gradlew clean && cd ..
```

## Architecture & Key Concepts

### Core Technologies

- **React Native 0.81.4** with TypeScript
- **Zustand** for state management (lightweight, no boilerplate)
- **SQLite** for local encrypted storage
- **react-native-ble-plx** for Bluetooth Low Energy connections
- **@noble/ed25519** for cryptographic identity (Ed25519 key pairs)
- **@noble/secp256k1** for ECDH key exchange
- **react-native-keychain** for secure key storage

### Privacy Architecture

1. **Identity System**: Ed25519 key pairs generated on-device, never leave device
2. **Connection Protocol**: Bluetooth proximity verification (RSSI > -70 dBm)
3. **Encryption**: All events/messages encrypted with AES-256-GCM using shared secrets from ECDH
4. **Storage**: Local-first with SQLite cache, server for sync
5. **Server Sync**: REST API for posting/fetching encrypted data (server cannot decrypt)

### Key Implementation Details

- **MVP Scope**: BLE for verification, simple REST API server for sync
- **Identity System**: Ed25519 key pairs with base58-encoded public keys as user IDs
- **Secure Storage**: Private keys stored in iOS Keychain / Android KeyStore
- **Database Schema**: SQLite with tables for users, connections, events, messages
- **Event Flow**: Create locally → Encrypt for connections → POST to server → Others GET from server
- **Connection Flow**: BLE advertise → Scan → Exchange keys → Mutual confirmation
- **Simplifications**: No Signal Protocol (basic AES), no CRDTs (last-write-wins), single device only, poll-based refresh

### Current Implementation Status

**Week 1 Completed:**
- ✅ React Native project setup with TypeScript
- ✅ Project folder structure created
- ✅ Core dependencies installed
- ✅ Basic navigation with 5 screens (Home, Connections, Create Event, Profile, Settings)
- ✅ Git hooks configured with husky and lint-staged
- ✅ Ed25519 key generation and cryptographic identity system
- ✅ Secure key storage using device keychain
- ✅ SQLite database service with full schema
- ✅ Identity creation flow with 4-step onboarding
- ✅ Comprehensive test suite (164 tests, all passing)
- ✅ Hybrid encryption with HMAC recipient lookup
- ✅ BLE connection flow with ECDH key exchange

**Week 2 Completed (Days 8-14):**
- ✅ BLE connection UI and management
  - ConnectionScanScreen with device discovery
  - ConnectionsScreen with connections list
  - ConnectionDetailScreen with disconnect functionality
- ✅ Event posting system
  - CreateEventScreen with full form (title, date/time, location, description, photo)
  - Integration with EncryptionService for hybrid encryption
  - Date/time picker and image picker integration
  - Form validation and error handling
- ✅ Event feed and discovery
  - HomeScreen with event list and decryption
  - EventCard component for displaying events
  - Pull-to-refresh functionality
  - RSVP functionality (UI only)
  - Chronological sorting
- ✅ Test coverage expanded to 171 tests (all passing)
  - Screen rendering tests added
  - Component tests added

**Week 3 Next Steps:**
- Implement server backend (Express.js + PostgreSQL)
- Build API client for server sync
- Direct messaging
- Testing and polish

## Testing

### Test Suite Overview
The project includes 171 tests covering cryptographic operations, hybrid encryption, secure storage, identity management, and screen rendering.

```bash
# Run all tests
npm run mobile:test

# Run tests in watch mode
npm run mobile:test:watch

# Generate coverage report
npm run mobile:test:coverage

# Run specific test file
cd LocalCommunityNetwork && npm test -- KeyManager

# Run tests matching pattern
cd LocalCommunityNetwork && npm test -- --testPathPattern=crypto
```

### Test Files
- `__tests__/services/crypto/KeyManager.test.ts` - Ed25519 operations
- `__tests__/services/crypto/EncryptionService.test.ts` - Hybrid encryption
- `__tests__/services/crypto/ECDH.test.ts` - ECDH key exchange
- `__tests__/services/bluetooth/BLEManager.test.ts` - BLE operations
- `__tests__/services/storage/SecureStorage.test.ts` - Keychain storage
- `__tests__/services/storage/Database.test.ts` - SQLite operations
- `__tests__/services/IdentityService.test.ts` - Identity management
- `__tests__/screens/CreateEventScreen.test.tsx` - Event creation UI
- `__tests__/screens/HomeScreen.test.tsx` - Event feed UI
- `__tests__/utils/base58.test.ts` - Base58 encoding
- `__tests__/utils/crypto.test.ts` - Crypto utilities
- `__tests__/App.test.tsx` - App initialization

See `LocalCommunityNetwork/TESTING.md` for comprehensive testing documentation.

## Code Style & Linting

Pre-commit hooks automatically run ESLint and Prettier on staged files. Manual commands:

```bash
# Check linting
npm run mobile:lint

# Fix linting issues
cd LocalCommunityNetwork && npx eslint . --fix

# Format code
cd LocalCommunityNetwork && npx prettier --write "src/**/*.{ts,tsx}"
```

## Important Implementation Notes

### Cryptographic Identity System
1. **Key Generation**: Ed25519 key pairs generated using `@noble/ed25519`
2. **User IDs**: Public keys encoded as base58 strings for human-readable IDs
3. **Key Storage**: Private keys stored in iOS Keychain / Android KeyStore via `react-native-keychain`
4. **Identity Persistence**: User profiles stored in SQLite, keys in secure storage
5. **Signature Operations**: All events/messages signed with private key for authenticity

### Bluetooth Implementation (Completed)
1. **Permissions**: Runtime permissions requested on both iOS and Android
2. **BLE Service UUID**: Custom UUID for app identification during scanning
3. **RSSI Threshold**: -70 dBm for proximity detection (1-3 meters)
4. **Connection Protocol**: Exchange public keys, verify proximity, establish shared secret via ECDH

### Data Management
1. **Database Schema**: 5 tables - users, connections, events, messages, app_state
2. **Encryption Pattern**: Hybrid encryption - generate AES key per event, wrap with HMAC(sharedSecret, postID) for each connection
3. **Server Sync**: POST encrypted events to server, GET to fetch new events (server stores blobs, cannot decrypt)
4. **Factory Reset**: `IdentityService.resetIdentity()` clears all data securely

### Development Patterns
1. **Service Pattern**: Singleton services for identity, database, crypto operations
2. **Type Safety**: All models defined in `types/` with strict TypeScript interfaces
3. **Error Handling**: Services throw specific errors, screens handle gracefully
4. **Test-Driven Development**:
   - Write tests for new features
   - Run full test suite before committing
   - Maintain 100% pass rate (171/171 tests)
   - Never merge code with failing tests
   - Screen tests focus on rendering and structure
   - Integration tests for service interactions
   - E2E tests for full user flows (future)

## Common Issues & Solutions

### iOS Build Issues
```bash
# Clean build
cd ios && rm -rf Pods Podfile.lock && pod install && cd ..
cd ios && xcodebuild clean && cd ..

# Reset Metro bundler
npx react-native start --reset-cache
```

### Android Build Issues
```bash
# Clean gradle
cd android && ./gradlew clean && cd ..

# If gradle wrapper missing
cd android && gradle wrapper && cd ..
```

### Node Modules Issues
```bash
# Complete reset
rm -rf node_modules package-lock.json
rm -rf LocalCommunityNetwork/node_modules LocalCommunityNetwork/package-lock.json
npm run mobile:install
```

## Quick Reference

### Creating a New Feature
1. Define types in `src/types/`
2. Create service in `src/services/` if needed
3. Build UI component in `src/components/` or screen in `src/screens/`
4. Write tests in `__tests__/`
5. Update navigation if adding new screen
6. **IMPORTANT: Run `npm run mobile:test` after implementation to ensure nothing breaks**

### Working with Identity
```typescript
import IdentityService from '../services/IdentityService';

// Check if user has identity
const hasIdentity = await IdentityService.hasIdentity();

// Create new identity
const identity = await IdentityService.createIdentity('Display Name');

// Get current user
const user = await IdentityService.getCurrentUser();

// Sign data
const signature = await IdentityService.signData(data);
```

### Database Operations
```typescript
import Database from '../services/storage/Database';

// Save user
await Database.saveUser(user);

// Get connections
const connections = await Database.getConnections();

// Save event
await Database.saveEvent(event);
```

### Secure Storage
```typescript
import SecureStorage from '../services/storage/SecureStorage';

// Check for keys
const hasKeys = await SecureStorage.hasKeys();

// Store sensitive data
await SecureStorage.storeSecureData('key', 'value');
```

## Key Files to Understand

### Core Application
- `LocalCommunityNetwork/App.tsx` - App entry point with navigation
- `LocalCommunityNetwork/src/navigation/AppNavigator.tsx` - Main navigation structure
- `LocalCommunityNetwork/src/screens/OnboardingScreen.tsx` - Identity creation flow

### Cryptographic Identity System
- `LocalCommunityNetwork/src/services/crypto/KeyManager.ts` - Ed25519 key operations
- `LocalCommunityNetwork/src/services/storage/SecureStorage.ts` - Keychain integration
- `LocalCommunityNetwork/src/services/storage/Database.ts` - SQLite database service
- `LocalCommunityNetwork/src/services/IdentityService.ts` - Main identity management

### Documentation
- `PRD.md` - Detailed product requirements and user stories
- `IMPLEMENTATION_PLAN.md` - Day-by-day development roadmap
- `LocalCommunityNetwork/TESTING.md` - Comprehensive testing guide
- `README.md` - Project overview and getting started