# BLE Cross-Platform Testing Guide

## Overview

This document provides comprehensive testing scenarios and debugging guidance for Bluetooth Low Energy (BLE) discovery between iOS and Android devices.

## Architecture

### Service UUID
Both platforms MUST use the same Service UUID for discovery:
```
6e400001-b5a3-f393-e0a9-e50e24dcca9e
```

### Advertisement Formats

#### iOS Advertisement
- **Service UUID**: `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
- **Local Name**: `LCNS:displayName:userHashHex:followTokenHex`
- **Example**: `LCNS:JG:e1bb088d7f01:d510479c`

#### Android Advertisement
- **Service UUID**: `6e400001-b5a3-f393-e0a9-e50e24dcca9e` (in advertisement)
- **Manufacturer Data**: `[version, nameLength, name..., userHash..., followToken...]` (in scan response)
- **Manufacturer ID**: `0x1337`

## Discovery Matrix

### iOS → iOS Discovery
**Format**: Local name parsing
**Expected Logs**:
```
[BLECentralManager] 📱 Discovered peripheral: <UUID>
[BLECentralManager]    ✅ HAS OUR SERVICE UUID!
[BLECentralManager] Found local name: LCNS:JG:e1bb088d7f01:d510479c
[BLECentralManager] ✅ Parsed device name from local name: JG
[BLECentralManager] 📤 Emitting device discovered event to JavaScript
```

### iOS → Android Discovery
**Format**: Manufacturer data parsing
**Expected Logs**:
```
[BLECentralManager] 📱 Discovered peripheral: <UUID>
[BLECentralManager]    ✅ HAS OUR SERVICE UUID!
[BLECentralManager] Found manufacturer data: 24 bytes
[BLECentralManager] ✅ Parsed device name from manufacturer data: Wizard
[BLECentralManager] 📤 Emitting device discovered event to JavaScript
```

### Android → iOS Discovery
**Format**: Local name parsing (LCNS format)
**Expected Logs**:
```
[BLECentralManager] onScanResult: device=XX:XX:XX:XX:XX:XX, rssi=-65
[BLECentralManager] ✅ Found device with our Service UUID
[BLECentralManager] No manufacturer data, checking local name: LCNS:JG:e1bb088d7f01:d510479c
[BLECentralManager] Parsing iOS local name: LCNS:JG:e1bb088d7f01:d510479c
[BLECentralManager] ✅ Parsed iOS LCNS advertisement - displayName: JG, userHash: e1bb088d7f01, followToken: d510479c
[BLECentralManager] ✅ Emitting deviceDiscovered event for XX:XX:XX:XX:XX:XX
```

### Android → Android Discovery
**Format**: Manufacturer data parsing
**Expected Logs**:
```
[BLECentralManager] onScanResult: device=XX:XX:XX:XX:XX:XX, rssi=-65
[BLECentralManager] ✅ Found device with our Service UUID
[BLECentralManager] Parsing Android-style manufacturer data: 24 bytes
[BLECentralManager] Manufacturer data hex: 010657697a6172642...
[BLECentralManager] ✅ Emitting deviceDiscovered event for XX:XX:XX:XX:XX:XX
```

## Verification Checklist

### Initial Setup
- [ ] Both devices show native modules loaded:
  ```
  LOG  🔌 Bluetooth Module Setup:
  LOG    - RNLCBluetoothModule: Found
  LOG    - RNLCBluetoothEventEmitter: Found
  ```
- [ ] Service UUIDs match on both platforms:
  ```
  iOS: [BLECentralManager] 🔑 SERVICE_UUID: 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
  Android: [BLECentralManager] 🔑 SERVICE_UUID: 6e400001-b5a3-f393-e0a9-e50e24dcca9e
  ```

### Advertising
- [ ] iOS advertising starts successfully:
  ```
  LOG  ✅ BLE broadcasting started successfully
  [BLEPeripheralManager] ✅ Advertisement verified - actively advertising
  ```
- [ ] Android advertising starts successfully:
  ```
  LOG  ✅ BLE advertising started successfully
  [BLEPeripheralManager] ✅ Advertising started successfully!
  ```

### Scanning
- [ ] iOS scanning starts:
  ```
  [BLECentralManager] 🔍 Scan started successfully
  ```
- [ ] Android scanning starts:
  ```
  [BLECentralManager] ✅ Scan started successfully
  ```

### Discovery
- [ ] Android discovers iOS device (look for LCNS parsing logs)
- [ ] iOS discovers Android device (look for manufacturer data logs)
- [ ] Devices appear in ConnectScreen nearby list
- [ ] Discovery works in both directions simultaneously

## Common Failure Patterns

### No Discovery Events

**Symptom**: No `onScanResult` (Android) or `didDiscover` (iOS) logs appear

**Possible Causes**:
1. **Service UUID Mismatch**: Check logs for exact UUID on both platforms
2. **RSSI Too Weak**: Devices too far apart (threshold: -70 dBm Android, -85 dBm iOS)
3. **Bluetooth Off**: Check system settings
4. **Permissions Missing**: Check location/Bluetooth permissions

**Debug Steps**:
```bash
# Android: Check if scanning is active
adb logcat | grep "Scan started successfully"

