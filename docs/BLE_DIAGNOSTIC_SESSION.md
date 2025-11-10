# BLE Cross-Platform Discovery Diagnostic Session

**Date:** October 29, 2025  
**Time:** 13:30:54  
**Issue:** iOS not discovering Android device in BLE scan

---

## Problem Statement

- ✅ **Android → iOS Discovery:** Working perfectly
  - Android (Samsung "Wizard") discovers iOS ("Wiz")
  - Can connect and exchange data
  
- ❌ **iOS → Android Discovery:** Not working
  - iOS shows no devices in scan results
  - iOS doesn't see Android "Wizard" 
  - But iOS can RECEIVE connections from Android (GATT server works)

---

## What We Know For Sure

### Android Advertising (Samsung "Wizard") ✅

**Main Advertisement:**
```
Service UUID: 6e400001-b5a3-f393-e0a9-e50e24dcca9e
Mode: LOW_LATENCY (frequent, ~100ms intervals)
TX Power: HIGH (maximum range)
Connectable: true
```

**Scan Response:**
```
Manufacturer Data: 18 bytes
  Company ID: 0x1337 (little-endian: 0x37 0x13)
  Payload: [version][nameLength]["Wizard"][userHash][followToken]
```

**Status:** Confirmed advertising (last restart 00:30:05)

### iOS Advertising (iPhone "JG 17") ✅

**Advertisement:**
```
Service UUID: 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
Local Name: "LCNS:Wiz:ab952761b2b6:0515b88e"
```

**Status:** Working (Android discovers it successfully)

### Configuration Match ✅

| Component | Android | iOS | Match? |
|-----------|---------|-----|--------|
| Service UUID | `6e400001-...` | `6E400001-...` | ✅ Yes (case insensitive) |
| In Main Packet | ✅ Yes | Looking for | ✅ Yes |
| Permissions | ✅ Granted | ✅ Granted | ✅ Yes |

---

## Diagnostic Layers Added

### Layer 1: TypeScript (BLEManager.ts)
```typescript
🔍 [BLEManager] startScanning() called
📡 [BLEManager] Setting isScanning=true and clearing devices
📡 [BLEManager] About to call Bluetooth.startScanning()...
✅ [BLEManager] Bluetooth.startScanning() completed successfully
```

**Purpose:** Verify high-level scanning flow

### Layer 2: JavaScript Bridge (BluetoothModule.js)
```javascript
🔍 [BluetoothModule.js] startScanning() called - about to call native module
🔍 [BluetoothModule.js] Native module exists: true
🔍 [BluetoothModule.js] Native startScanning exists: true
✅ [BluetoothModule.js] Native startScanning() returned: [result]
```

**Purpose:** Verify React Native bridge communication

### Layer 3: Native iOS (BLECentralManager.swift)
```swift
🔍 iOS startScanning called - Bluetooth state: [X]
✅ Starting scan for service: 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
👂 Listening for peripherals with service UUID...
```

**Purpose:** Verify CoreBluetooth scanning actually starts

**Bluetooth States:**
- 0 = unknown
- 1 = resetting
- 2 = unsupported
- 3 = unauthorized
- 4 = powered off
- **5 = powered on** ← This is what we need!

### Layer 4: Device Discovery (BLECentralManager.swift)
```swift
📱 iOS DISCOVERED: id=[device_id], name=Wizard, rssi=[signal]
```

**Purpose:** Verify devices are being discovered

---

## Current Build Status

**iOS App:**
- Built: 13:30:54 (October 29, 2025)
- Deployed to: iPhone JG 17 (00008150-000C05890E88401C)
- Diagnostics: All 4 layers included
- Native changes: BLECentralManager.swift updated with EventEmitter logging

**Android App:**
- Running on: Samsung Galaxy A36 (RFCY50T7TBY)
- Advertising: Active (confirmed)
- Discovering: Was discovering iOS "Wiz"

---

## Testing Instructions

### On iPhone "JG 17"

1. **Launch the app** (or relaunch if already open)
2. **Go to Connect screen**
3. **Observe console logs** - you should see diagnostic messages
4. **Wait 10 seconds** for scanning to discover devices
5. **Check device list** - should show "Wizard" if working

### What Each Diagnostic Pattern Means

**Pattern A: No diagnostics at all**
- App not running or crashed
- Check if app is actually open

