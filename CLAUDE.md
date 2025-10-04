# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Local Community Network is a privacy-first, peer-to-peer platform for discovering local events and building neighborhood connections through Bluetooth verification and end-to-end encryption. This is a 1-month MVP focused on proving the core concept: Bluetooth-verified connections + encrypted event discovery without relying on centralized servers.

## Repository Structure

```
.
├── LocalCommunityNetwork/          # React Native mobile app
│   ├── src/
│   │   ├── components/            # Reusable UI components
│   │   ├── screens/               # Screen components (Home, Connections, etc.)
│   │   ├── navigation/            # React Navigation setup
│   │   ├── services/              # Core services
│   │   │   ├── bluetooth/        # BLE connection management
│   │   │   ├── crypto/           # Encryption/decryption services
│   │   │   ├── storage/          # Local SQLite database
│   │   │   └── sync/             # P2P sync protocol
│   │   ├── types/                # TypeScript type definitions
│   │   └── utils/                # Utility functions
│   ├── ios/                       # iOS native code
│   └── android/                   # Android native code
├── PRD.md                         # Product Requirements Document
├── IMPLEMENTATION_PLAN.md         # 4-week development roadmap
└── package.json                   # Root package with husky hooks
```

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
4. **Storage**: Local-first with SQLite, optional encrypted cloud backup
5. **P2P Sync**: Direct device-to-device sync via BLE when nearby (no server required for MVP)

### Key Implementation Details

- **MVP Scope**: BLE-only verification, no NFC, no server dependency
- **Event Flow**: Create locally → Encrypt for connections → Sync via BLE when nearby
- **Connection Flow**: BLE advertise → Scan → Exchange keys → Mutual confirmation
- **Simplifications**: No Signal Protocol (basic AES), no CRDTs (last-write-wins), single device only

### Current Implementation Status

**Week 1 (Days 1-2) Completed:**
- ✅ React Native project setup with TypeScript
- ✅ Project folder structure created
- ✅ Core dependencies installed
- ✅ Basic navigation with 5 screens (Home, Connections, Create Event, Profile, Settings)
- ✅ Git hooks configured with husky and lint-staged

**Next Steps (Week 1, Days 3-7):**
- Implement Ed25519 key generation and secure storage
- Build Bluetooth foundation (BLE advertising/scanning)
- Create identity creation flow

## Testing

```bash
# Run all tests
npm run mobile:test

# Run tests in watch mode
cd LocalCommunityNetwork && npm test -- --watch

# Run specific test file
cd LocalCommunityNetwork && npm test -- HomeScreen.test.tsx
```

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

1. **Bluetooth Permissions**: Must request runtime permissions on both iOS and Android
2. **Key Storage**: Use Keychain (iOS) / KeyStore (Android) via react-native-keychain
3. **BLE Service UUID**: Define custom UUID for app identification during scanning
4. **RSSI Threshold**: -70 dBm for proximity detection (1-3 meters)
5. **Encryption Pattern**: Generate AES key per event, wrap with connection's shared secret
6. **P2P Sync**: Exchange event IDs/timestamps first, then transfer missing events

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

## Key Files to Understand

- `LocalCommunityNetwork/src/navigation/AppNavigator.tsx` - Main app navigation structure
- `LocalCommunityNetwork/App.tsx` - App entry point
- `PRD.md` - Detailed product requirements and user stories
- `IMPLEMENTATION_PLAN.md` - Day-by-day development roadmap