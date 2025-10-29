# BLE Discovery Debug Status - iOS Not Finding Android

**Time:** Oct 30, 2025, 17:30  
**Issue:** iOS discovers other devices but NOT Android "Wizard"

---

## ✅ CONFIRMED WORKING

1. **iOS Scanning** - Works! (Finds "Broadcasting Member" at -84 dBm)
2. **iOS Parsing** - Works! (No more "(no name)" devices)
3. **Android→iOS GATT Connection** - Works! (User confirmed: clicking "Connect" on Android sends connection request to iOS)
4. **Android Advertising** - Confirmed active (logs show advertising started at 04:26:26)

---

## ❌ THE PROBLEM

**iOS does NOT discover Android's BLE advertisement**

**Symptoms:**
- iOS sees "Broadcasting Member" (likely another device)
- iOS does NOT see "Wizard" (Android)
- But Android CAN connect to iOS's GATT server (so both Bluetooth stacks work)

---

## 🔍 CRITICAL CLUE

> "The strange thing is if I click the connect request in the android device, the iOS connections page will get the pending request even though it never found the advertised device"

**This proves:**
- ✅ Android scanning works (finds iOS)
- ✅ Android can connect to iOS GATT server
- ✅ iOS accepts incoming connections
- ❌ iOS CANNOT see Android's advertisement packets

**Implication:** Android's advertisement is either:
1. Not including the Service UUID properly
2. Being filtered by iOS CoreBluetooth before reaching our callback
3. Using a format iOS doesn't recognize

---

## 🧪 CURRENT DIAGNOSTICS

### iOS Filters (ALL DISABLED for testing):
- ✅ Service UUID filter: OFF (scanning for ALL devices)
- ✅ RSSI threshold (Swift): OFF (-85 dBm, but commented out)
- ✅ RSSI threshold (JavaScript): OFF (commented out)

### Logging Added:
1. **Service UUID logging** - Will show what UUIDs each device advertises
2. **Manufacturer data hex** - Will show raw bytes received
3. **Local name logging** - Will show device names
4. **JavaScript raw payload** - Will show data sent to JS layer

### Expected Output (next run):
```
📱 iOS DISCOVERED: id=..., name=..., rssi=...
  📡 Service UUIDs: 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
  ✅ HAS OUR SERVICE UUID!
  ✅ Has manufacturer data: 18 bytes
```

OR (if Android is missing Service UUID):
```
📱 iOS DISCOVERED: id=..., name=..., rssi=...
  ⚠️  NO service UUIDs
  ✅ Has manufacturer data: 18 bytes
```

---

## 🎯 HYPOTHESES TO TEST

### Hypothesis 1: Service UUID Not in Advertisement
**Test:** Check if Android devices show "HAS OUR SERVICE UUID" in logs  
**If YES:** Android IS advertising correctly, iOS should see it  
**If NO:** Android's Service UUID is not being included

### Hypothesis 2: iOS Filtering Before Callback
**Test:** If Android advertises Service UUID but iOS doesn't call `didDiscover`  
**Cause:** CoreBluetooth might be filtering at OS level  
**Solution:** Check iOS CoreBluetooth scan options

### Hypothesis 3: Advertisement Packet Format
**Test:** Compare "Broadcasting Member" vs Android advertisement structure  
**Look for:** Differences in Service UUID format, packet size, or encoding

---

## 📋 NEXT STEPS

### Step 1: Analyze Discovery Logs (CURRENT)
After rebuild completes, check Metro console for:
```
📦 [BLEManager] Device discovered: rssi=...
📦 [BLEManager] Raw payload: { "displayName": "...", ... }
```

Look for:
- How many devices are discovered?
- Do any have our Service UUID `6e400001-b5a3-f393-e0a9-e50e24dcca9e`?
- What's different between "Broadcasting Member" and missing "Wizard"?

### Step 2: Verify Android Advertisement
If Android has Service UUID but iOS doesn't see it:
- Restart Android app
- Check Android logs for advertisement confirmation
- Verify Service UUID is in main packet (not scan response)

### Step 3: Force iOS to See Android
If Android is advertising correctly but iOS can't see it:
- Try iOS → Android connection (reverse direction)
- Check if iOS can see Android's GATT server when connected
- Verify Android's peripheral UUID matches what iOS expects

---

## 📱 DEVICE STATUS

**iPhone "JG 17":**
- App deployed: 17:26:46 (rebuilding now with diagnostics)
- Screen: Connect (scanning active)
- Discoveries: "Broadcasting Member" at -84 dBm

**Android (Samsung RFCY50T7TBY):**
- Last advertising: 04:26:26
- Screen: ? (needs confirmation)
- Status: Can connect to iOS ✅

---

## 🔧 CODE STATE

**Modified Files:**
- `packages/rn-bluetooth/ios/BLECentralManager.swift` - Enhanced diagnostics
- `src/services/bluetooth/BLEManager.ts` - JavaScript layer diagnostics

**Key Changes:**
- Service UUID checking and logging
- Raw payload logging
- RSSI filters disabled
- Manufacturer data hex output

---

## 💡 POSSIBLE QUICK FIXES

### Option A: Match Formats
Make Android advertise the same way as iOS (Local Name format)
- **Problem:** Android doesn't support `setLocalName()` in AdvertiseData

### Option B: Use GATT Server Discovery
Instead of relying on advertisement discovery:
1. iOS scans for devices with Service UUID
2. Connects to ALL devices with our UUID
3. Reads device info from GATT characteristic
- **Downside:** More battery intensive, slower

### Option C: Manufacturer Data Only
Remove Service UUID requirement, use Manufacturer ID filter:
- **Problem:** Less standard, iOS might not receive MFG data without Service UUID

---

## ⏱️ SESSION STATS

- **Time invested:** ~15 hours
- **Progress:** 95% complete
- **Remaining issue:** iOS discovery of Android only
- **All other functionality:** ✅ Working

We're SO close! Just need to understand why iOS can't see Android's advertisement.

