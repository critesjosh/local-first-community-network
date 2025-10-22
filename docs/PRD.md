---
title: "Product Requirements Document: Local Community Network (1-Month MVP)"
---

# Product Requirements Document: Local Community Network (1-Month MVP)

**Version:** 1.1  
**Last Updated:** October 2025  
**Status:** Active Development  
**Owner:** Product Team  
**Target Launch:** October 31, 2025

---

## 1. Product Vision

Build a privacy-first platform for discovering local events and building neighborhood connections in just 4 weeks. Focus on proving core value: Bluetooth-verified connections + encrypted event discovery via simple server backend.

**The killer use case:** Answer "What's happening in my neighborhood this weekend?" in under 30 seconds.

**1-Month Scope:** Ruthlessly minimal. Bluetooth verification, simple REST API server, basic encryption, single device, core event features. Prove the concept, then iterate.

### Success Criteria (by Oct 30)

- **Working prototype** with 20-30 beta users in one neighborhood
- **Core flow works:** BLE connect → post event → discover in feed → attend event
- **1+ successful event** coordinated through the app
- **Zero critical bugs** or security vulnerabilities
- **Technical proof:** Bluetooth verification + E2E encryption working reliably

---

## 2. User Stories & Acceptance Criteria

### Epic 1: Identity & Onboarding

#### US-1.1: Create Identity

**As a** new user  
**I want to** create an account without providing email or phone  
**So that** I maintain privacy and control over my identity

**Acceptance Criteria:**

- Generate Ed25519 key pair on device
- Public key becomes user identifier
- Private key stored in device secure storage (Keychain/KeyStore)
- User chooses display name and optional profile photo
- No server authentication required for account creation
- Account creation completes in <30 seconds

#### US-1.2: Onboarding Flow

**As a** new user  
**I want to** understand the app's value in under 2 minutes  
**So that** I know why and how to use it

**Acceptance Criteria:**

- 3-screen onboarding explaining: (1) in-person verification, (2) private posts, (3) local connections
- Skip option available after first screen
- App functional immediately after onboarding
- Onboarding never shown again unless user resets

### Epic 2: Bluetooth Verification (Week 1 Priority)

#### US-2.1: Connect via Bluetooth (PRIMARY METHOD) ✅ IMPLEMENTED

**As a** user
**I want to** walk into a space and connect with nearby people instantly
**So that** I can start sharing encrypted posts with them

**Acceptance Criteria:**

- "Connect" button prominently visible on home screen ✅
- Tapping opens Bluetooth scanner ✅
- Shows list of broadcasting profiles within ~1-3 meters (RSSI > -70 dBm) with live updates ✅
- User taps a profile to connect; connection auto-accepted by default (configurable) ✅
- Immediate in-app feedback confirms connection request succeeded ✅
- Connection saved locally within 3 seconds with "mutual" or "pending" status ✅
- Works offline-only for MVP (no server sync) ✅

**Technical Requirements:**

- Use BLE (Bluetooth Low Energy) via custom TurboModule ✅
- RSSI threshold: -70 dBm minimum for detection ✅
- Advertise service UUID + user hash + follow token ✅
- Connection request includes requester's public key + profile bundle ✅
- **Mutual connection flow:** ✅
  - Requester sends connection-request with public key
  - Responder auto-accepts (or queues if manual approval enabled)
  - Both parties store connection with status (mutual by default with auto-accept)
  - ECDH shared secret derivation deferred until needed for encryption (optimization)
- Store connection in SQLite; shared secrets derived on-demand ✅
- No NFC fallback - BLE only for MVP ✅

**Implementation Details:**

- **Auto-Accept (Default):** Connections automatically accepted, creating mutual connections immediately
  - Both requester and responder save connection with `status: 'mutual'`
  - No pending states with default settings
- **Manual Approval (Optional):** User can disable auto-accept in Settings; requests queue as "pending-received"
  - **Pending Approval UI:** ConnectionsScreen displays three sections:
    - "Pending Requests" with Accept/Reject buttons for incoming requests
    - "Requests Sent" showing outgoing pending connections
    - "Connections" showing mutual connections
  - **Manual Acceptance:** Tapping "Accept" upgrades connection to mutual status in database
  - **Automatic Synchronization:** Background BLE scan runs automatically when ConnectionsScreen is focused
    - Scans for 3 seconds to discover nearby devices
    - Auto-upgrades pending-sent connections to mutual if other party has accepted
    - Also triggered by pull-to-refresh gesture
    - No manual scanning required - status updates automatically
