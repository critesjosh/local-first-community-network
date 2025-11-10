# BLE Discovery Debug Fixes

## Summary

Fixed two major issues with BLE discovery and logging:

### 1. Event Routing Fixed ✅

**Problem:**
- All debug messages from native iOS code were being sent through the "error" event type
- This caused log spam with messages like `ERROR [JG] [BLEConnectionHandler] BLE error: [NATIVE-PERIPH] initialize() called`

**Solution:**
- Added a new `debug` event type to `EventEmitter.swift`
- Replaced all `sendError()` calls with `sendDebug()` for status/debug messages in:
  - `BLEPeripheralManager.swift` (42 replacements)
  - `BLECentralManager.swift` (41 replacements)
- Updated JavaScript side to handle debug events properly:
  - Debug events are now logged with `console.debug()` only in `__DEV__` mode
  - They no longer appear as errors in production

### 2. Enhanced Discovery Logging ✅

**Problem:**
- Two devices weren't discovering each other
- No visibility into what was being advertised or scanned

**Solution:**
Added comprehensive logging to understand discovery flow:

#### Advertising Side (BLEPeripheralManager)
- Logs exact service UUID being advertised
- Logs local name format and length
- Logs advertising state verification
- Shows when `peripheralManagerDidStartAdvertising` is called

#### Scanning Side (BLECentralManager)
- Logs ALL discovered peripherals (not just ours)
- Shows peripheral name, UUID, and RSSI
- Lists all advertisement data keys received
- **Critically:** Checks if discovered peripheral has our service UUID
- Shows whether devices pass RSSI threshold

## What to Look For in Logs

### When Device Starts Advertising

Look for these logs:
```
[BLEPeripheralManager] 📦 Building advertisement data...
[BLEPeripheralManager]    Service UUID: 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
[BLEPeripheralManager]    Will advertise service: 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
[BLEPeripheralManager] ✅ Did start advertising successfully
[BLEPeripheralManager]    Broadcasting as: <name>
[BLEPeripheralManager]    Service UUID: 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
[BLEPeripheralManager] 📡 Other devices should now be able to discover this peripheral
```

### When Device Starts Scanning

Look for these logs:
```
[BLECentralManager] ✅ Starting BLE scan for service: 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
[BLECentralManager]    Service UUID string: 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
[BLECentralManager] 🔍 Scan started successfully
[BLECentralManager] 👂 Now listening for peripherals advertising service: 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
```

### When Peripheral is Discovered

**IMPORTANT:** The scanner will now log ALL discovered peripherals. Look for:

```
[BLECentralManager] 📱 Discovered peripheral: <UUID>
[BLECentralManager]    Name: <name or nil>
[BLECentralManager]    RSSI: -XX dBm
[BLECentralManager]    Advertisement data keys: kCBAdvDataServiceUUIDs, kCBAdvDataLocalName
[BLECentralManager]    Service UUIDs: 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
[BLECentralManager]    ✅ HAS OUR SERVICE UUID!
```

### Debugging Discovery Issues

#### Case 1: No Peripherals Discovered At All
If you see NO discovery logs, the issue is:
- Bluetooth might not be powered on
- App might not have Bluetooth permissions
- Devices are too far apart (RSSI < -85 dBm)

#### Case 2: Peripherals Discovered But Not Ours
If you see discovery logs but they show:
```
[BLECentralManager]    ⚠️  No service UUIDs advertised
```
OR
```
[BLECentralManager]    ⚠️  Does not have our service UUID
```

This means:
- **The advertising device is running in background** - iOS drastically limits background advertising
- **Both devices need to be in foreground** for reliable discovery
- The service UUID might not be included in the advertisement packet

#### Case 3: Discovery But RSSI Too Weak
```
[BLECentralManager]    ⛔️ Filtered out: RSSI too weak (-90 < -85)
```

Solution: Move devices closer together

## Testing Instructions

1. **Clean rebuild** (already done): `./rebuild-native.sh`

2. **Run on two physical devices:**
   ```bash
   yarn ios --device="iPhone JG (2)"
   yarn ios --device="iPhone Wiz"
   ```

3. **Ensure both apps are in foreground** - this is critical for iOS BLE discovery

4. **Watch the logs carefully** for the patterns above

5. **Expected successful flow:**
   - Device A starts advertising → see "Did start advertising successfully"
   - Device B starts scanning → see "Scan started successfully"
   - Device B discovers Device A → see "HAS OUR SERVICE UUID!"
   - Device B processes discovery → see "Emitting device discovered event to JavaScript"
   - JavaScript side → see "🆕 [BLE] New device: <name>"

## Common iOS BLE Limitations

### Background Advertising
When an app goes to background, iOS:
- Removes the local name from advertisement
- May not reliably advertise the service UUID
- Reduces advertising frequency

**Solution:** Keep both apps in foreground during discovery

### Simultaneous Advertising and Scanning
iOS can handle this, but it's resource-intensive. The pulsed scanning approach (3s scan, 2s pause) helps by:
- Giving advertising priority during pauses
- Reducing resource contention
- Improving overall discovery reliability

### Service UUID Case Sensitivity
iOS CoreBluetooth is case-insensitive for UUIDs, but they should match exactly:
- Advertising: `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`
- Scanning: `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`

## Next Steps

1. Test with both devices in foreground
2. Check the logs for the patterns above
3. If still no discovery, try:
   - Restarting both devices
   - Toggling Bluetooth off/on
   - Checking Bluetooth permissions in Settings
   - Moving devices closer together (< 3 meters)

## Files Changed

- `packages/rn-bluetooth/ios/EventEmitter.swift` - Added `sendDebug()` method
- `packages/rn-bluetooth/ios/BLEPeripheralManager.swift` - Enhanced logging, fixed event routing
- `packages/rn-bluetooth/ios/BLECentralManager.swift` - Enhanced logging, fixed event routing
- `packages/rn-bluetooth/src/BluetoothModule.js` - Handle debug events separately
- `src/services/bluetooth/BLEConnectionHandler.ts` - Filter debug events from error logs

