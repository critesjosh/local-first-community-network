# BLE Cross-Platform Compatibility Guide

## Overview

This guide explains how the BLE implementation achieves cross-platform compatibility between iOS and Android devices despite their different capabilities and constraints.

## The Core Challenge

### Platform Capabilities Matrix

| Feature | iOS | Android | Impact |
|---------|-----|---------|--------|
| Advertise Service UUID | ✅ Yes | ✅ Yes | Primary discovery mechanism |
| Advertise Local Name | ✅ Yes | ✅ Yes | iOS uses this for data |
| Advertise Manufacturer Data | ❌ No | ✅ Yes | Android uses this for data |
| Advertise Service Data | ❌ No | ✅ Yes | Alternative not used |
| Scan for Service UUID | ✅ Yes | ✅ Yes | Both platforms filter this way |
| Read Manufacturer Data | ✅ Yes | ✅ Yes | iOS reads Android's MSD |
| Read Local Name | ✅ Yes | ✅ Yes | Android reads iOS's name |
| Background Advertising | ⚠️ Limited | ✅ Yes | iOS heavily restricted |
| Background Scanning | ⚠️ Limited | ✅ Yes | iOS requires Service UUID |

### Key Insight

**The fundamental constraint:** iOS applications cannot set arbitrary advertisement data. They can only set:
1. Service UUIDs (required)
2. Local Name (optional)

This is an Apple design decision, not a CoreBluetooth limitation.

## Our Solution: Bidirectional Compatibility

### Design Philosophy

```
┌──────────────────────────────────────────────────┐
│  Each platform advertises using its capabilities │
│  Each platform can read the other's format       │
└──────────────────────────────────────────────────┘
```

### Advertisement Strategy

**Android Devices:**
```
Advertise:
  - Service UUID (for discovery)
  - Manufacturer Specific Data (for details)
  
Read When Scanning:
  - Service UUID (to filter)
  - Manufacturer Data (if present, from Android)
  - Local Name (if present, from iOS)
```

**iOS Devices:**
```
Advertise:
  - Service UUID (for discovery)
  - Local Name with encoded data (for details)
  
Read When Scanning:
  - Service UUID (to filter)
  - Manufacturer Data (if present, from Android)
  - Local Name (if present, from iOS)
```

## Implementation Details

### iOS Peripheral (Advertising)

**Code Location:** `packages/rn-bluetooth/ios/BLEPeripheralManager.swift`

```swift
// iOS can only advertise Service UUID and Local Name
let advertisementData: [String: Any] = [
    CBAdvertisementDataServiceUUIDsKey: [SERVICE_UUID],
    CBAdvertisementDataLocalNameKey: "LCNS:\(displayName):\(userHashHex):\(followTokenHex)"
]
```

**Local Name Format:**
```
Prefix: "LCNS:"  (Local Community Network Service)
Format: LCNS:<displayName>:<userHashHex>:<followTokenHex>
Example: LCNS:Alice:a1b2c3d4e5f6:12345678

Components:
- displayName: User's display name (max 12 chars for size)
- userHashHex: First 6 bytes of SHA-256(userId), hex encoded (12 chars)
- followTokenHex: Random 4-byte token, hex encoded (8 chars)
```

**Size Considerations:**
```
Total = 5 + nameLength + 1 + 12 + 1 + 8 = 27 + nameLength characters

With 12 char name: 39 characters
iOS typically allows 20-30 bytes in local name
Foreground: Usually includes full name
Background: May truncate, but prefix + UUIDs preserved
```

### Android Peripheral (Advertising)

**Code Location:** `packages/rn-bluetooth/android/src/main/java/com/rnbluetooth/BLEPeripheralManager.kt`

```kotlin
// Main advertisement packet (primary, scannable)
val advertiseData = AdvertiseData.Builder()
    .setIncludeDeviceName(false)
    .setIncludeTxPowerLevel(false)
    .addServiceUuid(ParcelUuid(SERVICE_UUID))
    .build()

// Scan response packet (additional data when requested)
val scanResponse = AdvertiseData.Builder()
    .setIncludeDeviceName(false)
    .addManufacturerData(MANUFACTURER_ID, manufacturerData)
    .build()
```

