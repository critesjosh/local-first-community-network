# Local Community Network - Implementation Plan

## Executive Summary

This implementation plan outlines the development of a 1-month MVP for the Local Community Network - a privacy-first platform for discovering local events and building neighborhood connections through Bluetooth verification, end-to-end encryption, and a simple server backend.

**Timeline:** 4 weeks (October 2025)
**Target:** Working prototype with 20-30 beta users
**Core Flow:** BLE connect → post event to server → fetch from server → discover → attend

## Current Status (Updated 2025-10-20)

**Progress:** Week 2+ - Custom Bluetooth Module Implementation Complete

**Completed:**
- ✅ Week 1: Core Foundation & Identity System (100%)
  - Project setup with Expo managed workflow, TypeScript, navigation
  - Ed25519 cryptographic identity system
  - Secure key storage via expo-secure-store (iOS Keychain/Android KeyStore)
  - SQLite database with expo-sqlite
  - Onboarding flow with identity creation
  - Basic UI screens and components
  - Bluetooth foundation with scanning and RSSI filtering

- ✅ Week 2, Days 8-9: BLE Connection Flow (100%)
  - ECDH key exchange using secp256k1
  - BLE device connection management
  - Profile and handshake data exchange
  - ConnectionService for peer connection management
  - Comprehensive test suite (134 tests passing)

- ✅ Week 2, Days 10-11: Connection UI & Management (100%)
  - ConnectionScanScreen with BLE scanning and device discovery
  - ConnectionsScreen with connections list
  - ConnectionDetailScreen with connection info and disconnect
  - Navigation types and screen routing
  - Disconnect functionality

- ✅ **Custom Bluetooth TurboModule** (`@localcommunity/rn-bluetooth`) (100%)
  - Complete replacement for react-native-ble-plx and react-native-ble-advertiser
  - Native iOS implementation (Swift/Objective-C) with CoreBluetooth
  - Native Android implementation (Kotlin) with BluetoothLeScanner/Advertiser
  - GATT server/client for profile exchange
  - Background operation support (iOS background modes, Android foreground service)
  - Expo config plugin for automatic permissions configuration
  - Event-driven architecture with TypeScript type safety
  - 50% smaller API surface, faster scanning, lower memory usage

- ✅ Week 2+: Service Layer Migration to Custom Module (100%)
  - BLEBroadcastService rewritten to use custom module
  - BLEManager simplified with native event handling
  - HomeScreen with automatic BLE advertising on mount
  - Bluetooth permission handling with user-friendly alerts
  - Location Services warning for Android BLE scanning
  - Test functionality for debugging scan+advertise scenarios

**In Progress:**
- Physical device testing and debugging of custom Bluetooth module
- Week 2, Days 12-13: Event Posting System (hybrid encryption implemented, UI pending)

**Next Up:**
- Test custom Bluetooth module on physical iOS/Android devices
- Create Event UI with form inputs
- Event posting system integration with UI
- Simple server backend for encrypted post storage/retrieval

**Test Status:** 171/171 passing ✅ (base test suite, Bluetooth requires physical device testing)

## Technology Stack

### Mobile Application

- **Framework:** React Native 0.81.4 with Expo SDK 54 (managed workflow) + TypeScript
- **State Management:** Zustand for local state
- **Database:** expo-sqlite (v16) with async/await API
- **Crypto Libraries:**
  - @noble/ed25519 for identity keys
  - @noble/secp256k1 for ECDH key exchange
  - @noble/hashes for SHA-256 and HMAC
  - react-native-crypto for AES-256-GCM encryption
- **BLE:** `@localcommunity/rn-bluetooth` (custom TurboModule)
  - Replaces react-native-ble-plx and react-native-ble-advertiser
  - Native iOS (Swift/Objective-C) and Android (Kotlin) implementations
  - Optimized for Local Community Network protocol
- **Storage:**
  - expo-secure-store (iOS Keychain/Android KeyStore)
  - @react-native-async-storage/async-storage
- **Image Picker:** expo-image-picker (replaces react-native-image-picker)

### Backend (Required for MVP)

- **Framework:** Express.js or Fastify
- **Database:** PostgreSQL for encrypted blob storage
- **Authentication:** Signature-based (no passwords)
- **Deployment:** Railway.app, Render, or single VPS
- **API:** Simple REST endpoints (POST/GET for events, messages, RSVPs)
- **Note:** Server stores encrypted data, cannot decrypt content

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

### Day 10-11: Connection UI & Management ✅

- [x] Create "Connect" screen with:
  - Large connect button
  - Scanning animation
  - Device list with RSSI indicators
  - Connection confirmation dialog
- [x] Build connections list screen
- [x] Add connection details view
- [x] Implement disconnect functionality
- [x] Navigation types and screen routing
- [x] All tests passing (164 tests)

### Day 12-13: Event Posting System

- [ ] Create Event data model
- [ ] Build "Create Event" screen:
  - Title input (required)
  - Date/time picker (required)
  - Location input (optional)
  - Description textarea (optional)
  - Photo capture/selection (single)
- [x] Implement hybrid encryption (COMPLETED):
  - Generate random AES-256 key for event (once)
  - Encrypt event content with this key (single encryption)
  - For each connection:
    - Compute recipient lookup ID: HMAC(sharedSecret, postID)
    - Wrap the event key with connection's shared secret
  - Store: {encryptedContent, wrappedKeys: {lookupID: wrappedKey, ...}}
  - Privacy: Server cannot learn social graph (no userIDs in wrappedKeys)
  - Efficiency: 77x smaller than encrypting content per recipient
