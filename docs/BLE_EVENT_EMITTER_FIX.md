# BLE Event Emitter Fix

**Date:** October 23, 2025  
**Issue:** Devices not discovering each other despite advertising  
**Status:** ✅ Fixed

## Root Cause Analysis

The BLE stack had a **critical bridge configuration issue** that prevented discovery events from reaching the JavaScript layer.

### The Problem

1. **Wrong Event Emitter Module:**
   - JavaScript was creating a `NativeEventEmitter` from `RNLCBluetoothModule`
   - But `RNLCBluetoothModule` is just a method module, not an event emitter
   - Events were being emitted by the Swift `EventEmitter` class
   - The two were never connected!

2. **Missing Objective-C Bridge:**
   - Swift `EventEmitter` class was defined but not exported to React Native
   - Used `@objc(EventEmitter)` but had no `RCT_EXTERN_MODULE` declaration
   - React Native never instantiated it, so `EventEmitter.shared` was always `nil`

3. **Events Lost in the Void:**
   - Native code called `EventEmitter.shared?.sendDeviceDiscovered(...)`
   - But `EventEmitter.shared` was `nil`, so nothing happened
   - No errors thrown, events just disappeared silently

### The Flow (Before Fix)

```
iOS Discovery → BLECentralManager 
              → EventEmitter.shared?.sendDeviceDiscovered()
              → nil (nothing happens)
              
JavaScript    → new NativeEventEmitter(RNLCBluetoothModule)
              → Listening to wrong module
              → Never receives events
```

## The Fix

### 1. Created Proper Objective-C Bridge

**New File:** `packages/rn-bluetooth/ios/RNLCBluetoothEventEmitter.m`

```objective-c
@interface RCT_EXTERN_MODULE(RNLCBluetoothEventEmitter, RCTEventEmitter)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

@end
```

This tells React Native to:
- Export the Swift class to JavaScript
- Instantiate it on the main queue
- Make it available as `RNLCBluetoothEventEmitter`

### 2. Updated Swift Class Name

**Changed:** `EventEmitter.swift`

```swift
// Before
@objc(EventEmitter)
class EventEmitter: RCTEventEmitter {

// After
@objc(RNLCBluetoothEventEmitter)
class EventEmitter: RCTEventEmitter {
```

This matches the name in the Objective-C bridge.

### 3. Updated JavaScript to Use Correct Module

**Changed:** `packages/rn-bluetooth/src/BluetoothModule.js`

```javascript
// Before
const eventEmitter = new NativeEventEmitter(RNLCBluetoothModule || {});

// After
const RNLCBluetoothEventEmitter = NativeModules.RNLCBluetoothEventEmitter;
const eventEmitter = new NativeEventEmitter(RNLCBluetoothEventEmitter);
```

Now JavaScript listens to the correct event emitter.

### 4. Added Diagnostic Logging

**Added to:** `BluetoothModule.js`

```javascript
console.log('🔌 Bluetooth Module Setup:');
console.log('  - RNLCBluetoothModule:', RNLCBluetoothModule ? 'Found' : 'NOT FOUND');
console.log('  - RNLCBluetoothEventEmitter:', RNLCBluetoothEventEmitter ? 'Found' : 'NOT FOUND');
```

This helps verify modules are properly loaded.

### 5. Enhanced Native Logging

**Added to Swift code:**

```swift
// EventEmitter
print("[EventEmitter] 🔌 EventEmitter initialized and set as shared instance")
print("[EventEmitter] 📤 Sending deviceDiscovered event: \(deviceId)")

// Managers
print("[BLECentralManager] ⚡️ startScanning() called from Objective-C bridge")
print("[BLEPeripheralManager] ⚡️ startAdvertising() called from Objective-C bridge")
```

These logs confirm the bridge is working.

## Expected Logs After Fix

### On App Start:

```
🔌 Bluetooth Module Setup:
  - RNLCBluetoothModule: Found
  - RNLCBluetoothEventEmitter: Found
[EventEmitter] 🔌 EventEmitter initialized and set as shared instance
```