**Manufacturer Data Format:**
```
Company ID: 0x1337 (2 bytes, little-endian, added by Android)
Payload: [version][nameLength][name...][userHash][followToken]

Breakdown:
[0]        version (1 byte)          = 0x01
[1]        nameLength (1 byte)       = length of name in bytes
[2..N]     displayName (variable)    = UTF-8 encoded, max 12 bytes
[N+2..N+7] userHash (6 bytes)        = First 6 bytes of SHA-256(userId)
[N+8..N+11] followToken (4 bytes)    = Random token

Total: 2 (Company ID) + 2 (version+length) + 12 (name) + 6 (hash) + 4 (token) = 26 bytes
Well under the 31-byte advertisement limit
```

**Why Scan Response?**
- Keeps main advertisement minimal for faster transmission
- Scan response only sent when central device actively requests it
- Reduces air pollution from constant large packets
- iOS still receives full data when scanning

### iOS Central (Scanning)

**Code Location:** `packages/rn-bluetooth/ios/BLECentralManager.swift`

```swift
// Scan for our Service UUID
centralManager.scanForPeripherals(
    withServices: [SERVICE_UUID],
    options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
)

// When device discovered, parse advertisement data
func centralManager(_ central: CBCentralManager,
                   didDiscover peripheral: CBPeripheral,
                   advertisementData: [String: Any],
                   rssi RSSI: NSNumber) {
    
    // Try iOS format first (local name)
    if let localName = advertisementData[CBAdvertisementDataLocalNameKey] as? String {
        payload = parseLocalName(localName)
    }
    
    // Try Android format (manufacturer data)
    if payload == nil,
       let mfgData = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data {
        payload = parseManufacturerData(mfgData)
    }
}
```

**Important iOS Notes:**
- Must specify Service UUID in scan (nil = no results or high battery drain)
- `CBAdvertisementDataManufacturerDataKey` includes Company ID prepended
- Manufacturer Data from Android includes 2-byte Company ID prefix
- iOS extracts everything after Company ID for parsing

### Android Central (Scanning)

**Code Location:** `packages/rn-bluetooth/android/src/main/java/com/rnbluetooth/BLECentralManager.kt`

```kotlin
// Start scan without hardware filter (more compatible)
val scanSettings = ScanSettings.Builder()
    .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
    .build()

bluetoothLeScanner.startScan(null, scanSettings, scanCallback)

// When device discovered, parse advertisement
override fun onScanResult(callbackType: Int, result: ScanResult) {
    // Filter by Service UUID
    val hasOurService = result.scanRecord?.serviceUuids?.any { 
        it.uuid == SERVICE_UUID 
    } == true
    
    if (!hasOurService) return
    
    // Try Android format first (manufacturer data)
    val manufacturerData = result.scanRecord?.getManufacturerSpecificData(MANUFACTURER_ID)
    if (manufacturerData != null) {
        payload = parseManufacturerData(manufacturerData)
    } else {
        // Try iOS format (local name)
        val localName = result.scanRecord?.deviceName
        if (localName != null) {
            payload = parseLocalName(localName)
        }
    }
}
```

**Important Android Notes:**
- Can scan with or without hardware filters
- `getManufacturerSpecificData()` returns data WITHOUT Company ID
- Company ID used as lookup key, data is just the payload
- Local name parsing handles iOS "LCNS:" format

## Parsing Functions

### Parse Local Name (iOS Format)

**Both Platforms Implement:**

```typescript
// TypeScript representation
function parseLocalName(localName: string): AdvertisementPayload | null {
    // Check for LCNS prefix
    if (!localName.startsWith("LCNS:")) {
        return null;
    }
    
    // Remove prefix: "LCNS:"
    const content = localName.substring(5);
    
    // Split by colons: "<displayName>:<userHashHex>:<followTokenHex>"
    const parts = content.split(":");
    
    if (parts.length !== 3) {
        return null;
    }
    
    return {
        version: 1,
        displayName: parts[0] || null,
        userHashHex: parts[1],
        followTokenHex: parts[2]
    };
}
```

**Example:**
```
Input:  "LCNS:Alice:a1b2c3d4e5f6:12345678"
Output: {
    version: 1,
    displayName: "Alice",
    userHashHex: "a1b2c3d4e5f6",
    followTokenHex: "12345678"
}
```

### Parse Manufacturer Data (Android Format)

**Both Platforms Implement:**

