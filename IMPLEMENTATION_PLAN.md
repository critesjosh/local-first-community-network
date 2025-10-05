# Local Community Network - Implementation Plan

## Executive Summary

This implementation plan outlines the development of a 1-month MVP for the Local Community Network - a privacy-first, peer-to-peer platform for discovering local events and building neighborhood connections through Bluetooth verification and end-to-end encryption.

**Timeline:** 4 weeks (October 2025)
**Target:** Working prototype with 20-30 beta users
**Core Flow:** BLE connect → post event → discover → attend

## Current Status (Updated 2025-10-04)

**Progress:** Week 2, Day 9 - BLE Connection Flow Complete

**Completed:**
- ✅ Week 1: Core Foundation & Identity System (100%)
  - Project setup with React Native, TypeScript, navigation
  - Ed25519 cryptographic identity system
  - Secure key storage (iOS Keychain/Android KeyStore)
  - SQLite database and models
  - Onboarding flow with identity creation
  - Basic UI screens and components
  - Bluetooth foundation with scanning and RSSI filtering

- ✅ Week 2, Days 8-9: BLE Connection Flow (100%)
  - ECDH key exchange using secp256k1
  - BLE device connection management
  - Profile and handshake data exchange
  - ConnectionService for peer connection management
  - Comprehensive test suite (134 tests passing)

**In Progress:**
- Week 2, Days 10-11: Connection UI & Management

**Next Up:**
- Connection UI with scanning and device discovery
- Event posting system with encryption

**Test Status:** 134/134 passing ✅

## Technology Stack

### Mobile Application

- **Framework:** React Native 0.72+ with TypeScript
- **State Management:** Zustand for local state
- **Database:** SQLite with react-native-sqlite-storage
- **Crypto Libraries:**
  - @noble/ed25519 for identity keys
  - @noble/secp256k1 for ECDH key exchange
  - react-native-crypto for AES-256-GCM
- **BLE:** react-native-ble-plx
- **Storage:**
  - react-native-keychain (iOS/Android secure storage)
  - @react-native-async-storage/async-storage

### Backend (Minimal for MVP)

- **Framework:** Express.js
- **Database:** PostgreSQL for encrypted blob storage
- **Deployment:** Single VPS or Railway.app
- **Note:** MVP focuses on peer-to-peer sync via BLE, server is optional

## Week 1: Core Foundation & Identity System ✅

### Day 1-2: Project Setup ✅

- [x] Initialize React Native project with TypeScript
- [x] Configure development environment (iOS/Android)
- [x] Set up ESLint, Prettier, and Git hooks
- [x] Create basic folder structure:
  ```
  src/
    components/
    screens/
    services/
    crypto/
    storage/
    types/
    utils/
  ```
- [x] Install core dependencies
- [x] Set up basic navigation (React Navigation)

### Day 3-4: Cryptographic Identity System ✅

- [x] Implement Ed25519 key generation service
- [x] Create secure key storage service using Keychain/KeyStore
- [x] Build identity creation flow:
  - Generate keypair on first launch
  - Derive user ID from public key (base58)
  - Store keys securely
- [x] Create Profile service:
  - Name and photo storage
  - Local SQLite database setup
  - Profile CRUD operations

### Day 5: Basic UI & Navigation ✅

- [x] Create app shell with bottom tab navigation
- [x] Implement screens:
  - Home/Feed screen (placeholder)
  - Connections screen (placeholder)
  - Profile screen
  - Settings screen
- [x] Build onboarding flow (4 screens)
- [x] Create reusable UI components:
  - Button, Input, Card, Avatar

### Day 6-7: Bluetooth Foundation ✅

- [x] Set up react-native-ble-plx
- [x] Request Bluetooth permissions
- [x] Create BLE service with custom UUID
- [x] Implement BLE advertising when in "Connect" mode
- [x] Basic BLE scanning functionality
- [x] RSSI filtering (>-70 dBm for proximity)

## Week 2: Bluetooth Verification & Event System

### Day 8-9: Complete BLE Connection Flow ✅

- [x] Build connection handshake protocol:
  - Device A advertises with profile data
  - Device B scans and discovers
  - Exchange public keys via BLE characteristic
  - Both users confirm connection