**Pattern B: Only Level 1 (BLEManager)**
```
🔍 [BLEManager] startScanning() called
📡 [BLEManager] Setting isScanning=true...
[Nothing else]
```
- Bridge layer not responding
- Native module not loaded correctly

**Pattern C: Levels 1-2 only (BLEManager + Bridge)**
```
🔍 [BLEManager] startScanning() called
🔍 [BluetoothModule.js] startScanning() called...
[Nothing else from native]
```
- Native method failing silently
- Check for native error or exception

**Pattern D: Levels 1-3 (All layers, no discovery)**
```
🔍 [BLEManager] startScanning() called
🔍 [BluetoothModule.js] startScanning() called...
🔍 iOS startScanning called - Bluetooth state: 5
✅ Starting scan for service...
[No "iOS DISCOVERED" messages]
```
- Scanning is running but not finding devices
- Possible causes:
  - Android not in range
  - iOS scanning with wrong parameters
  - CoreBluetooth issue
  - Service UUID mismatch (unlikely - we verified)

**Pattern E: All 4 levels** ✅
```
🔍 [BLEManager] startScanning() called
🔍 [BluetoothModule.js] startScanning() called...
🔍 iOS startScanning called - Bluetooth state: 5
📱 iOS DISCOVERED: id=..., name=Wizard, rssi=-65
```
- **SUCCESS!** Everything working correctly

---

## Known Issues & Solutions

### Issue 1: iOS Simulator
- **Symptom:** No Bluetooth functionality
- **Cause:** Simulator has no Bluetooth hardware
- **Solution:** Use physical device (already doing this ✅)

### Issue 2: Background Scanning
- **Symptom:** Scanning stops when app is backgrounded
- **Cause:** iOS throttles background BLE scanning
- **Solution:** Keep app in foreground during testing ✅

### Issue 3: CoreBluetooth State
- **Symptom:** Bluetooth state != 5
- **Cause:** Bluetooth not ready or turned off
- **Solution:** 
  - Check Bluetooth state number in diagnostic logs
  - Turn Bluetooth OFF, wait 3 seconds, turn ON
  - Restart app

### Issue 4: Cached State
- **Symptom:** Worked before, stopped working
- **Cause:** CoreBluetooth state cached/stuck
- **Solution:**
  - Force close app completely
  - Turn Bluetooth OFF/ON
  - Reopen app

### Issue 5: Permission Issues
- **Symptom:** State = 3 (unauthorized)
- **Cause:** Bluetooth permission not granted
- **Solution:**
  - Settings → Privacy & Security → Bluetooth
  - Ensure app has permission
  - May need to delete and reinstall

---

## Next Steps

1. **Check iPhone logs** for diagnostic patterns
2. **Report which pattern you see** (A, B, C, D, or E)
3. **Note the Bluetooth state number**
4. **Verify both devices are in range** (within ~10 meters)
5. **Ensure Android is still on Connect screen** (actively advertising)

---

## Technical Details

### Why This Should Work

1. **Service UUID Match:** Android advertises `6e400001...` in main packet, iOS scans for it ✅
2. **Proper Advertisement:** Android uses LOW_LATENCY mode with HIGH power ✅
3. **iOS Scanning:** Configured with Service UUID filter + allow duplicates ✅
4. **Proven Discovery:** Android→iOS works, proving both platforms work individually ✅

### Why It Might Not Work

1. **iOS State:** CoreBluetooth not in "powered on" state
2. **Timing:** iOS starts scanning before Bluetooth is ready
3. **App Lifecycle:** iOS app backgrounded or suspended
4. **System Issue:** iOS Bluetooth cache needs reset

---

## Files Modified

**Native iOS:**
- `packages/rn-bluetooth/ios/BLECentralManager.swift`
  - Added EventEmitter debug messages
  - Enhanced logging in `startScanning()`
  - Logging in `didDiscover` callback

**JavaScript Bridge:**
- `packages/rn-bluetooth/src/BluetoothModule.js`
  - Added try-catch wrapper to `startScanning()`
  - Detailed logging of native module calls

**TypeScript Service:**
- `src/services/bluetooth/BLEManager.ts`
  - Enhanced logging in `startScanning()`
  - Step-by-step execution tracking

---

## Expected Outcome

Once diagnostics are checked, we should know:
1. Is iOS actually calling `startScanning()`?
2. What is CoreBluetooth's state?
3. Is scanning actually starting?
4. Are devices being discovered?

This will tell us exactly where the failure is happening and how to fix it.