- **Privacy-Preserving:** Both parties exchange public keys; ECDH shared secrets derived on-demand for encryption
- **Connection Status:** `mutual` (both connected), `pending-sent` (waiting for response), `pending-received` (awaiting approval)
- **Auto-Refresh UI:** ConnectionsScreen polls database every 2 seconds for real-time updates
- **Database Migrations:** Automatic schema updates add missing columns to existing databases
- **Debug Logging:** User display names prefix all logs ([Alice], [Bob]) for multi-device debugging
- **Status Display:** ConnectionDetailScreen shows accurate connection status (mutual/pending-sent/pending-received)

**1-Month Simplifications:**

- No background scanning (app must be open) ✅
- No retry logic (connection fails = start over) ✅
- Manual profile selection (no auto-connect) ✅
- Basic error messages only ✅

#### US-2.3: Connection Feedback ✅ IMPLEMENTED

**As a** user
**I want to** know my connection status with others
**So that** I can understand who can see my posts

**Acceptance Criteria:**

- Show connected user's profile (name, photo) immediately after connection succeeds ✅
- Display connection timestamp and mutual/pending status ✅
- Option to add personal note about the person (database support ready)
- Connection appears in contacts list within 1 second ✅
- Settings toggle for auto-accept vs manual approval ✅

### Epic 3: Event Posting (Week 2-3 Priority)

#### US-3.1: Create Event Post (SIMPLIFIED)

**As a** user  
**I want to** post events with basic details  
**So that** my verified neighbors can discover them

**Acceptance Criteria:**

- "New Event" button on home feed
- Simple form: Title (required), Date/Time (required), Location (optional), Description (optional)
- Single photo support only (no multi-photo)
- Character limit: 1000 for description
- Preview shows formatted event card
- Post saves immediately to local database
- Encrypts for each connection (simple AES-256)
- No offline queue - must be online to post

**Technical Requirements:**

- Event schema: `{title, datetime, location, description, photo_base64?}`
- Hybrid encryption:
  - Generate random AES-256 key per event
  - Encrypt event content once with this key
  - For each connection: wrap key using HMAC(sharedSecret, postID) as recipient ID
  - This prevents server metadata leakage (77x more efficient than encrypting content per recipient)
- Local storage: SQLite with events table
- **Server sync:** POST encrypted events to server, GET to fetch new events
- **SIMPLIFICATION:** Use simple REST API for MVP (no WebSockets, no real-time updates)

#### US-3.2: Discover Events in Feed (SIMPLIFIED)

**As a** user  
**I want to** see events from connections in simple list  
**So that** I know what's happening

**Acceptance Criteria:**

- Feed shows events in chronological order (newest first)
- Basic list view - no fancy filtering
- Decrypt and display events from connections
- Pull down to manually fetch new events from server
- No real-time updates - manual refresh only
- Show event date/time prominently
- "Going" button only (no maybe/no for MVP)

**Technical Requirements:**

- Fetch encrypted events from server via GET /api/posts
- Query local SQLite for cached events
- Decrypt with connection's shared key using HMAC lookup
- Sort by datetime client-side
- Basic list rendering (no virtual scroll needed for <100 events)

#### US-3.3: Simple Post Interactions (MINIMAL)

**As a** user  
**I want to** indicate I'm attending an event  
**So that** the host knows I'm coming

**Acceptance Criteria:**

- "I'm Going" button on event cards
- Shows count of attendees
- No comments or reactions for MVP
- Attendance stored locally only

**Technical Requirements:**

- RSVP stored as `{eventID, userID, status: 'going'}`
- Encrypted with same pattern as events
- POST RSVPs to server, fetch via GET /api/rsvps

### Epic 4 (Optional): Direct Messaging (SIMPLIFIED - Week 3)

#### US-4.1: Send Direct Message (BASIC ENCRYPTION)

**As a** user  
**I want to** send simple encrypted messages to connections  
**So that** I can coordinate about events

**Acceptance Criteria:**

- Tap connection to open basic chat thread
- Send text messages only (no photos/files for MVP)
- Messages encrypted with shared secret from BLE connection
- No delivery receipts or read status for MVP
- No typing indicators
- POST messages to server, poll for new messages on refresh

