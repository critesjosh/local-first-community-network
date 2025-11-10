# iOS ↔ Android BLE Discovery Troubleshooting

## Current Status

### Working ✅
- **Android → iOS Discovery**: Android (Samsung Galaxy "Wizard") successfully discovers iOS device ("Wiz")
- **Android → iOS Connection**: Android can initiate connection to iOS and iOS receives it
- **Android Advertising**: Correctly advertising Service UUID `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
- **iOS GATT Server**: Receiving connections when Android initiates

### Not Working ❌
- **iOS → Android Discovery**: iOS cannot discover Android device in scan results
- iOS shows NO devices at all on Connect screen

## What Android is Advertising

```
Main Advertisement Packet:
✅ Service UUID: 6e400001-b5a3-f393-e0a9-e50e24dcca9e
✅ No device name (keeps packet small)
✅ No TX power level

Scan Response Packet:
✅ Manufacturer Data: 18 bytes
   - Company ID: 0x1337 (prepended by Android in little-endian: 0x37 0x13)
   - Payload: version + nameLength + "Wizard" + userHash + followToken

Settings:
✅ Mode: LOW_LATENCY (frequent broadcasts for better discovery)
✅ TX Power: HIGH (stronger signal, better range)
✅ Connectable: true
```

## What iOS Should Be Doing

```swift
// Scanning configuration
centralManager.scanForPeripherals(
  withServices: [SERVICE_UUID],  // 6e400001-b5a3-f393-e0a9-e50e24dcca9e
  options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
)
```

**This matches Android's advertised Service UUID exactly** ✅

## Diagnostic Messages

With the latest build, you'll see these messages in your iPhone app console:

### When Scanning Starts
```
🔍 iOS startScanning called - Bluetooth state: 5
✅ Starting scan for service: 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
👂 Listening for peripherals with service UUID...
```

### When Devices Are Discovered
```
📱 iOS DISCOVERED: id=XXXXXXXX, name=Wizard, rssi=-65
```

## Possible Causes & Solutions

### 1. iOS CoreBluetooth Not Powered On
**Symptoms**: No "starting scan" message appears
**Solution**: 
- Settings → Bluetooth → Turn OFF
- Wait 3 seconds
- Turn ON
- Reopen app

### 2. App Not in Foreground
**Symptoms**: Scanning appears to start but no discoveries
**Solution**:
- iOS heavily throttles background BLE scanning
- Keep app OPEN and ACTIVE on Connect screen
- Don't lock screen

### 3. CoreBluetooth State Not Ready
**Symptoms**: Error message about Bluetooth state
**Solution**:
- Wait for Bluetooth to fully initialize (state = 5)
- Close and reopen app
- Restart iPhone if persists

### 4. Permission Issues
**Symptoms**: "unauthorized" state
**Solution**:
- Settings → Privacy & Security → Bluetooth
- Ensure app has Bluetooth permission
- May need to delete and reinstall app

### 5. iOS Caching Issues
**Symptoms**: Worked before, stopped working
**Solution**:
```bash
# Reset iOS Bluetooth cache (on Mac)
cd /Users/johngulbronson/Developer/local-first-community-network
# Force close app on iPhone
# Rebuild and reinstall
yarn ios --device "iPhone JG 17"
```

### 6. Service UUID Mismatch (Unlikely)
**Status**: Both platforms use identical UUID ✅
```
Android: 6e400001-b5a3-f393-e0a9-e50e24dcca9e
iOS:     6E400001-B5A3-F393-E0A9-E50E24DCCA9E
```

## Testing Steps

1. **On iPhone "JG 17":**
   - Open app (wait for it to fully load)
   - Go to Connect screen
   - Look for diagnostic messages in the React Native console
   - Wait 10 seconds for scan to discover devices

2. **Expected Result:**
   - Should see "🔍 iOS startScanning called" message
   - Should see "📱 iOS DISCOVERED" messages
   - "Wizard" (Android) should appear in device list

3. **If No Discovery:**
   - Check diagnostic messages for Bluetooth state
   - Verify state = 5 (powered on)
   - Try Bluetooth OFF/ON cycle
   - Try force-closing and reopening app

## Known iOS BLE Limitations

1. **Simulator**: BLE does NOT work in iOS Simulator (physical device only)
2. **Background**: Scanning is severely throttled when app is backgrounded
3. **Service-Based Scanning**: iOS requires Service UUID in main advertisement packet
4. **State Management**: CoreBluetooth can get "stuck" and need reset
5. **Privacy**: iOS rotates MAC addresses, uses random UUIDs

## Quick Verification Script

```bash
# Check Android is advertising
adb -s RFCY50T7TBY logcat -d | grep "Advertising started successfully" | tail -1

# Check Android is discovering iOS
adb -s RFCY50T7TBY logcat -d | grep "Found: Wiz" | tail -3

# Monitor iOS device logs (if available)
idevicesyslog -u 00008150-000C05890E88401C | grep -E "BLECentralManager|Discovered"
```

## Next Steps

1. **Wait for new iOS build to complete** (~60 seconds)
2. **App will auto-launch on iPhone**
3. **Go to Connect screen**
4. **Look for diagnostic messages** (will appear in React Native console/logs)
5. **Report what you see** - particularly the Bluetooth state number

## Expected Outcome

Once iOS scanning is confirmed to be running with state=5, you should see:
- Android device "Wizard" appearing in iOS scan results
- Both-way discovery working (iOS ↔ Android)
- Ability to connect from either device
- Full handshake and connection establishment

## Technical Details

### Why Android → iOS Works But Not iOS → Android

This asymmetry usually indicates:
1. iOS scanning not actually running (most likely)
2. iOS in wrong CoreBluetooth state
3. iOS app permissions issue

It's NOT:
- Android advertising incorrectly (we see it's working)
- Service UUID mismatch (they're identical)
- Manufacturer data format (iOS doesn't need this for discovery)

The Service UUID in the main advertisement is sufficient for iOS discovery, and Android is advertising it correctly.

