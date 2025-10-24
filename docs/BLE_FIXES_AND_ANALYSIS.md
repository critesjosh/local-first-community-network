# BLE Fixes and Analysis

**Date:** October 23, 2025  
**Status:** ✅ Fixed

## Executive Summary

This document details the comprehensive analysis and fixes applied to resolve BLE (Bluetooth Low Energy) discovery issues. The main problems were:

1. **Race condition** in Bluetooth initialization causing "not powered on" errors
2. **Missing profile data** setup preventing proper GATT server operation
3. **Inadequate logging** making debugging difficult

All issues have been resolved with proper state management, error handling, and enhanced logging.

---

## Issues Identified

### Issue #1: "Bluetooth is not powered on" Error

**Symptom:**
```
ERROR  ❌ Error advertising BLE presence: [Error: Bluetooth is not powered on]
```

**Root Cause:**
The `BLEPeripheralManager` was rejecting advertising requests when `peripheralManager.state != .poweredOn`. However, when `initialize()` is called, the `CBPeripheralManager` starts in an `.unknown` or `.resetting` state and transitions to `.poweredOn` asynchronously via the delegate callback.

The JavaScript code was calling `startAdvertising()` immediately after `initialize()`, before the state transition completed.

**Files Affected:**
- `/packages/rn-bluetooth/ios/BLEPeripheralManager.swift`
- `/src/services/bluetooth/BLEBroadcastService.ts`

**Fix Applied:**
1. Added a pending advertisement queue that stores advertisement requests when Bluetooth is initializing
2. When `peripheralManagerDidUpdateState` receives `.poweredOn`, it automatically starts any queued advertisements
3. Improved error messages to distinguish between temporary (initializing) and permanent (powered off, unauthorized) states
4. Added `isReady` flag to track Bluetooth state

**Code Changes:**

```swift
// Added properties
private var isReady = false
private var pendingAdvertisement: (displayName: String, userHashHex: String, followTokenHex: String)?

// Modified startAdvertising to queue requests
if peripheralManager.state != .poweredOn {
    // Queue the advertisement instead of throwing error immediately
    pendingAdvertisement = (displayName, userHashHex, followTokenHex)
    
    // Only throw for permanent failure states
    if peripheralManager.state == .poweredOff { throw error }
    return // Wait for state change
}

// Auto-start queued advertisements when powered on
case .poweredOn:
    if let pending = pendingAdvertisement {
        try startAdvertising(...)
    }
```

---

### Issue #2: Missing Profile Data Setup

**Symptom:**
- Devices scan successfully but don't discover each other
- When connecting, profile reads fail or return empty data

**Root Cause:**
The `BLEBroadcastService.start()` method wasn't calling `setProfileData()` before starting advertising. This meant the GATT server had no profile data to serve when other devices connected and tried to read the Profile characteristic.

**Files Affected:**
- `/src/services/bluetooth/BLEBroadcastService.ts`
- `/App.tsx`

**Fix Applied:**
1. Modified `BLEBroadcastService.start()` to accept an optional `fullProfile` parameter
2. If provided, it calls `setProfileData()` before starting advertising
3. Updated `App.tsx` to construct and pass the full profile including `userId`, `displayName`, `publicKey`, and `profilePhoto`

**Code Changes:**

```typescript
// BLEBroadcastService.ts
async start(profile: BroadcastProfile, fullProfile?: any): Promise<void> {
    if (fullProfile) {
        await this.setProfileData(JSON.stringify(fullProfile));
    }
    await this.refreshBroadcast();
}

// App.tsx
const fullProfile = {
    userId: user.id,
    displayName: user.displayName,
    publicKey: Buffer.from(identity.publicKey).toString('base64'),
    profilePhoto: user.profilePhoto,
};
await BLEBroadcastService.start({...}, fullProfile);
```

---

### Issue #3: Inadequate Logging

**Symptom:**
- Difficult to debug what's happening during discovery
- No visibility into why devices aren't finding each other
- Can't tell if advertising is actually working

**Root Cause:**
Insufficient logging throughout the BLE stack made it impossible to diagnose issues.

**Files Affected:**
- `/packages/rn-bluetooth/ios/BLEPeripheralManager.swift`
- `/packages/rn-bluetooth/ios/BLECentralManager.swift`
- `/src/services/bluetooth/BLEManager.ts`
- `/src/services/bluetooth/BLEBroadcastService.ts`

**Fix Applied:**
Added comprehensive logging with emoji indicators:
- ✅ Success messages
- ❌ Error messages
- ⚠️ Warnings
- 🔍 Discovery events
- 📡 Broadcasting events
- 🔐 Security/filtering events
- 📋 State information

**Enhanced Logging Examples:**

```swift
// Peripheral Manager
print("[BLEPeripheralManager] State changed to: \(peripheral.state.rawValue)")
print("[BLEPeripheralManager] ✅ Peripheral manager powered on")
print("[BLEPeripheralManager] Broadcasting as: \(name)")

// Central Manager
print("[BLECentralManager] 📱 Discovered peripheral: \(id) RSSI: \(rssi) dBm")
print("[BLECentralManager] ✅ Found device: \(displayName)")
print("[BLECentralManager] 🔍 Scan started - listening for devices...")
```

```typescript
// TypeScript
console.log(`📡 Broadcasting as "${displayName}" (hash: ${userHashHex})`);
console.log(`✅ BLE advertisement active - fingerprint: ${fingerprint}`);
console.log(`🔍 [BLE] Device discovered: ${name} RSSI: ${rssi} dBm`);
```

