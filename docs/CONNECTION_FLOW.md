# BLE Connection Flow

## Overview

When two devices want to connect, they exchange profile information and establish a mutual connection relationship.

## The Complete Flow

### Phase 1: Discovery (Broadcasting & Scanning)

**Device A (Advertiser):**
1. Starts advertising with:
   - Service UUID: `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
   - Manufacturer Data containing:
     - Manufacturer ID: `0x1337`
     - Version: `1`
     - Display Name: e.g., "JG" (max 12 chars)
     - User Hash: 6 bytes (derived from userId)
     - Follow Token: 4 bytes (rotates every 30s for privacy)
   - GATT Server with Profile characteristic containing full profile JSON

**Device B (Scanner):**
1. Scans for devices advertising the service UUID
2. Discovers Device A
3. Parses manufacturer data to show display name and hash
4. Shows Device A in the discovered devices list

### Phase 2: Connection & Profile Exchange

**User taps on discovered device**

**Device B (Initiator):**
1. Stops scanning
2. Connects to Device A's GATT server
3. Reads Profile characteristic to get full profile:
   ```json
   {
     "userId": "G4VUvoBxzBuFu7ALcpdCLka7yWgWoGAVZPBZuxqVC7jy",
     "displayName": "JG",
     "publicKey": "base64EncodedEd25519PublicKey...",
     "profilePhoto": "base64EncodedImage..." (optional)
   }
   ```
4. Writes to Handshake characteristic with connection request:
   ```json
   {
     "type": "connection-request",
     "requester": {
       "userId": "abc123...",
       "displayName": "Wiz",
       "publicKey": "base64...",
       "profilePhoto": "base64..." (optional)
     },
     "timestamp": "2025-10-23T18:45:00Z"
   }
   ```
5. Waits 2 seconds for response (if auto-accept enabled)
6. Creates connection record with status:
   - `pending-sent` if waiting for manual approval
   - `mutual` if auto-accepted
7. Disconnects from GATT
8. Shows success message to user

**Device A (Responder):**
1. Receives write to Handshake characteristic
2. Parses connection request
3. Checks if auto-accept is enabled (default: true)
4. Creates connection record:
   - `mutual` if auto-accept enabled
   - `pending-received` if manual approval required
5. Emits followRequestReceived event to JavaScript
6. Connection appears in connections list

### Phase 3: Mutual Connection

**If Auto-Accept Enabled (Default):**
- Both devices immediately have `mutual` status
- Can now exchange encrypted messages
- Connection appears in "Connections" tab

**If Manual Approval Required:**
- Responder sees request in "Pending Requests"
- Initiator sees `pending-sent` in their list
- When responder accepts:
  - Updates their record to `mutual`
  - Next time initiator scans, upgrades to `mutual`

## Data Structures

### Broadcast Payload (Manufacturer Data)
```
[ManufacturerID (2 bytes)] [Version (1 byte)] [Name Length (1 byte)] [Name (0-12 bytes)] [User Hash (6 bytes)] [Follow Token (4 bytes)]
```

Example:
```
37 13 01 02 4A 47 42 0d 0c 96 71 5f a1 b2 c3 d4
^^^^^  ^  ^  ^^^^^ ^^^^^^^^^^^^^^^  ^^^^^^^^^^^
0x1337 v1 2  "JG"  user hash        token
```

### Profile Characteristic (Read)
- UUID: `6e400002-b5a3-f393-e0a9-e50e24dcca9e`
- Type: READ
- Value: JSON string of ConnectionProfile

### Handshake Characteristic (Write)
- UUID: `6e400003-b5a3-f393-e0a9-e50e24dcca9e`
- Type: WRITE
- Value: JSON string of ConnectionRequest

## Connection States

```
pending-sent     → User initiated connection, waiting for response
pending-received → Someone wants to connect, awaiting our approval
mutual           → Both parties accepted, can exchange messages
```

## Security

### Privacy Features
1. **Follow Token Rotation:** Changes every 30 seconds to prevent tracking
2. **User Hash:** Only 6 bytes of SHA-256 hash, not full userId
3. **Ephemeral Advertisement:** Constantly rotating identifiers

### Authentication
1. **Public Key Exchange:** Ed25519 keys exchanged during handshake
2. **Signature Verification:** Future messages signed with private key
3. **Shared Secret:** ECDH key agreement for message encryption (future)

## Troubleshooting

### "Unknown" Device Name
**Problem:** Manufacturer data not being received/parsed
**Check:**
- Is advertising actually including manufacturer data?
- Is the data format correct?
- iOS logs should show "Building manufacturer data"

### No Profile Data
**Problem:** GATT characteristic not set or not readable
**Check:**
- Did `setProfileData()` get called before advertising?
- iOS logs should show "Profile data set"
- When connecting, check for "Responded to profile read request"

### Connection Request Not Received
**Problem:** Handshake characteristic write failing
**Check:**
- Is GATT service properly set up?
- iOS logs should show "Received follow request"
- Check EventEmitter is emitting followRequestReceived

### Devices Don't Discover Each Other
**Problem:** Wrong service UUID or filtering issues
**Check:**
- Both advertising and scanning for same UUID
- RSSI threshold not too strict (-70 dBm default)
- Not filtering out own device incorrectly

## Testing Checklist

- [ ] Device A starts advertising successfully
- [ ] Device A's manufacturer data includes display name
- [ ] Device A's GATT server has profile data
- [ ] Device B discovers Device A
- [ ] Device B sees correct display name (not "Unknown")
- [ ] Device B can connect to Device A
- [ ] Device B can read profile from Device A
- [ ] Device B can write connection request to Device A
- [ ] Device A receives connection request
- [ ] Connection appears in both devices' connections list
- [ ] Connection status is correct (`mutual` or `pending-*`)

## Implementation Files

**Core:**
- `packages/rn-bluetooth/ios/BLEPeripheralManager.swift` - Advertising & GATT server
- `packages/rn-bluetooth/ios/BLECentralManager.swift` - Scanning & GATT client
- `packages/rn-bluetooth/ios/EventEmitter.swift` - Events to JavaScript
- `src/services/bluetooth/BLEBroadcastService.ts` - Broadcast management
- `src/services/bluetooth/BLEManager.ts` - Scan management
- `src/services/ConnectionService.ts` - Connection logic
- `src/screens/ConnectionScanScreen.tsx` - UI for discovering

**Bridge:**
- `packages/rn-bluetooth/ios/RNLCBluetoothModule.mm` - Method calls bridge
- `packages/rn-bluetooth/ios/RNLCBluetoothEventEmitter.m` - Events bridge
- `packages/rn-bluetooth/src/BluetoothModule.js` - JavaScript interface

## Future Enhancements

1. **Batch Connection Requests:** Handle multiple simultaneous requests
2. **Connection Sync:** Background task to check pending connection status
3. **Proximity Alerts:** Notify when connected friend is nearby
4. **QR Code Fallback:** Connect without BLE if needed
5. **Web3 Integration:** On-chain connection verification (optional)

