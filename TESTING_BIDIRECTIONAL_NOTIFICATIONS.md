# Testing BLE Bidirectional Notifications

## 🚀 Quick Start

### Step 1: Rebuild and Deploy

**iOS:**
```bash
cd ios
pod install
# Then build in Xcode or:
yarn ios
```

**Android:**
```bash
# Clean build to ensure changes are picked up
cd android
./gradlew clean
cd ..
yarn android
```

## 📱 Test Scenarios

### Test 1: Android Central → iOS Peripheral (CRITICAL FIX #1 & #2)

This tests:
- ✅ Android writing CCCD descriptor
- ✅ iOS retrying failed notifications

**Setup:**
1. **iPhone:** Open app, start advertising
2. **Android:** Open app, start scanning

**Actions:**
1. Android discovers iPhone
2. Android connects to iPhone
3. Android sends connection request
4. iPhone sends response back

**Expected Logs:**

**Android (logcat - filter "BLECentral"):**
```
🔔 Enabling notifications for handshake characteristic
📝 Writing CCCD descriptor to enable notifications
✅ CCCD write completed: success=true, status=0
📝 Writing characteristic data (XXX bytes)
✅ Write successful
📥 Notification received!
✅ Connection response: {...}
```

**iOS (Xcode console - filter "BLEPeripheral"):**
```
✅ Central subscribed to: [UUID]
    Central ID: [UUID]
    Max update value length: 185
✍️ Received write request
📤 Sending connection response via notification (XXX bytes)
✅ Response notification sent successfully
```

OR if queue is full (tests retry mechanism):
```
⚠️ Central TX queue full, queuing notification for retry
📝 Queued notifications: 1
📡 Central ready to receive - sending 1 queued notification(s)
✅ Queued notification sent (XXX bytes)
```

### Test 2: iOS Central → Android Peripheral (CRITICAL FIX #3)

This tests:
- ✅ Android NOTIFY property
- ✅ Android CCCD descriptor handling

**Setup:**
1. **Android:** Open app, start advertising
2. **iPhone:** Open app, start scanning

**Actions:**
1. iPhone discovers Android
2. iPhone connects to Android
3. iPhone subscribes to notifications
4. iPhone sends connection request
5. Android sends response back

**Expected Logs:**

**Android (logcat - filter "BLEPeripheral"):**
```
✅ Advertising started successfully!
📝 Descriptor write request from [address]
📡 CCCD write: notifications=true, indications=false
✅ Central [address] subscribed to notifications
✅ Sent CCCD write response
[After write received]
📤 Sending connection response via notification
✅ Response notification sent successfully
```

**iOS (Xcode console - filter "BLECentral"):**
```
🔍 Discovered device
🔌 Successfully connected
[NATIVE] Found our service, discovering characteristics...
[NATIVE] ✅ Handshake characteristic found, writing XXX bytes...
✅ Write successful!
📥 Received XXX bytes from characteristic
✅ Connection response received
```

### Test 3: Full Bidirectional (Both Roles Simultaneously)

This is the ultimate test - each device acts as both peripheral and central.

**Setup:**
1. **Both devices:** Start advertising AND scanning
2. **Both devices:** Should discover each other

**Actions:**
1. Both connect to each other (one as central, one as peripheral)
2. Exchange messages in BOTH directions
3. Verify all notifications arrive

**Expected Result:**
- Both devices receive responses
- All CCCD writes succeed
- All notifications arrive
- No dropped messages

## 🔍 How to Check Logs

### Android (logcat)

**Method 1: Android Studio**
1. Open Android Studio
2. Run app on device
3. Open "Logcat" tab at bottom
4. Filter by "BLE" or "BLECentral" or "BLEPeripheral"

**Method 2: Command Line**
```bash
# Watch all BLE logs in real-time
adb logcat | grep BLE

# Or more specific:
adb logcat | grep "BLECentralManager\|BLEPeripheralManager"
```

### iOS (Xcode Console)

**Method 1: Xcode**
1. Open Xcode
2. Run app on device (Cmd+R)
3. Open Debug area (Cmd+Shift+Y)
4. Search/filter for "BLE"

**Method 2: Console.app**
1. Open Console.app on Mac
2. Select your iPhone from sidebar
3. Search for "BLEPeripheralManager" or "BLECentralManager"

## 🎯 Success Indicators

### ✅ PASS Criteria

**For Android Central → iOS Peripheral:**
1. See "CCCD write completed: success=true"
2. See "Notification received!"
3. See "Connection response" in Android logs
4. iOS shows "Response notification sent successfully"

**For iOS Central → Android Peripheral:**
1. See "Central [address] subscribed to notifications" in Android
2. See "Response notification sent successfully" in Android
3. See "Received XXX bytes from characteristic" in iOS
4. See "Connection response received" in iOS

### ❌ FAIL Indicators

**Android Central:**
- "CCCD write completed: success=false" → CCCD write failed
- No "Notification received!" after write → Notification not working
- "CCCD descriptor not found" → Peripheral doesn't have CCCD

**iOS Peripheral:**
- "Central TX queue full" but no "Queued notification sent" → Retry not working
- "Cannot send - Bluetooth not powered on" → State issue

**Android Peripheral:**
- "Failed to send notification" → Central not subscribed or CCCD issue
- No "CCCD write request" logs → Central not subscribing

## 🐛 Troubleshooting

### Problem: "CCCD descriptor not found"
**Solution:** Peripheral needs to rebuild. The NOTIFY property and CCCD descriptor were just added.

### Problem: No notifications received
**Check:**
1. Did CCCD write succeed? (Look for "CCCD write completed: success=true")
2. Is central actually subscribed? (Look for "subscribed to notifications")
3. Did peripheral try to send? (Look for "Sending connection response")

### Problem: Notifications queued but never sent
**Check:**
1. iOS only: Look for "Central ready to receive" callback
2. If not appearing, central may have disconnected
3. Try disconnecting and reconnecting

### Problem: "Write failed" errors
**Check:**
1. Are devices connected? (Look for "Successfully connected")
2. Were services discovered? (Look for "Found our service")
3. Check characteristic UUID matches on both sides

## 📊 Performance Metrics to Watch

**Good Performance:**
- CCCD write latency: < 50ms
- Notification latency: < 20ms
- Write latency: < 30ms
- No dropped notifications

**Warning Signs:**
- CCCD write latency: > 100ms (poor connection)
- Multiple queue/retry cycles (central buffer full)
- "Still not ready" appearing repeatedly

## 🔄 Testing Workflow

### Recommended Order:

1. **Test each direction separately first:**
   - Android → iOS
   - iOS → Android

2. **Then test simultaneously:**
   - Both directions at once
   - Multiple connection/disconnection cycles
   - Move devices apart/together (signal strength test)

3. **Stress test:**
   - Rapid connection/disconnection
   - Multiple messages in quick succession
   - Background/foreground transitions

## 📝 Log Collection

If you encounter issues, collect logs:

**Android:**
```bash
adb logcat -d > android_ble_logs.txt
```

**iOS:**
```bash
# In Xcode, right-click console and "Save Console Output"
```

Then search for the key patterns listed above to diagnose.

## ✨ What Changed

The three critical fixes were:

1. **Android Central now writes CCCD** - tells peripheral to send notifications
2. **iOS Peripheral now retries** - queues notifications when central is busy
3. **Android Peripheral now has NOTIFY** - can actually send notifications

These were the exact issues preventing bidirectional communication before!