**Technical Requirements:**

- Use simple AES-256-GCM encryption with shared secret from DH key exchange
- Store messages in local SQLite: `{messageID, conversationID, senderID, ciphertext, timestamp}`
- POST /api/messages to send, GET /api/messages to fetch
- **NO Signal Protocol** (too complex for 1-month MVP)
- Server stores encrypted messages, cannot decrypt

**1-Month Simplifications:**

- Manual refresh to fetch new messages (no push notifications)
- No message history when switching devices
- No backup/restore for MVP

### Epic 5: Profile & Settings (MINIMAL - Week 1)

#### US-5.1: Basic Profile (SIMPLIFIED)

**As a** user  
**I want to** set my name and photo  
**So that** connections can identify me

**Acceptance Criteria:**

- Set display name during first launch
- Optional profile photo (take or choose from library)
- Name and photo shown to connections after BLE pairing
- No bio, no location, no other fields for MVP
- Changes saved locally only

**Technical Requirements:**

- Profile: `{name: string, photo: base64?}`
- Stored in local device storage
- Shared during BLE connection establishment
- No cloud sync

#### US-5.2: Basic Settings (MINIMAL)

**As a** user  
**I want to** manage basic app settings  
**So that** I can control my experience

**Acceptance Criteria:**

- View list of connections
- Disconnect from a user (removes from local storage)
- Clear all data (factory reset)
- No privacy toggles for MVP
- No data export for MVP
- No account deletion (just clear data)

**Technical Requirements:**

- Settings stored in local preferences
- Disconnect: delete connection record from SQLite
- Clear data: wipe SQLite database and preferences

### Epic 6: Multi-Device Sync

#### US-6.1: Device Backup

**As a** user  
**I want to** backup my data securely  
**So that** I don't lose everything if I lose my device

**Acceptance Criteria:**

- Automatic encrypted backup to user's cloud (iCloud/Google Drive)
- Backup includes: keys, connections, post history, messages
- Backup encrypted with password-derived key
- Backup frequency: daily if changes detected
- Option to manually trigger backup
- Restore from backup on new device

**Technical Requirements:**

- Use Argon2id for password-based key derivation (100k iterations)
- Encrypt backup with AES-256-GCM
- Store in user's private cloud folder (not our infrastructure)
- Backup size: compress before encrypt (~10MB for typical user)

#### US-6.2: Add New Device

**As a** user  
**I want to** use the app on multiple devices  
**So that** I can access from phone and tablet

**Acceptance Criteria:**

- Scan QR code from existing device to new device
- New device receives encrypted identity bundle
- All connections and history sync within 60 seconds
- Both devices stay in sync via CRDTs
- Revoke device access from any device
- See list of active devices in settings

**Technical Requirements:**

- QR code contains: identity key + session key + sync server URL
- Use Automerge CRDT for state synchronization
- WebSocket connection per device to sync server
- Device registry stored encrypted, each device has unique ID
- Revocation: broadcast to all devices, delete keys for revoked device

---

## 3. Technical Architecture

### 3.1 System Architecture

```
┌─────────────┐         ┌─────────────┐
│   Mobile    │         │   Mobile    │
│   Client    │◄───────►│   Client    │
│   (Alice)   │  NFC/BT │   (Bob)     │
└──────┬──────┘         └──────┬──────┘
       │                       │
       │  Encrypted Posts      │
       │  Encrypted Messages   │
       │                       │
       ▼                       ▼
┌────────────────────────────────────┐
│         Sync/Relay Server          │
│  (Stores encrypted blobs,          │
│   cannot decrypt content)          │
└────────────────────────────────────┘
```

### 3.2 Data Model

#### Identity

```javascript
{
  userID: "base58(publicKey)",
  publicKey: Uint8Array(32),  // Ed25519
  privateKey: Uint8Array(64), // NEVER leaves device
  profile: {
    name: string,
    photo: string,  // base64 or URL
    bio: string,
    location: string
  }
}
```

#### Connection

```javascript
{
  connectionID: "uuid",
  theirPublicKey: Uint8Array(32),
  sharedSecret: Uint8Array(32),  // DH(myPrivate, theirPublic)
  metadata: {
    name: string,
    photo: string,
    notes: string,  // my private notes about them
    connectedAt: timestamp
  },
  encryptionKey: Uint8Array(32)  // derived from sharedSecret
}
```