```typescript
// TypeScript representation
function parseManufacturerData(data: Uint8Array): AdvertisementPayload | null {
    if (data.length < 2) {
        return null;
    }
    
    let offset = 0;
    
    // Read version
    const version = data[offset++];
    
    // Read name length
    const nameLength = data[offset++];
    
    // Read display name
    const nameBytes = data.slice(offset, offset + nameLength);
    const displayName = new TextDecoder().decode(nameBytes);
    offset += nameLength;
    
    // Read user hash (6 bytes)
    const userHashBytes = data.slice(offset, offset + 6);
    const userHashHex = Array.from(userHashBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    offset += 6;
    
    // Read follow token (4 bytes)
    const followTokenBytes = data.slice(offset, offset + 4);
    const followTokenHex = Array.from(followTokenBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    
    return {
        version,
        displayName: displayName || null,
        userHashHex,
        followTokenHex
    };
}
```

**Example:**
```
Input:  [0x01, 0x05, 'A', 'l', 'i', 'c', 'e', 
         0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6,
         0x12, 0x34, 0x56, 0x78]
         
Output: {
    version: 1,
    displayName: "Alice",
    userHashHex: "a1b2c3d4e5f6",
    followTokenHex: "12345678"
}
```

## Testing Cross-Platform Compatibility

### Test Matrix

| Advertiser | Scanner | Expected Result |
|------------|---------|-----------------|
| iOS | iOS | ✅ Local Name → Local Name parser |
| iOS | Android | ✅ Local Name → Local Name parser |
| Android | iOS | ✅ MSD → MSD parser |
| Android | Android | ✅ MSD → MSD parser |

### Verification Steps

1. **iOS → iOS**
   ```
   Device A (iOS): Advertise with local name
   Device B (iOS): Scan and parse local name
   Expected: Device B discovers Device A with correct data
   ```

2. **iOS → Android**
   ```
   Device A (iOS): Advertise with local name
   Device B (Android): Scan and parse local name
   Expected: Device B discovers Device A with correct data
   ```

3. **Android → iOS**
   ```
   Device A (Android): Advertise with manufacturer data
   Device B (iOS): Scan and parse manufacturer data
   Expected: Device B discovers Device A with correct data
   ```

4. **Android → Android**
   ```
   Device A (Android): Advertise with manufacturer data
   Device B (Android): Scan and parse manufacturer data
   Expected: Device B discovers Device A with correct data
   ```

### Debug Checklist

When cross-platform discovery fails:

**iOS Not Finding Android:**
- [ ] Android advertising Service UUID? Check logs
- [ ] iOS scanning for Service UUID? Check scan parameters
- [ ] Android manufacturer data within size limits?
- [ ] iOS MSD parser handling Company ID correctly?
- [ ] RSSI within threshold? Check signal strength

**Android Not Finding iOS:**
- [ ] iOS advertising in foreground? Background is limited
- [ ] iOS local name being set correctly? Check logs
- [ ] Android local name parser recognizing "LCNS:" prefix?
- [ ] Android scanning without hardware filter? Some devices need this
- [ ] Service UUID filter working? Verify UUID matches

## Background Mode Considerations

### iOS Background Limitations

**Advertising:**
```
Foreground:
- Full control over advertisement
- Local name included completely
- High power, frequent updates

Background:
- Apple manages advertisement
- Local name may be truncated
- Service UUID always included
- Very low power
- Updates infrequent
```

**Scanning:**
```
Foreground:
- All advertisement data available
- High frequency updates
- Custom RSSI filtering

Background:
- Must scan for specific Service UUID
- Reduced scan frequency
- Advertisement data may be cached
- Battery optimized
```

**Production Implications:**
- Don't rely on immediate discovery in background
- Service UUID is critical for background operation
- Test background-to-background discovery thoroughly

### Android Background Considerations

**Advertising:**
```
Foreground:
- Full control
- All data included
- High power

Background (with Foreground Service):
- Continues normally
- Requires ongoing notification
- User aware of operation
```

**Scanning:**
```
Foreground:
- All ScanRecord data available
- High frequency

Background (with Foreground Service):
- Continues normally
- Must use Foreground Service on Android 8+
- Subject to Doze mode optimizations
```

**Production Implications:**
- Use Foreground Service for background operation
- Doze mode may affect discovery latency
- Test on various manufacturers (Samsung, OnePlus, etc.)

## Common Pitfalls

### 1. Company ID Confusion

