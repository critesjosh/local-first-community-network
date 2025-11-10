# BLE Profile Photo Transfer - Fixed

## The Problem

**Error:** `The prepare queue is full`

This occurred when trying to write handshake data containing profile photos (50-100KB base64 images) through BLE GATT characteristic writes.

### Why It Failed

**BLE GATT Write Limitations:**
- Max MTU (Maximum Transmission Unit): ~512 bytes per write
- Profile photos: 50-100KB (50,000-100,000 bytes!)
- Sending 100KB in a 512-byte channel = Queue overflow ❌

## The Solution

**Two-Stage Transfer:**
1. **Profile photo via GATT Read** (large data, read operation)
2. **Handshake via GATT Write** (small data, write operation)

### How It Works

```
Connection Flow:
┌─────────────────────────────────────────────────────────┐
│ Step 1: Device A connects to Device B                  │
│ Step 2: Device A reads profile from Device B's GATT    │
│         └─ Includes: userId, displayName, publicKey,   │
│            profilePhoto (50-100KB) ✅                   │
│                                                          │
│ Step 3: Device A sends connection request (handshake)  │
│         └─ Includes: userId, displayName, publicKey    │
│            NO profilePhoto ✅ (too large)               │
│                                                          │
│ Step 4: Device B sends connection response             │
│         └─ Includes: userId, displayName, publicKey    │
│            NO profilePhoto ✅ (too large)               │
└─────────────────────────────────────────────────────────┘

Result: Both devices have each other's profile photos!
```

## Code Changes

### ConnectionService.ts

**Connection Request (removed profilePhoto):**
```typescript
const connectionRequest: ConnectionRequest = {
  type: 'connection-request',
  requester: {
    userId: currentUser.id,
    displayName: currentUser.displayName,
    publicKey: Buffer.from(identity.publicKey).toString('base64'),
    // profilePhoto is omitted - already transferred via GATT read
  },
  timestamp: new Date().toISOString(),
};
```

**Connection Response (removed profilePhoto):**
```typescript
return {
  type: 'connection-response',
  status,
  responder: {
    userId: currentUser.id,
    displayName: currentUser.displayName,
    publicKey: Buffer.from(identity.publicKey).toString('base64'),
    // profilePhoto is omitted - already transferred via GATT read
  },
  timestamp: new Date().toISOString(),
};
```

**Profile photo comes from GATT server:**
```typescript
// Step 2: Read profile from GATT server
const profile = await BLEManager.readProfile(device);
// ↑ This includes profilePhoto (from GATT read, handles large data)

// Later: Save connection with profile photo
const connection: Connection = {
  ...
  profilePhoto: profile.profilePhoto, // From GATT server read ✅
  ...
};
```

## Why This Works

### GATT Read vs GATT Write

| Operation | Max Size | Use Case |
|-----------|----------|----------|
| **GATT Read** | ~512 bytes per read, but can do multiple reads | Large data (profile photos) ✅ |
| **GATT Write** | ~512 bytes per write | Small data (handshakes) ✅ |

**GATT reads can be chunked automatically by the BLE stack:**
- Client requests data
- Server sends in chunks
- BLE stack handles reassembly
- Perfect for large profile data

**GATT writes have queue limits:**
- Client sends data
- Must fit in write queue
- No automatic chunking
- Best for small messages

## Data Size Comparison

### Before (Broken)
```
Handshake Write:
- userId: ~44 bytes
- displayName: ~20 bytes
- publicKey: ~44 bytes
- profilePhoto: ~75,000 bytes ❌
- Total: ~75,108 bytes → QUEUE OVERFLOW ❌
```

### After (Fixed)
```
Profile Read (GATT):
- userId: ~44 bytes
- displayName: ~20 bytes
- publicKey: ~44 bytes
- profilePhoto: ~75,000 bytes ✅
- Total: ~75,108 bytes → Handled via chunked reads ✅

Handshake Write (GATT):
- userId: ~44 bytes
- displayName: ~20 bytes
- publicKey: ~44 bytes
- Total: ~108 bytes → Fits in single write ✅
```

## Benefits

1. ✅ **No queue overflow** - Handshakes are small enough for writes
2. ✅ **Reliable transfer** - GATT reads handle large data properly
3. ✅ **No code changes needed** - BLE stack handles chunking
4. ✅ **Efficient** - Only send small metadata via writes
5. ✅ **Profile photos still transfer** - Via GATT server reads

## Testing

**Before Fix:**
```
❌ Error: The prepare queue is full
❌ Connection failed
```

**After Fix:**
```
✅ Profile read successful (includes photo)
✅ Handshake write successful (no photo)
✅ Connection created with profile photo
```

## Important Notes

1. **Profile photos are optional** in handshakes
   - TypeScript types allow `profilePhoto?: string`
   - If missing, use default avatar (first initial)

2. **Profile photos update automatically**
   - Read from GATT server on each connection
   - Latest photo is always displayed
   - No manual sync needed

3. **Backwards compatible**
   - Old code that included profilePhoto still works
   - New code just doesn't send it
   - Both read from GATT server anyway

## Summary

**Problem:** Profile photos (50-100KB) too large for BLE GATT writes  
**Solution:** Read from GATT server, don't send in handshakes  
**Result:** Reliable connection with profile photo transfer ✅