- [x] Create Connection model and storage
- [x] Implement ECDH key derivation for shared secrets
- [x] Store connections in SQLite
- [x] Added ConnectionService for managing peer connections
- [x] Implemented BLE device connection/disconnection
- [x] Added profile and handshake data exchange via BLE characteristics
- [x] Comprehensive test coverage (134 tests passing)

### Day 10-11: Connection UI & Management

- [ ] Create "Connect" screen with:
  - Large connect button
  - Scanning animation
  - Device list with RSSI indicators
  - Connection confirmation dialog
- [ ] Build connections list screen
- [ ] Add connection details view
- [ ] Implement disconnect functionality

### Day 12-13: Event Posting System

- [ ] Create Event data model
- [ ] Build "Create Event" screen:
  - Title input (required)
  - Date/time picker (required)
  - Location input (optional)
  - Description textarea (optional)
  - Photo capture/selection (single)
- [ ] Implement hybrid encryption:
  - Generate random AES-256 key for event (once)
  - Encrypt event content with this key (single encryption)
  - For each connection:
    - Compute recipient lookup ID: HMAC(sharedSecret, postID)
    - Wrap the event key with connection's shared secret
  - Store: {encryptedContent, wrappedKeys: {lookupID: wrappedKey, ...}}
  - Privacy: Server cannot learn social graph (no userIDs in wrappedKeys)
  - Efficiency: 77x smaller than encrypting content per recipient
- [ ] Store encrypted events locally

### Day 14: Event Feed & Discovery

- [ ] Build event feed screen:
  - Chronological list view
  - Event cards with all details
  - Pull-to-refresh
- [ ] Implement event decryption:
  - For each post, iterate through connections:
    - Compute HMAC(sharedSecret, postID)
    - Check if wrappedKeys[HMAC] exists
    - If found, unwrap to get post key
    - Decrypt content and stop (early termination)
  - Performance: <100 connections × <100 posts = ~25ms (imperceptible)
  - Cache decrypted posts to avoid recomputation
- [ ] Add "I'm Going" RSVP functionality
- [ ] Show attendee counts

## Week 3: P2P Sync & Messaging

### Day 15-16: Peer-to-Peer Sync via BLE

- [ ] Create sync protocol for nearby devices:
  - Detect nearby connections via BLE
  - Exchange event lists (IDs and timestamps)
  - Transfer missing events
  - Handle conflicts (last-write-wins)
- [ ] Implement background sync when app is open
- [ ] Add manual sync trigger (pull-to-refresh)

### Day 17-18: Direct Messaging (Simplified)

- [ ] Create Message model and storage
- [ ] Build chat screen:
  - Message list
  - Input field
  - Send button
- [ ] Implement AES-256-GCM encryption with shared secrets
- [ ] Store messages locally in SQLite
- [ ] P2P message sync via BLE when nearby

### Day 19-20: Testing & Bug Fixes

- [ ] Test complete connection flow
- [ ] Verify encryption/decryption
- [ ] Test P2P sync between devices
- [ ] Fix critical bugs
- [ ] Performance optimization

### Day 21: Polish & UX Improvements

- [ ] Add loading states
- [ ] Implement error handling
- [ ] Create empty states
- [ ] Add basic animations
- [ ] Improve visual design

## Week 4: Final Polish & Beta Launch

### Day 22-23: Advanced Features & Settings

- [ ] Implement settings screen:
  - View connections list
  - Disconnect from users
  - Clear all data
  - About section
- [ ] Add connection notes feature
- [ ] Implement data export (JSON)

### Day 24-25: Security Hardening

- [ ] Security audit of crypto implementation
- [ ] Add input validation
- [ ] Implement rate limiting
- [ ] Test key storage security
- [ ] Verify no plaintext logging

### Day 26-27: Beta Testing Preparation

- [ ] Create TestFlight/Play Console builds
- [ ] Write beta testing instructions
- [ ] Set up crash reporting (Sentry)
- [ ] Create feedback collection mechanism
- [ ] Prepare onboarding materials

### Day 28: Launch Day

- [ ] Deploy to beta testers
- [ ] Host "Founding Block Party" event
- [ ] On-site user onboarding
- [ ] Collect initial feedback
- [ ] Monitor for critical issues

## File Structure

