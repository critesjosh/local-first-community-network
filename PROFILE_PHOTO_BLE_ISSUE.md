# Profile Photo BLE Transfer Issue

## Problem

Profile photos are base64-encoded images that can be **tens of kilobytes** in size. BLE GATT characteristics have a **512-byte transmission limit**, which causes profile data to be truncated when photos are included.

### Symptoms
```
ERROR ❌ [BluetoothModule] Native readProfile failed: [SyntaxError: JSON Parse error: Unexpected end of input]
LOG ✅ [BluetoothModule] Native readProfile returned (length: 512 chars)
```

The JSON is cut off mid-string, making it unparseable.

## Solution

**Profile photos MUST NOT be included in BLE GATT characteristics.**

### Current Implementation

The fix has been applied in `src/screens/HomeScreen.tsx` (lines 119-126):

```typescript
// Create minimal connection profile - only essential data for BLE transfer
// Profile photos are too large for GATT reads/writes (512 byte limit)
const fullProfile: ConnectionProfile = {
  userId: user.id,
  displayName: user.displayName,
  publicKey: Buffer.from(identity.publicKey).toString('base64'),
  // Explicitly exclude profilePhoto - it causes 512-byte GATT read limit to be exceeded
};
```

### Required Actions

**ALL devices connecting to each other MUST**:
1. Restart the app after updating to ensure the new code is active
2. Verify that `HomeScreen.tsx` excludes `profilePhoto` from the `fullProfile`
3. If connecting to legacy devices still sending photos, connection will fail with clear error messages

### Error Handling Added

Three layers of protection:

1. **BluetoothModule.js** - Better error messages when truncated JSON is detected
2. **ConnectionService.ts** - Strips profile photos if somehow received  
3. **ConnectionService.ts** - Fallback to broadcast data (limited functionality without public key)

### Alternative Solutions (Future)

If profile photo transfer is required via BLE:

1. **Chunked Transfer**: Implement offset-based reading to transfer large characteristics in multiple reads
2. **Separate Characteristic**: Use a dedicated characteristic for photos with chunked transfer
3. **Server Sync**: Upload photos to a server and transfer only URLs via BLE
4. **Compression**: Reduce photo size before transfer (still may exceed 512 bytes)

For now, **exclude profile photos from BLE** and sync them separately (e.g., when both devices have internet).

## Testing

To verify the fix:
1. Both devices should advertise successfully
2. Connection should complete without JSON parse errors  
3. Profiles should have `displayName`, `userId`, and `publicKey` but no `profilePhoto`
4. Profile photos can be added later via other sync mechanisms

## Migration

Devices running old code will fail to connect to updated devices. This is intentional - the old code is incompatible with the 512-byte BLE limit.

**Action**: Ensure all testing devices are updated to the latest code.

