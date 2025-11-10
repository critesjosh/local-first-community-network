# BLE Implementation Guide

## Overview

This document provides a comprehensive technical guide to the Bluetooth Low Energy (BLE) implementation in the Local Community Network app. The implementation follows industry best practices for cross-platform BLE communication while working within iOS and Android platform constraints.

## Architecture

### Three-Layer Design

```
┌─────────────────────────────────────────────┐
│   TypeScript Application Layer              │
│   (BLEManager, BLEBroadcastService)         │
└─────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────┐
│   React Native Bridge                        │
│   (BluetoothModule.js)                       │
└─────────────────────────────────────────────┘
                    ↕
┌──────────────────────┬──────────────────────┐
│   iOS Native         │   Android Native     │
│   (Swift)            │   (Kotlin)           │
│   - BLEPeripheral    │   - BLEPeripheral    │
│   - BLECentral       │   - BLECentral       │
└──────────────────────┴──────────────────────┘
```

## Core Design Principles

### 1. Advertisement as Rendezvous, GATT for Data

**Why:** iOS restrictions prevent arbitrary data in advertisements. This design works cross-platform.

- **Advertisement**: Minimal data for discovery (Service UUID, display name, user hash)
- **GATT**: Full profile data and handshake exchange after connection

### 2. Cross-Platform Compatibility First

**Challenge:** iOS and Android have different BLE capabilities
- iOS: Can advertise Service UUID and Local Name only
- Android: Can advertise Service UUID, Manufacturer Data, Service Data

**Solution:** Design advertisements that both platforms can read:
- Android devices broadcast Manufacturer Data
- iOS devices broadcast encoded Local Name
- Both platforms parse both formats when scanning

### 3. Service UUID as Primary Filter

All devices advertise the same Service UUID (`6e400001-b5a3-f393-e0a9-e50e24dcca9e`). This is the primary discovery mechanism on both platforms.

## Advertisement Formats

### Android Advertisement

**Main Advertisement Packet:**
```
- Flags: General Discoverable, BR/EDR Not Supported
- Service UUID: 6e400001-b5a3-f393-e0a9-e50e24dcca9e (16 bytes)
- Tx Power: High
```

**Scan Response Packet:**
```
- Manufacturer Specific Data:
  Company ID: 0x1337 (2 bytes, little-endian) - TEST ONLY
  Payload:
    [version: 1 byte]
    [nameLength: 1 byte]
    [displayName: variable, max 12 bytes UTF-8]
    [userHash: 6 bytes]
    [followToken: 4 bytes]
```

**Total Size:** Main ~20 bytes, Scan Response ~25 bytes (well under 31-byte limit)

### iOS Advertisement

**Main Advertisement Packet:**
```
- Service UUID: 6e400001-b5a3-f393-e0a9-e50e24dcca9e
- Local Name: "LCNS:<displayName>:<userHashHex>:<followTokenHex>"
  Example: "LCNS:Alice:a1b2c3d4e5f6:12345678"
```

**Why Local Name?**
- iOS does not allow apps to set Manufacturer Specific Data in advertisements
- Local Name is one of the few fields apps can control
- We use a custom format (LCNS:) for structured data encoding

**Size Considerations:**
- iOS may truncate long local names in background mode
- Display names limited to 12 characters to stay within limits
- Foreground advertising generally includes full name

## GATT Service Schema

### Service UUID
```
6e400001-b5a3-f393-e0a9-e50e24dcca9e
```

### Characteristics

#### 1. Profile Characteristic (READ)
```
UUID: 6e400002-b5a3-f393-e0a9-e50e24dcca9e
Properties: READ
Permissions: READABLE
Value: JSON string of ConnectionProfile
```

**ConnectionProfile Structure:**
```typescript
{
  userId: string;        // base58-encoded Ed25519 public key
  displayName: string;
  publicKey: string;     // base64-encoded for JSON transmission
  profilePhoto?: string; // base64-encoded image data
}
```

**Why READ characteristic?**
- Profile data can be large (especially with photo)
- GATT handles chunking automatically for large reads
- Reliable transmission with automatic retries

#### 2. Handshake Characteristic (WRITE + NOTIFY)
```
UUID: 6e400003-b5a3-f393-e0a9-e50e24dcca9e
Properties: WRITE, NOTIFY
Permissions: WRITEABLE
Value: JSON string of ConnectionRequest or ConnectionResponse
```

**ConnectionRequest Structure:**
```typescript
{
  type: 'connection-request';
  requester: {
    userId: string;
    displayName: string;
    publicKey: string;
    profilePhoto?: string;
  };
  timestamp: string; // ISO 8601
}
```