#### Post

```javascript
{
  postID: "uuid",
  authorID: "base58(publicKey)",
  timestamp: number,
  postType: "event" | "post" | "recommendation",
  encryptedContent: Uint8Array,  // Post data encrypted once with random post key
  wrappedKeys: {
    // Privacy: Use HMAC(sharedSecret, postID) as key instead of userID
    // This prevents server from learning social graph
    "HMAC(sharedSecret_1, postID)": Uint8Array,  // 32-byte wrapped post key
    "HMAC(sharedSecret_2, postID)": Uint8Array,  // 32-byte wrapped post key
    ...
  }
}

// Storage efficiency: 10KB post to 100 connections
// Old approach: 10KB × 100 = 1000KB
// New approach: 10KB + (32 bytes × 100) = ~13KB (77x more efficient)

// Decrypted Event Content
{
  type: "event",
  title: string,
  datetime: ISO8601,
  location: string,
  description: string,
  photo?: string,  // URL or base64
  recurring?: {
    frequency: "weekly" | "monthly",
    endDate?: ISO8601
  },
  rsvps: {
    going: number,      // count
    maybe: number,
    notGoing: number
  }
}

// Decrypted Post Content (General)
{
  type: "post",
  content: string,
  photos?: string[],  // URLs or base64
  metadata: {...}
}
```

#### Message (Direct)

```javascript
{
  messageID: "uuid",
  conversationID: "uuid",
  senderID: "base58(publicKey)",
  recipientID: "base58(publicKey)",
  timestamp: number,
  signalProtocolCiphertext: Uint8Array,  // Signal Protocol encrypted
  header: {
    ephemeralKey: Uint8Array,
    counter: number,
    previousChainLength: number
  }
}
```

### 3.3 Encryption Flows

#### Post Encryption

```
1. User creates post
2. Generate random post key (AES-256 key)
3. Encrypt post content with post key → encryptedContent (once)
4. For each connection:
   a. Derive connection key from shared secret
   b. Generate recipient lookup ID: HMAC(sharedSecret, postID)
   c. Wrap post key with connection key → wrappedKey (32 bytes)
5. Store/sync: {postID, authorID, timestamp, encryptedContent, wrappedKeys}

Privacy benefit: Server cannot determine who can decrypt each post (no userID in wrappedKeys)
Efficiency: Content encrypted once, not duplicated per recipient (77x smaller for 100 connections)
```

#### Post Decryption

```
1. Fetch/receive encrypted post
2. For each of my connections (early termination on match):
   a. Compute lookup ID: HMAC(sharedSecret, postID)
   b. Check if wrappedKeys[lookupID] exists
   c. If found, unwrap with connection key → post key
3. Decrypt encryptedContent with post key → original content
4. Display to user

Performance: With 100 connections and 50 posts, ~2,500 HMAC ops = 25ms (imperceptible)
Privacy: You learn the post is for you without revealing identity to server
```

#### Connection Key Derivation (ECDH)

```javascript
// On device
const myPrivateKey = ed25519_to_curve25519(myEd25519Private);
const theirPublicKey = ed25519_to_curve25519(theirEd25519Public);
const sharedSecret = crypto_scalarmult(myPrivateKey, theirPublicKey);
const connectionKey = HKDF(sharedSecret, salt: "connection-key-v1", info: "AES-256");
```

### 3.4 API Specifications

#### Authentication

- Use signature-based auth: sign timestamp with private key
- Server verifies signature with public key
- No passwords or sessions

```
POST /api/auth/challenge
Response: { challenge: "random-string" }

POST /api/auth/verify
Body: { userID, signature(challenge), publicKey }
Response: { token: "jwt-token" }
```

#### Posts API

```
POST /api/posts
Headers: { Authorization: "Bearer {token}" }
Body: {
  postID: "uuid",
  authorID: "base58",
  timestamp: number,
  encryptedContent: Uint8Array,  // Encrypted once
  wrappedKeys: {
    "HMAC(secret, postID)": Uint8Array,  // Privacy: no userIDs exposed
    ...
  }
}
Response: { success: true, postID }

GET /api/posts?since={timestamp}&limit=50
Response: {
  posts: [{
    postID,
    authorID,
    timestamp,
    encryptedContent,
    wrappedKeys
  }],
  nextCursor: "timestamp"
}
```