---

## Testing Recommendations

### Test Scenario 1: Clean Initialization
1. Fresh app launch on both devices
2. Verify logs show:
   - `[BLEPeripheralManager] State changed to: 3` (poweredOn)
   - `[BLEPeripheralManager] ✅ Did start advertising successfully`
   - `[BLECentralManager] ✅ Bluetooth powered on - ready to scan`

### Test Scenario 2: Discovery Flow
1. Device A starts broadcasting
2. Device B starts scanning
3. Verify logs show:
   - `[BLECentralManager] 📱 Discovered peripheral: [UUID] RSSI: -XX dBm`
   - `[BLECentralManager] Found manufacturer data: XX bytes`
   - `[BLECentralManager] ✅ Found device: [Name]`
   - `🔍 [BLE] Device discovered: [Name] ([ID]) RSSI: -XX dBm`
   - `✅ [BLE] Adding device to list: [Name]`

### Test Scenario 3: Self-Filtering
1. Single device with both broadcast and scan active
2. Verify logs show:
   - `🔐 [BLE] Local fingerprint: [hash]`
   - `🚫 [BLE] Filtered: Own device broadcast (hash: [hash])`

### Test Scenario 4: Connection and Profile Read
1. Device B discovers Device A
2. Device B connects and reads profile
3. Verify:
   - Profile data is received
   - Contains userId, displayName, publicKey, profilePhoto

---

## Architecture Improvements

### State Management
- Added `isReady` flag to track Bluetooth power state
- Implemented pending operation queue for requests made during initialization
- Proper state transitions with delegate callbacks

### Error Handling
- Differentiated temporary vs permanent errors
- Specific error messages for each failure mode
- Graceful degradation instead of hard failures

### Logging Strategy
- Consistent format: `[Component] emoji Message`
- Three levels: Native Swift → JS Module → App Layer
- Searchable patterns for debugging

---

## Known Limitations

### iOS Background Advertising
iOS limits what can be advertised in the background:
- Service UUID is always advertised
- Manufacturer data might be stripped
- Local name might not be included
- Solution: Keep app in foreground during active discovery

### RSSI Filtering
Current threshold: -70 dBm
- May need adjustment based on environment
- Consider making it user-configurable
- Add UI indicator of signal strength

### Discovery Latency
- iOS scans can take 1-3 seconds to discover a device
- Advertisement rotation (every 30s) might interrupt discovery
- Consider pausing rotation during active scanning

---

## Future Enhancements

### 1. Background Mode Support
- Implement proper background state preservation
- Add background task for periodic advertising
- Handle app suspension/resumption

### 2. Discovery Optimization
- Implement smart scan intervals (scan 5s, rest 10s)
- Add proximity-based RSSI filtering
- Cache recently seen devices

### 3. Connection Pooling
- Maintain active connections to frequent contacts
- Implement reconnection logic
- Add connection quality metrics

### 4. Error Recovery
- Auto-retry failed advertisements
- Detect and recover from Bluetooth resets
- Handle permission changes gracefully

---

## Debugging Guide

### Enable Verbose Logging

**Xcode Console:**
```bash
# Filter for BLE logs
xcrun simctl spawn booted log stream --predicate 'subsystem contains "bluetooth"' --level debug
```

**React Native Logs:**
```bash
# In terminal
npx react-native log-ios | grep "BLE"
```

### Common Issues

**"No devices discovered"**
- Check: Is advertising actually started? Look for "✅ Did start advertising successfully"
- Check: Is scanning started? Look for "🔍 Scan started - listening for devices..."
- Check: Are devices close enough? RSSI should be > -70 dBm
- Check: Is Bluetooth enabled on both devices?

**"Bluetooth is not powered on"**
- Check: Do you see "State changed to: 3" (poweredOn)?
- Check: Is there a "Queuing advertisement" message? (Good - means it will auto-start)
- Check: Device Settings → Bluetooth → ON

**"Own device filtered out"**
- Check: Do you see "🔐 [BLE] Local fingerprint: [hash]"?
- Check: Do you see "🚫 [BLE] Filtered: Own device broadcast"?
- This is expected behavior - device correctly filtering itself

**"Profile read fails"**
- Check: Was `setProfileData` called? Look for "📋 Setting profile data for GATT server..."
- Check: Is the profile valid JSON?
- Check: Does it include userId, displayName, publicKey?

---

## Verification Checklist

- [x] Fixed "Bluetooth is not powered on" error
- [x] Implemented pending advertisement queue
- [x] Added profile data setup in broadcast flow
- [x] Enhanced logging throughout BLE stack
- [x] Updated error messages for clarity
- [x] Added state management improvements
- [x] Documented all changes

---

## References

- **Apple CoreBluetooth Documentation:** https://developer.apple.com/documentation/corebluetooth
- **CBPeripheralManager State Changes:** https://developer.apple.com/documentation/corebluetooth/cbmanagerstate
- **BLE GATT Characteristics:** https://www.bluetooth.com/specifications/gatt/
- **React Native Native Modules:** https://reactnative.dev/docs/native-modules-ios

---

## Change Log

**2025-10-23**
- Fixed peripheral manager initialization race condition
- Added pending advertisement queue
- Implemented profile data setup
- Enhanced logging throughout stack
- Improved error messages and handling

