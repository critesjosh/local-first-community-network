# Manufacturer Data Issue

## Problem

Manufacturer data (displayName, userHashHex, followTokenHex) is being built in JavaScript but arriving empty when scanned.

**JavaScript (Sending):**
```javascript
📡 [BluetoothModule] startAdvertising called with:
  - displayName: Wiz
  - userHashHex: cbe349945cd5
  - followTokenHex: 7af0ee1d
```

**Native (Received):**
```javascript
📱 [BluetoothModule] deviceDiscovered event received:
  - payload: {"userHashHex":"","displayName":null,"version":0,"followTokenHex":""}
```

## Possible Causes

### 1. Native Code Not Rebuilt
- The enhanced logging we added to `BLEPeripheralManager.swift` isn't showing
- Need to verify native code is running with latest changes
- Solution: Full clean rebuild

### 2. iOS Simulator Limitation
- iOS simulators can strip manufacturer data
- This is a known limitation of CoreBluetooth on simulator
- Solution: Test on physical devices

### 3. Manufacturer Data Format Issue
- Data might be malformed
- Need to check Xcode console for native logs
- Solution: Add hex dump of manufacturer data

### 4. Advertisement Not Starting
- The "Advertising has already started" error might indicate a problem
- Solution: Better state management in native code

## Debug Steps

### Step 1: Check Xcode Console
```
Window → Devices and Simulators → Select Simulator → Open Console
```

Look for these logs:
```
[BLEPeripheralManager] 📦 Building advertisement data...
[BLEPeripheralManager] 🏗️ Building manufacturer data:
  - displayName: Wiz
  - userHashHex: cbe349945cd5
  - Total manufacturer data size: X bytes
  - Raw hex: 37130103576972cbe349945cd5...
```

If you DON'T see these logs → **Native code not rebuilt**

### Step 2: Check Discovery Logs
```
[BLECentralManager] 📱 Discovered peripheral: ...
[BLECentralManager] Found manufacturer data: X bytes
[BLECentralManager] Manufacturer ID: 0x1337
[BLECentralManager] ✅ Found device: Wiz
```

If you see "No manufacturer data" → **iOS is stripping it**

### Step 3: Try Physical Devices
Simulators have limitations. Test on:
- Two physical iPhones
- Or one iPhone + one simulator
- Manufacturer data more reliable on physical devices

## Workaround: GATT Profile

**Good news:** Even without manufacturer data, the connection should work!

The manufacturer data is just for showing the name in the discovery list. The actual profile exchange happens via GATT:

1. **Discovery:** Find device by service UUID (works without manufacturer data)
2. **Connect:** Connect to GATT server (device ID based)
3. **Read Profile:** Get full profile from GATT characteristic:
   ```json
   {
     "userId": "G4VUvoBxz...",
     "displayName": "Wiz",
     "publicKey": "base64...",
     "profilePhoto": "base64..."
   }
   ```

So even if the list shows "Unknown", tapping to connect should still work!

## Test Connection WITHOUT Manufacturer Data

**Try this now:**
1. Tap on the "Unknown" device in the list
2. Watch for connection logs:
   ```
   🔗 [ConnectionService] Requesting connection...
   🔌 [BLEManager] Connecting to device...
   ✅ [BLEManager] Connected to device...
   📖 [BLEManager] Reading profile...
   ✅ [BLEManager] Profile parsed: {"displayName":"Wiz",...}
   ```
3. Connection should succeed and show correct name

## Fix Plan

### Short-term (Now)
1. Verify GATT profile exchange works
2. Test connection even with "Unknown" devices
3. Ensure profile data includes all needed info

### Medium-term (Next)
1. Add Xcode console monitoring to CI/CD
2. Test on physical devices
3. Add fallback UI for devices without names

### Long-term (Future)
1. Consider alternative discovery methods
2. QR code fallback
3. Web3 identity verification

## Expected Behavior

**With Manufacturer Data (Physical Devices):**
- Shows "Wiz" in discovery list
- Shows user hash for identification
- Quick visual confirmation

**Without Manufacturer Data (Simulators):**
- Shows "Unknown" in discovery list
- Still has service UUID + device ID
- Tap to connect → GATT reveals full profile
- Connection still works perfectly

## Next Actions

1. **Check Xcode Console** - See if native logs appear
2. **Try Connecting** - Tap "Unknown" device, watch logs
3. **Verify Profile Data** - Ensure `setProfileData()` was called
4. **Test on Physical Device** - Manufacturer data more reliable