#### Messages API (WebSocket)

```
WS /api/messages
Client → Server: {
  type: "send",
  messageID: "uuid",
  recipientID: "base58",
  ciphertext: Uint8Array,
  header: {...}
}

Server → Client: {
  type: "message",
  messageID: "uuid",
  senderID: "base58",
  ciphertext: Uint8Array,
  header: {...}
}
```

### 3.5 Technology Stack

#### Mobile (React Native)

- **Framework:** React Native 0.81.4 with Expo SDK 54 (managed workflow)
- **State Management:** Zustand
- **Crypto:**
  - @noble/ed25519 (identity keys)
  - @noble/secp256k1 (ECDH for connection key exchange)
  - @noble/hashes (SHA-256, HMAC)
  - react-native-crypto (AES-256-GCM encryption)
- **Storage:**
  - expo-secure-store (secure key storage via iOS Keychain/Android KeyStore)
  - @react-native-async-storage/async-storage (app data)
  - expo-sqlite (local database)
- **Bluetooth:**
  - **Custom TurboModule:** `@localcommunity/rn-bluetooth` (production-ready, replaces react-native-ble-plx and react-native-ble-advertiser)
  - Native iOS (Swift/Objective-C) and Android (Kotlin) implementations
  - Optimized for Local Community Network protocol
  - Supports advertising, scanning, GATT operations, background modes
  - 50% smaller API surface, faster scanning, lower memory usage vs generic libraries

#### Backend (Node.js)

- **Framework:** Express.js or Fastify
- **Database:** PostgreSQL (encrypted blobs) + Redis (real-time)
- **WebSocket:** Socket.io or ws
- **Storage:** S3-compatible for photos/files
- **Deployment:** Docker + Kubernetes or Railway/Render

#### Alternative: Serverless

- **Functions:** Cloudflare Workers / Vercel Edge
- **Database:** Cloudflare D1 / Supabase
- **Real-time:** Supabase Realtime / Ably
- **Storage:** Cloudflare R2 / S3

---

## 4. Security Requirements

### 4.1 Cryptographic Requirements

**MUST:**

- Use only well-vetted cryptographic libraries (libsodium, libsignal, @noble/\*)
- Generate keys using cryptographically secure random number generator (CSRNG)
- Never transmit private keys over network
- Use authenticated encryption (AES-GCM, not AES-CBC)
- Implement proper key rotation for long-lived conversations
- Use constant-time operations for key comparisons

**MUST NOT:**

- Roll custom cryptography
- Store private keys in cloud without encryption
- Log decrypted content or keys
- Use deprecated algorithms (MD5, SHA1, RC4)

### 4.2 Threat Model

**Threats we protect against:**

- Server compromise (server cannot read content)
- Network eavesdropping (TLS + E2EE)
- Device theft (keys in secure enclave)
- Malicious connections (in-person verification)

**Threats out of scope for MVP:**

- Device compromise (malware, root access)
- Physical attacks (rubber hose cryptanalysis)
- Nation-state adversaries
- Quantum computers (post-quantum crypto for v2)

### 4.3 Privacy Requirements

**Data Minimization:**

- Collect only: public keys, encrypted content, timestamps
- Never collect: IP addresses (beyond rate limiting), device fingerprints, usage analytics

**User Rights (GDPR):**

- Right to access: Export all data
- Right to erasure: Delete all data within 30 days
- Right to portability: JSON export in standard format
- Right to rectification: Edit profile anytime

**Server-Side:**

- No logging of encrypted content
- No analytics on user behavior
- Rate limiting to prevent enumeration attacks
- Automatic deletion of orphaned data (90 days)

---

## 5. MVP Scope

### In Scope (Event Discovery Core)

✅ In-person verification (Bluetooth only for MVP)
✅ **Simple server backend** (REST API for encrypted posts/messages)
✅ **Event posting with rich details** (title, date/time, location, description, photo)
✅ **Event discovery feed** (chronological, filter for events only)
✅ **Quick RSVP** (going/maybe/no)
✅ General posts (text + photos) for recommendations/updates
✅ Direct messaging (basic) for event coordination
✅ Profile management
✅ **Single neighborhood pilot focused on event adoption**

### Out of Scope (Future Phases)

