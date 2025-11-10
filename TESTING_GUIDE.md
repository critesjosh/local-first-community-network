# Testing Guide: BLE Discovery & Connection

## Current Status

✅ Discovery working - devices find each other  
⚠️ Manufacturer data not being transmitted/parsed correctly  
⏳ Need to verify native code is running with latest changes

## What to Look For

### When App Starts

**JavaScript logs:**
```
🔌 Bluetooth Module Setup:
  - RNLCBluetoothModule: Found
  - RNLCBluetoothEventEmitter: Found
```
✅ = Both modules loaded  
❌ = If either is "NOT FOUND", native bridge is broken

### When Advertising Starts

**JavaScript logs:**
```
🏗️ [BLEBroadcast] Building payload for: Wiz userId: G4VUvoBx...
  - Normalized name: Wiz → Truncated: Wiz
  - User hash (6 bytes): cbe349945cd5 ( 6 bytes)
  - Follow token (4 bytes): a1b2c3d4 ( 4 bytes)
✅ [BLEBroadcast] Payload built: {"displayName":"Wiz","userHashHex":"cbe349945cd5",...}

📡 [BluetoothModule] startAdvertising called with:
  - displayName: Wiz
  - userHashHex: cbe349945cd5
  - followTokenHex: a1b2c3d4
```

**Native logs (Xcode console):**
```
[BLEPeripheralManager] ⚡️ startAdvertising() called from Objective-C bridge
[BLEPeripheralManager] State changed to: 3
[BLEPeripheralManager] 📦 Building advertisement data...
  - Service UUID: 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
[BLEPeripheralManager] 🏗️ Building manufacturer data:
  - displayName: Wiz
  - userHashHex: cbe349945cd5
  - followTokenHex: a1b2c3d4
  - Normalized name: 'Wiz' (3 bytes)
  - User hash: cbe349945cd5
  - Follow token: a1b2c3d4
  - Total manufacturer data size: 16 bytes
  - Raw hex: 37130103576972cbe349945cd5a1b2c3d4
[BLEPeripheralManager] ✅ Did start advertising successfully
[BLEPeripheralManager] Broadcasting as: Wiz
```

### When Scanning Finds Device

**Native logs:**
```
[BLECentralManager] 📱 Discovered peripheral: ABC-123 RSSI: -55 dBm
[BLECentralManager] Found manufacturer data: 16 bytes
[BLECentralManager] Manufacturer ID: 0x1337
[BLECentralManager] ✅ Found device: Wiz
[EventEmitter] 📤 Sending deviceDiscovered event: ABC-123
```

**JavaScript logs:**
```
📱 [BluetoothModule] deviceDiscovered event received:
  - deviceId: ABC-123
  - rssi: -55
  - payload: {"displayName":"Wiz","userHashHex":"cbe349945cd5",...}

🔍 [BLE] Device discovered: Wiz (ABC-123) RSSI: -55 dBm
✅ [BLE] Adding device to list: Wiz (hash: cbe349945cd5)
📋 [BLE] Total devices discovered: 1
```

## Troubleshooting Steps

### If Name Shows as "Unknown"

**Check 1: Is manufacturer data being built?**
- Look for "🏗️ Building manufacturer data" in Xcode logs
- If missing: Native code not running → rebuild app
- If present: Check the "displayName" value

**Check 2: Is manufacturer data being received?**
- Look for "Found manufacturer data: X bytes" in Xcode logs
- If "No manufacturer data": iOS might be stripping it (try physical device)
- If present but wrong: Parsing issue

**Check 3: Is manufacturer ID correct?**
- Should see "Manufacturer ID: 0x1337"
- If different: Wrong device or app conflict
- If missing: Data format issue

### If Hash is Empty

**Check 1: Is userHashHex being created?**
- Look for "User hash (6 bytes): XXXXXX" in JS logs
- Should be 12 hex characters (6 bytes)
- If empty: userId might be undefined

**Check 2: Is it in the payload?**
- Look for payload JSON in logs
- Should have `"userHashHex":"cbe349945cd5"`
- If missing: buildManufacturerPayload issue

**Check 3: Is it being parsed?**
- Look for "User hash: XXXXXX" in native logs
- Should match JS hash
- If different: Hex parsing issue

### If No Devices Discovered

**Check 1: Is scanning actually starting?**
- Look for "✅ Starting BLE scan" in native logs
- Should show "🔍 Scan started - listening for devices..."

**Check 2: Is advertising working?**
- Look for "✅ Did start advertising successfully"
- Check other device's logs for this

**Check 3: Are they using same service UUID?**
- Both should show "Service UUID: 6E400001-B5A3-F393-E0A9-E50E24DCCA9E"

**Check 4: Is RSSI in range?**
- Threshold is -70 dBm
- Closer devices = stronger signal = higher (less negative) RSSI
- Move devices closer together

## Quick Test Procedure

1. **Open Xcode** → Window → Devices and Simulators → Select your simulator → Open Console
2. **Launch both app instances**
3. **Check module loading** (🔌 Bluetooth Module Setup)
4. **Start advertising** on both (should see automatically)
5. **Start scanning** on one device
6. **Watch Xcode console** for discovery logs
7. **Check React Native logs** in terminal
8. **Compare** what's being sent vs. what's received

## Expected Behavior

✅ Modules load successfully  
✅ Advertising starts with name and hash  
✅ Scanning finds devices within ~3 seconds  
✅ Discovered device shows correct name  
✅ Discovered device has hash  
✅ Can tap device to connect  
✅ Profile exchange succeeds  
✅ Connection appears in both apps  

## Current Issue

- Discovery works (device is found)
- But manufacturer data (name + hash) is empty
- Need to verify native code is actually running
- Logs should show manufacturer data being built and transmitted

## Next Actions

1. Rebuild app with `yarn ios`
2. Watch Xcode console for native logs
3. Verify manufacturer data is being built
4. Check if data is being received by scanner
5. If still issues, test on physical devices (simulators have limitations)

