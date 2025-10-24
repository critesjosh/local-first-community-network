# Testing on Physical Devices

## Why Physical Devices Are Required

iOS simulators have **critical BLE limitations:**

❌ **Manufacturer data often stripped or corrupted**  
❌ **Background advertising doesn't work reliably**  
❌ **GATT operations can be unreliable**  
❌ **Can't test real-world proximity/RSSI**  

✅ **Physical devices give reliable BLE behavior**

## Prerequisites

### 1. Apple Developer Account
- Free account works for testing
- Paid account required for App Store distribution

### 2. Two iPhones
- iOS 16+ recommended
- Must have Bluetooth 4.0+ (any iPhone 4S or newer)
- Connected to Mac via cable or Wi-Fi

### 3. Xcode Configuration
- Devices must be registered in Xcode
- Development certificates set up
- Provisioning profiles created

## Setup Steps

### Step 1: Connect Your iPhones

**Via USB Cable (Recommended):**
1. Connect iPhone to Mac with Lightning/USB-C cable
2. Trust the computer on iPhone (popup will appear)
3. In Xcode: Window → Devices and Simulators
4. Your iPhone should appear in the list

**Via Wi-Fi:**
1. Connect both Mac and iPhone to same Wi-Fi
2. In Xcode: Window → Devices and Simulators
3. Check "Connect via network" for your device
4. iPhone will appear with a network icon

### Step 2: Configure Signing

**Option A: Automatic Signing (Easiest)**

1. Open `ios/localsocialnetworkexpo.xcworkspace` in Xcode
2. Select the project in the navigator (blue icon)
3. Select the target "localsocialnetworkexpo"
4. Go to "Signing & Capabilities" tab
5. Check "Automatically manage signing"
6. Select your team from the dropdown
7. Xcode will handle certificates automatically

**Option B: Manual Signing**

1. In Xcode, go to Signing & Capabilities
2. Uncheck "Automatically manage signing"
3. Select your provisioning profile
4. Select your signing certificate

### Step 3: Update Bundle Identifier (if needed)

If you get a signing error about bundle identifier:

1. In Xcode, change the Bundle Identifier:
   - Format: `com.yourname.localsocialnetwork`
   - Must be unique (not used by another app)
2. Update in `app.json` to match:
   ```json
   {
     "ios": {
       "bundleIdentifier": "com.yourname.localsocialnetwork"
     }
   }
   ```

### Step 4: Build and Install

**Method 1: Yarn Command (Recommended)**

```bash
# Build and install on connected device
yarn ios --device="Your iPhone Name"

# Or let it auto-detect first connected device
yarn ios --device
```

**Method 2: Xcode Direct**

1. Open `ios/localsocialnetworkexpo.xcworkspace` in Xcode
2. At the top, select your physical device from the dropdown (not simulator)
3. Click the "Play" button (▶️) or press Cmd+R
4. App will build and install on your iPhone

**Method 3: EAS Build (For Distribution)**

```bash
# Build for internal distribution
eas build --platform ios --profile development

# Install the .ipa file via Xcode or TestFlight
```

### Step 5: Trust Developer Certificate

First time installing on a device:

1. On iPhone: Settings → General → VPN & Device Management
2. Find your developer certificate
3. Tap "Trust [Your Name]"
4. Confirm trust

## Testing Procedure

### Setup Two Devices

**Device 1 ("Wiz"):**
1. Install and launch app
2. Complete onboarding as "Wiz"
3. Stay on Home screen
4. App advertises automatically

**Device 2 ("JG"):**
1. Install and launch app  
2. Complete onboarding as "JG"
3. Go to Connections tab
4. Tap "Discover Nearby Profiles"

### Watch the Logs

**On Mac Terminal:**
```bash
# Watch logs from connected device
npx react-native log-ios

# Or filter for BLE logs
npx react-native log-ios | grep -E "BLE|Advert|Scan|Connection"
```

**In Xcode Console:**
1. Window → Devices and Simulators
2. Select device
3. Click "Open Console" at bottom
4. Filter: "BLE" to see native logs

### What to Look For

✅ **Discovery:** Device should appear within 3 seconds  
✅ **Name Shows:** Should see "Wiz" not "Unknown"  
✅ **Hash Shows:** Should see user hash like "cbe349945cd5"  
✅ **Connection Works:** Tap device → Profile exchange → Connection created  
✅ **Both Devices See Connection:** Check Connections tab on both

## Expected Logs on Physical Devices