# iOS: Check in Xcode console for scan logs
```

### Format Parse Errors

**Symptom**: Discovery happens but fails to parse data

**Android Parsing iOS**:
```
⚠️ Not LCNS format - expected 'LCNS:' prefix
```
**Fix**: Verify iOS is advertising with `LCNS:` prefix in local name

**iOS Parsing Android**:
```
⚠️ No local name or manufacturer data in advertisement
```
**Fix**: Verify Android includes manufacturer data in scan response

### Advertisement Data Too Large

**Symptom**: 
```
ERROR  ❌ [BluetoothModule] Error: Advertising failed: Data too large
```

**Fix**: Android uses scan response to split data (already implemented)

## Performance Characteristics

### Discovery Time
- **Typical**: 1-3 seconds after starting scan
- **Max acceptable**: 5 seconds
- **Factors**: RSSI threshold, scan mode (LOW_LATENCY vs LOW_POWER)

### RSSI Thresholds
- **Android**: -70 dBm (≈5-7 meters)
- **iOS**: -85 dBm (≈10 meters, more permissive)

### Advertisement Sizes
- **iOS Local Name**: ~30 characters (fits in 31-byte limit)
- **Android Manufacturer Data**: 24 bytes (in scan response)
- **Combined with Service UUID**: Within BLE limits

## Edge Cases

### Bluetooth State Changes
**Scenario**: User turns Bluetooth off/on during operation

**Expected Behavior**:
- Scanning stops gracefully
- Advertising stops gracefully
- App shows appropriate error message
- Automatically resumes when Bluetooth enabled

### App Backgrounding
**Scenario**: App moved to background during scan/advertise

**iOS**: Background scanning continues with restrictions
**Android**: Foreground service keeps BLE active

### Multiple Devices
**Scenario**: 3+ devices nearby

**Expected**: All devices discovered and listed
**Watch for**: Duplicate entries (should be filtered by device ID)

### Service UUID Collision
**Scenario**: Another app uses similar Service UUID

**Mitigation**: Our UUID is registered and unique
**Check**: Verify manufacturer data or local name format matches

## Debugging Commands

### Android
```bash
# Watch all BLE logs
adb logcat | grep -E "BLECentralManager|BLEPeripheralManager"

# Check if module is loaded
adb logcat | grep "RNLCBluetoothModule"

# Monitor discovery events
adb logcat | grep "deviceDiscovered"

# Check permissions
adb shell dumpsys package com.localcommunity.network | grep permission
```

### iOS (Xcode Console)
```
# Filter for BLE logs
BLECentralManager
BLEPeripheralManager

# Check for discovery
"Discovered peripheral"
"Emitting device discovered"

# Check advertising
"Advertisement verified"
```

## Test Protocol

### Before Testing
1. Ensure both devices have latest builds installed
2. Verify Service UUIDs match in initialization logs
3. Confirm Bluetooth is enabled on both devices
4. Keep devices within 5 meters initially

### Test Sequence
1. **Start Device A** (e.g., iOS)
   - Wait for "BLE broadcasting started successfully"
   - Wait for "Scan started successfully"

2. **Start Device B** (e.g., Android)
   - Wait for "BLE advertising started successfully"
   - Wait for "Scan started successfully"

3. **Verify Discovery**
   - Watch Device A logs for Device B discovery
   - Watch Device B logs for Device A discovery
   - Both should discover within 5 seconds

4. **Check UI**
   - Open ConnectScreen on both devices
   - Verify other device appears in "Nearby" list
   - Verify display name is correct

### After Changes
If you modify BLE code, test all four discovery scenarios:
- iOS → iOS
- iOS → Android
- Android → iOS
- Android → Android

## Troubleshooting Quick Reference

| Issue | Check | Fix |
|-------|-------|-----|
| No native module | Logs show "Using mock implementation" | Rebuild and reinstall app |
| No discovery | Service UUID mismatch | Check initialization logs |
| Parse errors | Format mismatch | Verify LCNS prefix (iOS) |
| Weak signal | RSSI too low | Move devices closer |
| No events in JS | Event emitter not registered | Check module loading logs |

## Success Criteria

✅ Cross-platform discovery working when:
- Both devices show native modules loaded (no mock)
- Service UUIDs match exactly
- Discovery events appear in logs within 5 seconds
- Devices appear in ConnectScreen UI
- Can initiate connection from either device
- All four discovery scenarios work (iOS↔iOS, iOS↔Android, Android↔iOS, Android↔Android)