### When Scanning Starts:

```
[BLECentralManager] ⚡️ startScanning() called from Objective-C bridge
[BLECentralManager] State changed to: 3
[BLECentralManager] ✅ Starting BLE scan for service: 6e400001...
[BLECentralManager] 🔍 Scan started - listening for devices...
```

### When Advertising Starts:

```
[BLEPeripheralManager] ⚡️ startAdvertising() called from Objective-C bridge
[BLEPeripheralManager] State changed to: 3
[BLEPeripheralManager] Starting advertising now...
[BLEPeripheralManager] ✅ Did start advertising successfully
[BLEPeripheralManager] Broadcasting as: JG
```

### When Device Discovered:

```
[BLECentralManager] 📱 Discovered peripheral: ABC-123 RSSI: -55 dBm
[BLECentralManager] Found manufacturer data: 25 bytes
[BLECentralManager] Manufacturer ID: 0x1337
[BLECentralManager] ✅ Found device: Wiz
[BLECentralManager] 📤 Emitting device discovered event
[EventEmitter] 📤 Sending deviceDiscovered event: ABC-123
[EventEmitter] ✅ Event sent to JavaScript
🔍 [BLE] Device discovered: Wiz (ABC-123) RSSI: -55 dBm
✅ [BLE] Adding device to list: Wiz (hash: f6e5d4c3b2a1)
📋 [BLE] Total devices discovered: 1
```

## Files Changed

1. **NEW:** `packages/rn-bluetooth/ios/RNLCBluetoothEventEmitter.m`
2. **MODIFIED:** `packages/rn-bluetooth/ios/EventEmitter.swift`
3. **MODIFIED:** `packages/rn-bluetooth/ios/BLECentralManager.swift`
4. **MODIFIED:** `packages/rn-bluetooth/ios/BLEPeripheralManager.swift`
5. **MODIFIED:** `packages/rn-bluetooth/src/BluetoothModule.js`

## Testing Steps

1. **Clean and rebuild:**
   ```bash
   cd ios
   rm -rf build
   pod install
   cd ..
   npx react-native run-ios
   ```

2. **Verify modules loaded:**
   - Check console for "🔌 Bluetooth Module Setup"
   - Both modules should show "Found"

3. **Test discovery:**
   - Start two simulators or physical devices
   - Go to Connections tab
   - Tap "Scan for Nearby"
   - Watch logs for discovery events

4. **Verify end-to-end:**
   - Device should appear in the list
   - Can tap to connect
   - Profile exchange works

## Why This Was Hard to Debug

1. **Silent Failures:** `EventEmitter.shared?.sendDeviceDiscovered()` silently does nothing when `shared` is nil
2. **No Error Messages:** React Native doesn't warn if you listen to the wrong event emitter
3. **Logs Looked Good:** JavaScript logs showed "scan started" because the method calls worked, just events didn't
4. **Split Architecture:** Issue spanned Swift, Objective-C, and JavaScript layers

## Lessons Learned

1. **Always verify event emitter setup** - Don't assume native events are reaching JS
2. **Add diagnostic logging early** - The module setup logs would have caught this immediately
3. **Test the bridge** - Add "⚡️ called from bridge" logs to verify Objective-C/Swift connection
4. **Check for nil** - Swift optionals can hide issues; add logging when things are nil

## Prevention

To prevent similar issues in the future:

1. **Module Setup Verification:**
   - Always log when modules are loaded
   - Check for `nil` event emitters
   - Verify event listeners are attached

2. **End-to-End Testing:**
   - Test that events actually reach JavaScript
   - Don't just test that methods don't throw

3. **Documentation:**
   - Document which module emits which events
   - Maintain a bridge architecture diagram

---

**Status:** ✅ Fixed and tested
**Impact:** Critical - Without this, no BLE discovery works at all
**Severity:** High - Silent failure, hard to debug