**When Advertising:**
```
[BLEPeripheralManager] 📦 Building advertisement data...
[BLEPeripheralManager] 🏗️ Building manufacturer data:
  - displayName: Wiz
  - userHashHex: cbe349945cd5
  - followTokenHex: a1b2c3d4
  - Total manufacturer data size: 16 bytes
  - Raw hex: 37130103576972cbe349945cd5a1b2c3d4
[BLEPeripheralManager] ✅ Did start advertising successfully
[BLEPeripheralManager] Broadcasting as: Wiz
```

**When Discovering:**
```
[BLECentralManager] 📱 Discovered peripheral: ABC-123 RSSI: -45 dBm
[BLECentralManager] Found manufacturer data: 16 bytes
[BLECentralManager] Manufacturer ID: 0x1337
[BLECentralManager] ✅ Found device: Wiz
📱 [BluetoothModule] deviceDiscovered event received:
  - deviceId: ABC-123
  - payload: {"displayName":"Wiz","userHashHex":"cbe349945cd5",...}
```

## Troubleshooting

### "Failed to install the app"

**Cause:** Provisioning or signing issue

**Fix:**
1. Check signing configuration in Xcode
2. Ensure device is registered
3. Try cleaning: `cd ios && rm -rf build && cd ..`
4. Rebuild

### "App crashes on launch"

**Cause:** Missing permissions or entitlements

**Fix:**
1. Check `Info.plist` has Bluetooth usage descriptions
2. Verify entitlements file exists
3. Check console for specific error

### "Bluetooth permission denied"

**Cause:** User denied permission or Info.plist missing

**Fix:**
1. On iPhone: Settings → [App Name] → Allow Bluetooth
2. Or: Settings → Privacy → Bluetooth → Enable for app
3. May need to reinstall app after permission fix

### "No devices discovered"

**Cause:** Both devices not advertising or scanning

**Fix:**
1. Verify both apps are running in foreground
2. Check logs for "✅ Did start advertising"
3. Check logs for "🔍 Scan started"
4. Move devices closer (within 10 feet)
5. Restart Bluetooth on both devices

### "Unknown" devices still showing

**Cause:** Native code not rebuilt or manufacturer data issue

**Fix:**
1. Clean build: `cd ios && rm -rf build DerivedData`
2. Rebuild: `yarn ios --device`
3. Check Xcode console for manufacturer data logs

### "Connection fails"

**Cause:** GATT server not responding or profile not set

**Fix:**
1. Check logs for "Profile data set"
2. Verify `setProfileData()` called before advertising
3. Check Xcode logs for "Responded to profile read request"

## Testing Checklist

- [ ] Both devices connected to Mac (via cable or Wi-Fi)
- [ ] Apps built and installed successfully
- [ ] Developer certificates trusted on both devices
- [ ] Bluetooth enabled on both devices
- [ ] Location permission granted (iOS requirement)
- [ ] Apps running in foreground
- [ ] One device advertising (automatic)
- [ ] Other device scanning (manual tap)
- [ ] Devices appear with names (not "Unknown")
- [ ] User hash visible in discovery
- [ ] Connection succeeds when tapped
- [ ] Profile data exchanged correctly
- [ ] Connection appears in both apps

## Performance Notes

### Battery Impact
- BLE advertising is low power (~1-2% per hour)
- Scanning is more power intensive (~5-10% per hour)
- Stop scanning when not actively looking for devices

### Range
- Typical range: 30-100 feet
- Walls/obstacles reduce range significantly
- RSSI threshold: -70 dBm (configurable)

### Discovery Time
- First discovery: 1-5 seconds
- Subsequent: < 1 second
- Depends on advertising interval (100ms default)

## Next Steps

1. **Build for first device:**
   ```bash
   yarn ios --device="iPhone 1"
   ```

2. **Build for second device:**
   ```bash
   yarn ios --device="iPhone 2"
   ```

3. **Test discovery:**
   - Device 1: Stay on home screen
   - Device 2: Go to Connections → Scan

4. **Monitor logs:**
   - Terminal: `npx react-native log-ios`
   - Xcode: Console for native logs

5. **Test connection:**
   - Tap discovered device
   - Verify profile exchange
   - Check connection appears on both

6. **Iterate:**
   - Fix any issues
   - Test again
   - Document findings

## Success Criteria

✅ Device names appear correctly (not "Unknown")  
✅ User hashes visible and correct  
✅ RSSI shows reasonable values (-30 to -70 dBm)  
✅ Connection succeeds within 5 seconds  
✅ Full profile data exchanged  
✅ Connections persist across app restarts  
✅ No crashes or errors in logs