```
local-first-community-network/
├── src/
│   ├── components/
│   │   ├── common/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   └── Card.tsx
│   │   ├── events/
│   │   │   ├── EventCard.tsx
│   │   │   └── EventForm.tsx
│   │   └── connections/
│   │       ├── ConnectionCard.tsx
│   │       └── ConnectionScanner.tsx
│   ├── screens/
│   │   ├── HomeScreen.tsx
│   │   ├── ConnectionsScreen.tsx
│   │   ├── CreateEventScreen.tsx
│   │   ├── ProfileScreen.tsx
│   │   └── SettingsScreen.tsx
│   ├── services/
│   │   ├── bluetooth/
│   │   │   ├── BLEManager.ts
│   │   │   └── ConnectionProtocol.ts
│   │   ├── crypto/
│   │   │   ├── KeyManager.ts
│   │   │   ├── Encryption.ts
│   │   │   └── ECDH.ts
│   │   ├── storage/
│   │   │   ├── Database.ts
│   │   │   ├── SecureStorage.ts
│   │   │   └── EventStorage.ts
│   │   └── sync/
│   │       └── P2PSync.ts
│   ├── types/
│   │   ├── models.ts
│   │   └── crypto.ts
│   └── utils/
│       ├── base58.ts
│       └── constants.ts
├── ios/
├── android/
├── package.json
└── tsconfig.json
```

## Critical Success Factors

### Must Complete (Week 1-2)

1. **Identity System**: Ed25519 key generation and secure storage
2. **BLE Connection**: Working Bluetooth verification between devices
3. **Basic UI**: Navigable app with core screens

### Must Complete (Week 3)

1. **Event Creation**: Encrypted event posting
2. **Event Discovery**: Feed showing decrypted events
3. **P2P Sync**: Events sync between nearby devices

### Nice to Have (Week 4)

1. **Direct Messaging**: Basic encrypted chat
2. **Polish**: Animations and refined UX
3. **Settings**: User management features

## Risk Mitigation

### Technical Risks

- **BLE Complexity**: Use simple characteristic-based exchange, no GATT server
- **Crypto Implementation**: Use well-tested libraries, no custom crypto
- **P2P Sync**: Simple last-write-wins, no complex CRDTs for MVP

### Timeline Risks

- **Scope Creep**: Strictly follow MVP scope, defer all "nice to have"
- **Platform Issues**: Focus on one platform (iOS) first if needed
- **Testing Time**: Allocate full week 4 for testing and fixes

## Development Priorities

### P0 - Launch Blockers

- Identity creation and key storage
- BLE connection and verification
- Event creation and encryption
- Event feed and decryption
- Basic P2P sync

### P1 - Important but not Critical

- Direct messaging
- Connection notes
- Photo support
- RSVP functionality

### P2 - Nice to Have

- Animations
- Advanced error handling
- Data export
- Multiple photo support

## Testing Strategy

### Unit Tests (Ongoing)

- Crypto functions
- Key derivation
- Database operations

### Integration Tests (Week 3)

- BLE connection flow
- Event encryption/decryption
- P2P sync protocol

### User Testing (Week 4)

- 5-10 internal testers
- 20-30 beta users
- Focus on core flow completion

## Launch Checklist

### Technical

- [ ] All P0 features working
- [ ] No critical security issues
- [ ] <5% crash rate
- [ ] Successful P2P sync

### Product

- [ ] Onboarding flow complete
- [ ] Core flow works end-to-end
- [ ] Beta feedback mechanism ready

### Community

- [ ] 20+ beta testers recruited
- [ ] Launch event planned
- [ ] Support channel created

## Success Metrics

### Week 1

- Working identity system
- Basic app navigation

### Week 2

- 2+ successful BLE connections
- 5+ encrypted events created

### Week 3

- Successful P2P sync between devices
- 10+ test events in system

### Week 4

- 20+ beta users onboarded
- 1+ real event coordinated
- <5% crash rate

## Next Steps After MVP

### Month 2

- iOS and Android polish
- Cloud backup (encrypted)
- Push notifications
- Group events

### Month 3

- Multi-device sync
- Advanced messaging (Signal Protocol)
- Event reminders
- Search and filtering

### Future

- Web companion app
- Community moderation tools
- Event categories
- Location-based features