**Problem:** Thinking app needs to handle Company ID in payload
```kotlin
// WRONG - App payload includes Company ID
val payload = byteArrayOf(0x37, 0x13, version, nameLength, ...)
```

**Solution:** Platform handles Company ID automatically
```kotlin
// CORRECT - Just the payload
val payload = byteArrayOf(version, nameLength, ...)
addManufacturerData(MANUFACTURER_ID, payload)
```

### 2. Endianness Mistakes

**Problem:** Assuming big-endian Company ID
```
Company ID 0x1337
Wrong byte order: [0x13, 0x37]
```

**Solution:** Company ID is little-endian in BLE
```
Company ID 0x1337
Correct byte order: [0x37, 0x13]
Android does this automatically
iOS sees this when parsing
```

### 3. iOS Manufacturer Data Assumption

**Problem:** Trying to set manufacturer data on iOS
```swift
// DOESN'T WORK ON iOS
advertisementData[CBAdvertisementDataManufacturerDataKey] = myData
```

**Solution:** Use local name instead
```swift
// WORKS ON iOS
advertisementData[CBAdvertisementDataLocalNameKey] = "LCNS:..."
```

### 4. Parsing Without Company ID Check

**Problem (iOS):** Not accounting for Company ID prefix
```swift
// WRONG - Data includes 2-byte Company ID prefix
let version = data[0]  // This is actually byte 1 of Company ID!
```

**Solution:** Skip first 2 bytes or use Company ID as filter
```swift
// CORRECT - Platform already filtered by Company ID
// data is just the payload (without Company ID prefix in this case)
// OR
// Parse with Company ID check if needed
```

**Note:** On iOS, `CBAdvertisementDataManufacturerDataKey` data includes Company ID.
On Android, `getManufacturerSpecificData(companyId)` returns data WITHOUT Company ID.

### 5. Service UUID Not Set

**Problem:** Advertising without Service UUID
```kotlin
// WRONG - No Service UUID
val advertiseData = AdvertiseData.Builder()
    .addManufacturerData(MANUFACTURER_ID, data)
    .build()
```

**Solution:** Always include Service UUID
```kotlin
// CORRECT
val advertiseData = AdvertiseData.Builder()
    .addServiceUuid(ParcelUuid(SERVICE_UUID))
    .addManufacturerData(MANUFACTURER_ID, data)
    .build()
```

## Best Practices Summary

### ✅ Do This

1. **Always advertise Service UUID** - Required for reliable discovery
2. **Parse both formats** - Handle iOS and Android advertisements
3. **Test cross-platform** - Every combination of iOS/Android
4. **Keep advertisements small** - Well under 31-byte limit
5. **Filter by Service UUID when scanning** - Reduces noise and saves battery
6. **Handle missing data gracefully** - Not all fields always present

### ❌ Avoid This

1. **Don't assume one platform** - Support both iOS and Android
2. **Don't put Company ID in app payload** - Platform handles it
3. **Don't rely on background on iOS** - Heavily limited
4. **Don't parse raw without filtering** - Filter by Service UUID first
5. **Don't assume MAC addresses** - Use app-level identifiers
6. **Don't ship with test Company ID** - Get official ID for production

## Future-Proofing

### Potential iOS Changes

Apple may:
- Add support for Service Data in future iOS versions
- Relax background advertising restrictions
- Provide new privacy controls

**Recommendation:** Abstract advertisement format in code to easily switch implementations.

### Potential Android Changes

Google may:
- Further restrict background scanning (like iOS)
- Add new privacy protections
- Change permission requirements

**Recommendation:** Follow Android BLE best practices documentation closely.

### Protocol Versioning

The `version` field in advertisements enables future changes:
```
Version 1 (current): [version][nameLength][name][hash][token]
Version 2 (future):  [version][flags][name][hash][token][extras]

Code should check version and handle accordingly:
- Version 1: Parse as documented
- Version 2+: Parse new format or ignore if unknown
```

## Summary

Cross-platform BLE compatibility is achieved by:

1. **Common Service UUID** - Universal discovery mechanism
2. **Platform-appropriate data** - Android uses MSD, iOS uses Local Name
3. **Bidirectional parsing** - Each platform reads the other's format
4. **GATT for complex data** - Advertisements minimal, full data via GATT
5. **Thorough testing** - Verify all platform combinations

This design works within the constraints of both platforms while maximizing compatibility and reliability.

---

**Last Updated:** 2025-10-29  
**Version:** 1.0

