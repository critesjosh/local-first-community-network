# Connection Flow Testing Guide

## Automated Tests

### Unit Tests

**ConnectionService** (`__tests__/services/ConnectionService.test.ts`)
- ✅ requestConnection with auto-accept enabled
- ✅ requestConnection with auto-accept disabled (pending-sent)
- ✅ Connection failure handling
- ✅ Profile read failure handling
- ✅ Existing connection handling
- ✅ Upgrade pending-sent to mutual
- ✅ handleConnectionRequest with auto-accept
- ✅ handleConnectionRequest with manual approval
- ✅ handleConnectionResponse (accepted/rejected/pending)
- ✅ Manual connection acceptance
- ✅ Connection rejection
- ✅ Get connections and pending requests

**BLEConnectionHandler** (`__tests__/services/bluetooth/BLEConnectionHandler.test.ts`)
- ✅ Handle follow request events
- ✅ Send connection response via notification
- ✅ Handle connection response events
- ✅ Error handling for failed responses

### Running Tests

```bash
yarn test ConnectionService.test.ts
yarn test BLEConnectionHandler.test.ts
```

All unit tests pass successfully!

## Manual Testing on Physical Devices

### Prerequisites

- Two iOS devices with BLE capability
- Both devices have the app installed
- Bluetooth and location permissions granted
- Device A: "Wiz"
- Device B: "JG"

### Test 1: Auto-Accept Connection Flow

**Steps:**
1. Device A starts the app (auto-advertising begins)
2. Device B opens the app and navigates to ConnectionScan screen
3. Device B should discover Device A within 3 seconds
4. Device B taps on Device A to connect
5. Loading indicator appears
6. Within 8 seconds, connection completes

**Expected Results:**
- Device B shows "Connected" status
- Both devices have connection in "Connections" tab with `mutual` status
- Connection includes correct display name and profile photo
- Trust level is `verified`

**Logs to Monitor:**
```
[Device B] 🔗 [ConnectionService] Requesting connection to device...
[Device B] 🔗 [ConnectionService] Step 1: Connecting to GATT server...
[Device B] ✅ [ConnectionService] Connected to device
[Device B] 🔗 [ConnectionService] Step 2: Reading profile from device...
[Device B] ✅ [ConnectionService] Profile received
[Device B] 🔗 [ConnectionService] Step 3: Sending connection request...
[Device B] ✅ [ConnectionService] Connection request sent, waiting for response (8 seconds)...
[Device A] [BLEConnectionHandler] Received connection request
[Device A] [BLEConnectionHandler] Sending response via BLE notification: accepted
[Device B] 📥 [ConnectionService] Received response: accepted
[Device B] ✅ [ConnectionService] Connection auto-accepted by responder
[Device B] ✅ [ConnectionService] Connection saved with status: mutual
```

### Test 2: Manual Approval Connection Flow

**Setup:**
1. Device A disables auto-accept in Settings
2. Device B still has auto-accept enabled

**Steps:**
1. Device B discovers and connects to Device A
2. Device A receives notification of pending request
3. Device A opens ConnectionsScreen and sees request in "Pending Requests"
4. Device A taps "Accept"

**Expected Results:**
- Device A shows connection upgraded to `mutual`
- Device B's connection remains `pending-sent` initially
- After background sync, Device B's connection upgrades to `mutual`

### Test 3: Simultaneous Connection Requests

**Steps:**
1. Both devices have auto-accept enabled
2. Device A discovers Device B and initiates connection
3. At the same time, Device B discovers Device A and initiates connection
4. Both requests process simultaneously

**Expected Results:**
- No duplicate connections created
- Both devices end up with single `mutual` connection
- One request should recognize existing connection and return it

### Test 4: Connection While Out of Range

**Steps:**
1. Device B discovers Device A
2. Device B initiates connection
3. Before response received, Device A moves out of range (or Bluetooth disabled)

**Expected Results:**
- Device B waits 8 seconds for response
- Timeout occurs, connection marked as `pending-sent`
- Device B can retry later when Device A is back in range

### Test 5: Connection Rejection (Manual)

**Setup:**
1. Device A has manual approval enabled

**Steps:**
1. Device B connects to Device A
2. Device A receives request
3. Device A taps "Reject" in Connections screen

**Expected Results:**
- Device A deletes the connection
- Device B remains in `pending-sent` state
- No error thrown, graceful handling

### Test 6: Profile Data Verification

**Steps:**
1. Complete a successful connection
2. Verify profile data exchanged correctly

**Expected Results:**
- Display name matches exactly
- Public key is base64-encoded Ed25519 key
- Profile photo (if set) transfers correctly
- User ID is base58-encoded public key

### Test 7: Connection Persistence

**Steps:**
1. Complete a connection
2. Force-close app on both devices
3. Reopen apps

**Expected Results:**
- Connection persists in database
- Still shows in Connections tab
- Status remains `mutual`
- Can immediately exchange messages (when implemented)

## Performance Benchmarks

### Target Metrics

- **Discovery Time:** < 3 seconds
- **Connection Time:** < 3 seconds with auto-accept
- **Total Time (discovery + connection):** < 6 seconds
- **Response Latency:** < 500ms (notification delivery)
- **Database Write:** < 100ms

### Success Criteria

- [ ] Connection completes in < 3 seconds with auto-accept
- [ ] Both devices show mutual status immediately
- [ ] Manual approval queues as pending-received
- [ ] No orphaned connections in database
- [ ] Profile data exchanges correctly
- [ ] Works reliably at 1-3 meter range (RSSI > -70 dBm)
- [ ] Handles edge cases gracefully (timeout, rejection, etc.)

## Troubleshooting

### Device Not Discovered

1. Check Bluetooth is on
2. Check location permissions granted
3. Verify RSSI > -70 dBm (move closer)
4. Check advertising logs on Device A
5. Check scanning logs on Device B

### Connection Timeout

1. Check both devices still have Bluetooth on
2. Verify devices within range
3. Check GATT server logs on Device A
4. Check connection logs on Device B
5. Verify handshake characteristic has NOTIFY property

### No Response Received

1. Check Device A processed request (logs)
2. Verify sendConnectionResponse was called
3. Check Device B subscribed to notifications
4. Verify handshake characteristic notifications work
5. Check EventEmitter sending connectionResponseReceived

### Connection Shows Pending Instead of Mutual

1. Verify auto-accept setting on Device A
2. Check response was sent via notification
3. Verify Device B received connectionResponseReceived event
4. Check Device B's handleConnectionResponse was called
5. Verify notifyResponseReceived updated pending map

## Implementation Checklist

- [x] Connection request/response timing fixed
- [x] BLE notifications support added to handshake characteristic
- [x] BLEConnectionHandler updated to use notifications
- [x] Comprehensive unit tests for ConnectionService
- [x] Unit tests for BLEConnectionHandler
- [x] Connection flow documented
- [ ] Manual testing on two physical devices completed
- [ ] All success criteria met