**ConnectionResponse Structure:**
```typescript
{
  type: 'connection-response';
  status: 'accepted' | 'rejected' | 'pending';
  responder: {
    userId: string;
    displayName: string;
    publicKey: string;
    profilePhoto?: string;
  };
  timestamp: string;
}
```

**Handshake Flow:**
1. Requester writes ConnectionRequest to characteristic
2. Responder receives write event, processes request
3. Responder updates characteristic value with ConnectionResponse
4. Requester receives notification with response

## Connection Flow

### Discovery Phase
```
Scanner (Central)              Advertiser (Peripheral)
       │                              │
       │◄─────── Advertisement ───────┤
       │   (Service UUID + Data)      │
       │                              │
       ├─── Parse & Filter ───►       │
       │   (RSSI, Service UUID)       │
       │                              │
       └─── Device Discovered         │
```

### Connection & Handshake Phase
```
Requester                      Responder
    │                              │
    ├──── Connect (GATT) ─────────►│
    │◄──── Connected ──────────────┤
    │                              │
    ├──── Read Profile Char ──────►│
    │◄──── Profile JSON ───────────┤
    │                              │
    ├──── Write Handshake Char ───►│
    │   (ConnectionRequest)         │
    │                              │
    │                         [User accepts]
    │                              │
    │◄──── Notify ─────────────────┤
    │   (ConnectionResponse)        │
    │                              │
    └──── Disconnect ──────────────►│
```

## Platform-Specific Implementation Details

### iOS (CoreBluetooth)

**Peripheral Manager:**
- Uses `CBPeripheralManager` for advertising
- Creates `CBMutableService` with characteristics
- Handles read/write requests via delegate callbacks
- Cannot set Manufacturer Specific Data (Apple restriction)

**Central Manager:**
- Uses `CBCentralManager` for scanning
- Must scan for specific Service UUID (nil = battery drain)
- Parses both Manufacturer Data (from Android) and Local Name (from iOS)
- Uses UUID-based peripheral identifiers (not MAC addresses)

**Background Mode Considerations:**
- Advertising heavily restricted in background
- Scanning works but with reduced frequency
- Service UUID-based scanning required for background operation

### Android (BluetoothLeAdvertiser/Scanner)

**Peripheral (Advertiser):**
- Uses `BluetoothLeAdvertiser` for broadcasting
- Separate packets for main advertisement and scan response
- Can include Manufacturer Specific Data with Company ID
- Company ID automatically prepended by Android (little-endian)

**Central (Scanner):**
- Uses `BluetoothLeScanner` for discovery
- Can filter by Service UUID, Manufacturer ID, or both
- Parses Manufacturer Data directly from `ScanRecord`
- Also parses iOS Local Name format for cross-platform compatibility

**Permission Requirements:**
- Android 12+: `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_ADVERTISE`, `ACCESS_FINE_LOCATION`
- Android <12: `ACCESS_FINE_LOCATION`, `BLUETOOTH`, `BLUETOOTH_ADMIN`
- Location Services must be enabled for scanning to work

## Manufacturer Data Deep Dive

### Company Identifier

**Current Value:** `0x1337` (TEST/DEVELOPMENT ONLY)

**Important Notes:**
- Company Identifiers are assigned by Bluetooth SIG
- Using unassigned IDs in production violates Bluetooth spec
- `0xFFFF` is reserved for testing but should NOT ship in production
- Production deployment requires obtaining official Company ID from Bluetooth SIG

**How to Get Official ID:**
1. Join Bluetooth SIG (free for most cases)
2. Request Company Identifier assignment
3. Update `MANUFACTURER_ID` constant in all native code

### Endianness

**Android:**
The Company ID is stored **little-endian** in the advertisement packet:
```
Company ID 0x1337 → Bytes: [0x37, 0x13]
```

This is handled automatically by Android's `addManufacturerData()` method.

**iOS Parsing:**
When iOS scans Android devices, the Manufacturer Data in `CBAdvertisementDataManufacturerDataKey` includes the Company ID:
```
Data: [0x37, 0x13, version, nameLength, name..., hash..., token...]
       └─────┬─────┘
      Company ID (LE)
```

The first 2 bytes are the Company ID (little-endian), followed by our payload.

### Payload Structure

After the Company ID (which Android handles), our payload is:

```
Offset  Size  Field          Description
──────────────────────────────────────────────
0       1     version        Protocol version (currently 1)
1       1     nameLength     Length of display name in bytes
2       N     displayName    UTF-8 encoded name (max 12 bytes)
2+N     6     userHash       First 6 bytes of SHA-256(userId)
8+N     4     followToken    Random 4-byte token, rotated periodically
```

**Why Hash User ID?**
- Privacy: Full public key not broadcast
- Space: 6 bytes vs 32+ bytes
- Filtering: Allows ignoring own broadcasts