❌ Advanced event features (recurring events, reminders, calendar sync)
❌ Neighborhood-wide bulletin board (beyond verified connections)
❌ Group chats for event planning
❌ Marketplace for garage sales/classifieds
❌ Web app
❌ Video/voice calls
❌ Location-based auto-discovery (stays 100% in-person verification)
❌ **P2P BLE sync** (nice-to-have for offline scenarios, but not MVP priority)
❌ **Multi-device sync** (single device only for MVP)
❌ **NFC verification** (Bluetooth only for MVP)
❌ **Signal Protocol** (basic AES-GCM sufficient for MVP)
❌ **Real-time WebSocket updates** (poll-based refresh for MVP)

### Success Metrics for MVP

- **Technical:** 99.9% encryption success rate, <2% message delivery failure, <30s event discovery time
- **Event Focus:** 60%+ of WAU attend ≥1 event/month, 1+ event posted/week per neighborhood (10+ households)
- **User:** 40% Day-30 retention, 2+ posts per user per week (events + updates)
- **Growth:** 30% household penetration in pilot neighborhood

---

## 6. Implementation Phases

### Phase 1: Core Infrastructure (Weeks 1-4)

- [ ] Set up React Native project with TypeScript
- [ ] Implement key generation and storage (Ed25519)
- [ ] Build basic UI shell (navigation, screens)
- [ ] Set up development server (Node.js + PostgreSQL)
- [ ] Implement signature-based authentication

### Phase 2: Verification (Weeks 5-6)

- [x] **Custom Bluetooth TurboModule** (`@localcommunity/rn-bluetooth`)
  - Native iOS and Android implementations
  - BLE advertising with manufacturer data
  - BLE scanning with RSSI filtering
  - GATT server/client for profile exchange
  - Background operation support
  - Expo config plugin for permissions
- [x] Bluetooth scanning and pairing (via custom module)
- [x] Key exchange protocol during verification (ECDH with secp256k1)
- [x] Connection storage and management (SQLite + ConnectionService)
- [x] Connection list UI (ConnectionsScreen, ConnectionScanScreen)
- [ ] NFC integration (deferred - Bluetooth-only for MVP)

### Phase 3: Event Discovery & Posting (Weeks 7-9)

- [ ] Event post creation UI (title, date/time, location, description, photo)
- [ ] Event feed with chronological display
- [ ] Event filtering ("Events Only" toggle)
- [ ] Quick RSVP system (going/maybe/no)
- [ ] Event encryption (same pattern as posts)
- [ ] General post creation (text + photos) for non-event updates
- [ ] Feed UI with decryption and event/post differentiation
- [ ] Pull-to-refresh and infinite scroll
- [ ] Event visual treatment (badges, icons)

### Phase 4: Direct Messaging (Weeks 10-12)

- [ ] Integrate libsignal for Signal Protocol
- [ ] Message encryption/decryption
- [ ] Conversation list and thread UI
- [ ] WebSocket for real-time messages
- [ ] Push notifications

### Phase 5: Sync & Polish (Weeks 13-14)

- [ ] Multi-device sync with Automerge
- [ ] Encrypted cloud backup
- [ ] Device management UI
- [ ] Onboarding flow
- [ ] Error handling and edge cases

### Phase 6: Pilot Launch (Week 15-16)

- [ ] Security audit (external firm)
- [ ] Load testing (100+ concurrent users)
- [ ] Beta testing with 10-20 users
- [ ] Founding Block Party event
- [ ] Monitor metrics and iterate

---

## 7. Open Questions & Decisions Needed

**Q1:** Should we support username/password backup option for non-technical users?

- **Tradeoff:** Easier recovery vs. weaker security (password vulnerabilities)
- **Recommendation:** Start with password-encrypted backup, add hardware key option later

