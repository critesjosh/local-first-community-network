# Quick Physical Device Test Guide

## Your Devices
✅ **iPhone JG (2)** - iOS 18.6.2 - Connected  
✅ **iPhone JG 17** - iOS 26.0 - Connected

## Deploy Commands

```bash
# Device 1 - Deploy as "Wiz"
yarn ios --device="iPhone JG (2)"

# Device 2 - Deploy as "JG"  
yarn ios --device="iPhone JG 17"
```

## Test Procedure

### 1. Launch on Both Devices

**iPhone JG (2) - "Wiz":**
- Complete onboarding as "Wiz"
- Stay on Home screen
- App advertises automatically

**iPhone JG 17 - "JG":**
- Complete onboarding as "JG"  
- Go to Connections tab
- Tap "Discover Nearby Profiles"

### 2. Expected Results

**On JG's screen (scanner):**
```
Found 1 device
┌─────────────────┐
│ Wiz             │  ← Name should appear!
│ cbe349945cd5... │  ← Hash should appear!
│ Good signal     │
│ -45 dBm         │
└─────────────────┘
```

**In terminal logs:**
```
📱 [BluetoothModule] deviceDiscovered event received:
  - deviceId: ABC-123
  - rssi: -45
  - payload: {"displayName":"Wiz","userHashHex":"cbe349945cd5",...}
          ✅ displayName has value!  ✅ userHashHex has value!
```

### 3. Test Connection

1. **Tap on "Wiz"** in the devices list
2. Watch for logs:
   ```
   🔗 [ConnectionService] Requesting connection...
   🔌 [BLEManager] Connecting to device...
   ✅ [BLEManager] Connected!
   📖 [BLEManager] Reading profile...
   ✅ Profile received: {"displayName":"Wiz","userId":"G4VU...","publicKey":"..."...}
   ```
3. Should show success alert
4. Connection appears in Connections tab **on both devices**

### 4. Verify Profile Data

Connection should include:
- ✅ userId
- ✅ displayName
- ✅ publicKey (for encryption)
- ✅ profilePhoto (if set)

## What's Different on Physical Devices?

### Simulator Problems (Fixed on Real Devices):
❌ Manufacturer data stripped → ✅ **Now transmitted!**  
❌ Shows "Unknown" → ✅ **Now shows real names!**  
❌ Empty hash → ✅ **Now shows user hash!**  
❌ Unreliable GATT → ✅ **Now reliable!**

### Success Indicators:
✅ Names appear correctly in discovery  
✅ User hashes visible for identification  
✅ Strong signal strength (-30 to -60 dBm typical)  
✅ Fast discovery (< 3 seconds)  
✅ Reliable connections  
✅ Profile exchange works every time

## Monitoring Logs

**Terminal (React Native logs):**
```bash
npx react-native log-ios
```

**Xcode Console (Native logs):**
1. Xcode → Window → Devices and Simulators
2. Select "iPhone JG (2)" or "iPhone JG 17"
3. Click "Open Console"
4. Filter: "BLE" or "Peripheral" or "Central"

## Troubleshooting

### If app doesn't install:
```bash
cd ios && rm -rf build DerivedData
yarn ios --device="iPhone JG (2)"
```

### If signing fails:
1. Open `ios/localsocialnetworkexpo.xcworkspace` in Xcode
2. Select project → Signing & Capabilities
3. Check "Automatically manage signing"
4. Select your team

### If "Trust Developer" needed:
1. On iPhone: Settings → General → VPN & Device Management
2. Find your certificate
3. Tap "Trust"

### If devices don't discover:
1. Both apps must be in **foreground**
2. Bluetooth must be **enabled** on both
3. Devices within **10 feet** of each other
4. Check logs for "✅ Did start advertising"

## Expected Timeline

- Deploy to Device 1: ~2 minutes
- Deploy to Device 2: ~2 minutes  
- Onboarding on both: ~1 minute
- Discovery: **< 5 seconds** ⚡
- Connection: **< 3 seconds** ⚡
- **Total: ~8 minutes to full working demo!**

## Success! 🎉

When you see:
```
✅ Device shows "Wiz" (not "Unknown")
✅ Hash shows "cbe349945cd5..."
✅ Tap to connect works
✅ Full profile exchanged
✅ Connection appears on both devices
```

**You have a working BLE discovery and connection system!**

## Next Steps After Success

1. **Test proximity**: Walk away → signal weakens → device disappears
2. **Test reconnection**: Kill app → relaunch → connections persist
3. **Test multiple devices**: Add more friends to test scaling
4. **Test background**: Lock phone → see if advertising continues
5. **Test profile pictures**: Add photos → verify they transfer