- [x] Database support for encrypted events (COMPLETED)
- [ ] Build UI to create and submit events

### Day 14: Event Feed & Discovery (UI Only)

- [ ] Build event feed screen:
  - Chronological list view
  - Event cards with all details
  - Pull-to-refresh (will connect to server in Week 3)
- [x] Implement event decryption (COMPLETED):
  - For each post, iterate through connections:
    - Compute HMAC(sharedSecret, postID)
    - Check if wrappedKeys[HMAC] exists
    - If found, unwrap to get post key
    - Decrypt content and stop (early termination)
  - Performance: <100 connections × <100 posts = ~25ms (imperceptible)
  - Cache decrypted posts to avoid recomputation
- [ ] Add "I'm Going" RSVP functionality (UI only)
- [ ] Show attendee counts (UI only)
- [ ] Note: Server integration happens in Week 3

## Week 3: Server Backend & API Integration

### Day 15-16: Server Backend Setup

- [ ] Initialize Express.js/Fastify server project
- [ ] Set up PostgreSQL database
- [ ] Create database schema:
  - `posts` table: (id, author_id, timestamp, encrypted_content, iv, wrapped_keys_json)
  - `messages` table: (id, sender_id, recipient_id, timestamp, ciphertext, iv)
  - `rsvps` table: (id, post_id, user_id, status, timestamp)
- [ ] Implement signature-based authentication
- [ ] Create API endpoints:
  - POST /api/posts (upload encrypted event)
  - GET /api/posts?since={timestamp} (fetch new events)
  - POST /api/messages (send encrypted message)
  - GET /api/messages?conversationId={id}&since={timestamp}
  - POST /api/rsvps
  - GET /api/rsvps?postId={id}
- [ ] Deploy to Railway.app or Render

### Day 17-18: Client-Server Integration

- [ ] Create API client service in mobile app
- [ ] Implement POST event to server after local encryption
- [ ] Implement GET events from server with polling
- [ ] Add pull-to-refresh to fetch new events
- [ ] Cache fetched events in local SQLite
- [ ] Handle network errors gracefully

### Day 19: Direct Messaging (Simplified)

- [ ] Create Message model and storage
- [ ] Build chat screen:
  - Message list
  - Input field
  - Send button
- [ ] Implement AES-256-GCM encryption with shared secrets
- [ ] POST messages to server
- [ ] Poll for new messages (GET /api/messages)
- [ ] Store messages locally in SQLite

### Day 20: Testing & Bug Fixes

- [ ] Test complete flow: connect → post → fetch → decrypt
- [ ] Verify encryption/decryption with server
- [ ] Test with multiple users
- [ ] Fix critical bugs
- [ ] Performance optimization

### Day 21: Polish & UX Improvements

- [ ] Add loading states for server requests
- [ ] Implement error handling for network failures
- [ ] Create empty states
- [ ] Add basic animations
- [ ] Improve visual design
- [ ] Offline mode indicator

## Week 4: Final Polish & Beta Launch

### Day 22-23: Advanced Features & Settings

- [ ] Implement settings screen:
  - View connections list
  - Disconnect from users
  - Clear all data
  - About section
- [ ] Add connection notes feature
- [ ] Implement data export (JSON)

### Day 24-25: Security Hardening & Server

- [ ] Security audit of crypto implementation
- [ ] Add input validation to server endpoints
- [ ] Implement rate limiting on server
- [ ] Test key storage security
- [ ] Verify no plaintext logging
- [ ] Server hardening (CORS, helmet.js, etc.)
- [ ] Set up SSL certificates for production

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
- **Server Backend**: Keep it simple - basic REST API, no real-time features
- **Network Reliability**: Handle offline gracefully, cache locally

### Timeline Risks

- **Scope Creep**: Strictly follow MVP scope, defer all "nice to have"
- **Platform Issues**: Focus on one platform (iOS) first if needed
- **Testing Time**: Allocate full week 4 for testing and fixes

## Development Priorities

### P0 - Launch Blockers

- Identity creation and key storage
- BLE connection and verification
- Event creation and encryption
- Server backend with POST/GET endpoints
- Event feed and decryption
- Server sync (fetch/post encrypted data)

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
- Server API integration
- Multi-user event sharing

### User Testing (Week 4)

- 5-10 internal testers
- 20-30 beta users
- Focus on core flow completion

## Launch Checklist

### Technical

- [ ] All P0 features working
- [ ] No critical security issues
- [ ] <5% crash rate
- [ ] Server deployed and accessible
- [ ] Successful multi-user event sharing

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

- Server backend deployed and functional
- Successful multi-user event sharing via server
- 10+ test events synced across users

### Week 4

- 20+ beta users onboarded
- 1+ real event coordinated
- <5% crash rate

## Next Steps After MVP

### Month 2

- iOS and Android polish
- Push notifications for new events/messages
- Cloud backup (encrypted)
- Group events
- **P2P BLE sync** (offline fallback)

### Month 3

- Multi-device sync
- Advanced messaging (Signal Protocol)
- Event reminders
- Search and filtering
- Real-time updates (WebSockets)

### Future

- Web companion app
- Community moderation tools
- Event categories
- NFC verification support
- Location-based features