**Why Rotating Token?**
- Privacy: Prevents long-term tracking
- Freshness: Indicates recent presence
- Future: Could be used for anti-replay or challenge-response

## Privacy & Security

### MAC Address Randomization

**iOS:**
- Always uses random, rotating MAC addresses
- App never has access to actual MAC
- CoreBluetooth provides stable UUID for app use

**Android:**
- Modern Android uses MAC randomization by default
- App should not rely on MAC addresses for identification
- Use `userHashHex` as stable identifier instead

### Token Rotation

The follow token rotates every 60 seconds (configurable):
```typescript
const FOLLOW_TOKEN_ROTATION_MS = 60000;
```

**Benefits:**
- Limits tracking window to 60 seconds
- Forces re-advertisement with fresh data
- Could support time-based challenge-response in future

### User Hash vs Full Public Key

**In Advertisement:**
- Only first 6 bytes of SHA-256(userId) broadcast
- Sufficient for local filtering and collision avoidance
- Does not expose full cryptographic identity

**In GATT Profile:**
- Full public key provided after connection
- Allows verification and encryption setup
- Only shared with devices user chooses to connect with

## Testing & Debugging

### Cross-Platform Testing

**Required Devices:**
- At least one iOS device (iPhone/iPad)
- At least one Android device (phone/tablet)
- Both running your app

**Test Scenarios:**
1. iOS → iOS discovery and connection
2. Android → Android discovery and connection
3. iOS → Android discovery and connection (iOS scans, Android advertises)
4. Android → iOS discovery and connection (Android scans, iOS advertises)

### Debug Logging

**Native Logs:**
- iOS: View in Xcode Console
- Android: View in Android Studio Logcat or `adb logcat`

**Key Log Patterns:**
```
iOS:
  [BLEPeripheralManager] - Advertising events
  [BLECentralManager] - Scanning and discovery

Android:
  [BLEPeripheralManager] - Advertising events
  [BLECentralManager] - Scanning and discovery
```

### Common Issues

**iOS Scanning Not Finding Android Devices:**
- Verify Android device is advertising Service UUID
- Check RSSI threshold (devices too far apart?)
- Ensure scan is filtering by Service UUID

**Android Scanning Not Finding iOS Devices:**
- Verify iOS device is advertising (check foreground/background state)
- Check local name parsing logic
- Ensure scan is filtering by Service UUID

**Connection Fails:**
- Check connection timeout settings
- Verify GATT service is added before advertising
- Review permission requirements (especially Android 12+)

**Profile Read Returns Empty/Invalid Data:**
- Verify `setProfileData()` called before advertising
- Check JSON serialization of profile object
- Review MTU size for large profiles with photos

## Performance Considerations

### Battery Life

**Advertising:**
- Continuous advertising drains battery
- Consider duty cycling in production (e.g., 5 min on, 5 min off)
- iOS background advertising is very low power

**Scanning:**
- Continuous scanning is high power consumption
- Use pulsed scanning (3s scan, 2s pause) for better battery life
- Implemented in `BLEManager.startPulsedScanning()`

### RSSI Threshold

Current threshold: `-85 dBm` (approximately 10 meters)

**Tuning:**
- Lower (more negative) = longer range, more devices
- Higher (less negative) = shorter range, fewer devices
- Consider environment (open space vs indoor)

### Device Expiry

Devices not seen for 15 seconds are removed from discovered list:
```typescript
const DEVICE_EXPIRY_TIME = 15000; // 15 seconds
```

This prevents stale entries but may cause flicker if RSSI varies.

## Future Enhancements

### Potential Improvements

1. **Service Data Instead of MSD**
   - Android could use Service Data (AD type 0x16)
   - Avoids Company ID requirement
   - Still works with iOS

2. **Enhanced Privacy**
   - Encrypt advertisement payloads
   - Use derived keys for verifiable anonymity
   - Implement formal challenge-response protocol

3. **Mesh Networking**
   - Extend handshake to support multi-hop
   - Use BLE as transport for mesh protocol
   - Enable broader community reach

4. **Background Synchronization**
   - Implement background task scheduling
   - Opportunistic syncing when devices nearby
   - Platform-specific background mode optimization

## References

- [Bluetooth Core Specification](https://www.bluetooth.com/specifications/specs/)
- [Apple CoreBluetooth Documentation](https://developer.apple.com/documentation/corebluetooth)
- [Android Bluetooth LE Guide](https://developer.android.com/guide/topics/connectivity/bluetooth/ble-overview)
- [Bluetooth SIG Company Identifiers](https://www.bluetooth.com/specifications/assigned-numbers/)

---

**Last Updated:** 2025-10-29  
**Version:** 1.0