**Q2:** How do we handle connection disputes (e.g., someone claims they didn't connect)?

- **Recommendation:** Both parties must confirm connection; either can disconnect anytime

**Q3:** What happens if someone loses ALL devices and backup?

- **Recommendation:** Identity is lost; must create new account (emphasize backup in onboarding)

**Q4:** Maximum number of connections per user?

- **Recommendation:** Start with 500 limit (Dunbar's number × 3); revisit if needed

**Q5:** Photo storage: on-device vs. server?

- **Recommendation:** Hybrid - thumbnails on device, full-res encrypted on server, auto-purge after 90 days

Q6: How should replies to posts work?

- Recommendation: They should be encrypted for all of the posters connections, so only the intersection of connections of the original poster and the replier are able to see the reply.?

---

## 8. Non-Functional Requirements

### Performance

- App launch: <2 seconds cold start
- Post creation to upload: <3 seconds
- Message delivery: <500ms latency
- Feed load: <1 second for 50 posts
- Decryption: <100ms per post

### Reliability

- 99.9% uptime for sync server
- Message delivery guarantee: at-least-once
- Data loss prevention: daily encrypted backups
- Graceful degradation when offline

### Scalability

- Support 1,000 concurrent users per server instance
- Database: 10,000 users per neighborhood
- Message throughput: 1,000 messages/second
- Storage: 500MB per user (5 years of typical usage)

### Accessibility

- WCAG 2.1 AA compliance
- VoiceOver/TalkBack support
- Minimum font size: 16px
- High contrast mode support
- Localization: English first, Spanish/French in Phase 2

---

## 9. Testing Strategy

### Unit Tests

- Crypto functions (key generation, encryption, decryption)
- CRDT operations (merge, sync)
- Message queue (send, retry, failure)
- Target: 80% code coverage

### Integration Tests

- End-to-end post encryption/decryption flow
- NFC/Bluetooth verification flow
- Multi-device sync
- WebSocket message delivery

### Security Tests

- Penetration testing (external firm)
- Crypto library audit
- Key storage verification
- Man-in-the-middle attack simulation

### User Testing

- Beta with 20 users before launch
- Usability testing (5 users, think-aloud protocol)
- A/B test onboarding flows
- Monitor crash reports and error logs

---

## 10. Launch Plan

### Pre-Launch (Weeks 13-15)

- Recruit 5-10 Neighborhood Champions
- Print door hangers and yard signs
- Create pre-registration landing page
- Security audit and fixes

### Launch Event: Founding Block Party (Week 16)

- Saturday afternoon, 2-3 hours
- Free food and entertainment
- On-site verification and onboarding help
- Professional photos for profiles
- Goal: 60-150 users in one day

### Post-Launch (Weeks 17-20)

- Daily engagement monitoring
- Weekly community events (online + offline)
- Rapid bug fixes and UX improvements
- Collect qualitative feedback
- Prepare for neighborhood #2

---

## 11. Success Criteria & KPIs

### Must-Have (Launch Blockers)

- ✅ Zero critical security vulnerabilities
- ✅ <5% crash rate
- ✅ >95% encryption success rate
- ✅ >60% Day-1 retention

### Should-Have (Quality Bar)

- ✅ >40% Day-30 retention
- ✅ 2+ posts per user per week
- ✅ <500ms message latency
- ✅ User NPS >50

### Nice-to-Have (Aspirational)

- 🎯 50%+ household penetration
- 🎯 70% Day-30 retention
- 🎯 Daily active users / Monthly active users >25%
- 🎯 Organic invitation rate >5 invites per user

---

## 12. Appendix

### A. Glossary

- **Connection:** Two users who verified in person via NFC/Bluetooth
- **E2EE:** End-to-end encryption (only sender and recipient can read)
- **DH:** Diffie-Hellman key exchange
- **CRDT:** Conflict-free Replicated Data Type (for multi-device sync)
- **Signal Protocol:** Cryptographic protocol for secure messaging (used by Signal, WhatsApp)

### B. References

- [Signal Protocol Specification](https://signal.org/docs/)
- [W3C Decentralized Identifiers](https://www.w3.org/TR/did-core/)
- [NIST Cryptographic Standards](https://csrc.nist.gov/publications)
- [OWASP Mobile Security](https://owasp.org/www-project-mobile-security/)
- [Local-First Software Principles](https://www.inkandswitch.com/local-first/)

### C. Team Roles

- **Product Manager:** Define features, prioritize roadmap
- **Tech Lead:** Architecture decisions, code reviews
- **Mobile Engineers (2):** iOS and Android development
- **Backend Engineer:** Server, database, APIs
- **Security Engineer:** Crypto implementation, audits
- **Designer:** UI/UX, visual design, user research

### D. Contact

- **Project Lead:** [Name]
- **Technical Questions:** [Email]
- **Security Reports:** security@[domain]
- **General Inquiries:** hello@[domain]

---

**Document History**

- v1.0 (Oct 2025): Initial PRD for MVP
- v0.9 (Oct 2025): Draft for team review
