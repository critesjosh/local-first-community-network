# Profile Photos - Future Implementation

## Current Status: Removed from BLE Transfer

Profile photos have been **temporarily removed** from BLE connections because:

1. **GATT Read Limits**: Max ~512 bytes per read, photos are 50-100KB
2. **GATT Write Limits**: Max ~512 bytes per write
3. **Truncation Issues**: Large JSON gets cut off, causing parse errors
4. **Reliability**: Essential connection data must work 100% of the time

## What's in BLE Handshake Now (Essential Data Only)

```typescript
{
  userId: string,        // ~44 bytes (base58 public key)
  displayName: string,   // ~20 bytes (user name)
  publicKey: string,     // ~44 bytes (base64 encoded)
}
// Total: ~108 bytes - fits in single GATT operation ✅
```

## Profile Photo Storage

Profile photos are still:
- ✅ Captured and stored locally in the app
- ✅ Displayed in your own profile
- ✅ Saved in SQLite database
- ❌ **Not transferred** during BLE connections

## Future Solutions for Photo Transfer

### Option 1: Chunked BLE Transfer (Complex)
Break photos into 512-byte chunks and reassemble:
- Pros: Works over BLE only
- Cons: Complex, slow, error-prone

### Option 2: HTTP/HTTPS Sync (Recommended)
Use optional internet connectivity when available:
- Upload photo to temporary storage
- Share URL via BLE
- Download on other device
- Pros: Fast, reliable
- Cons: Requires internet (but optional)

### Option 3: QR Code Exchange
Display photo as QR code, scan with camera:
- Pros: Works offline, no BLE issues
- Cons: Manual step, lower quality

### Option 4: WiFi Direct / Local Network
Use local WiFi when available:
- Pros: Fast, large data transfers
- Cons: Complex setup, not always available

### Option 5: Defer Until Physical Meeting
Exchange photos when physically near:
- Show phone screen to each other
- Manual photo share via standard methods
- Pros: Simple, reliable
- Cons: Not automatic

## Recommended Approach

**Hybrid Solution:**
1. **BLE transfers essential data only** (current implementation) ✅
2. **Profile photos sync via HTTP when online** (future)
3. **Fallback to manual share** (standard iOS/Android sharing)

## Implementation Priority

1. ✅ **Essential connections work** (userId, name, keys) - DONE
2. ⏳ **Optional HTTP photo sync** - Future
3. ⏳ **Manual photo share button** - Future
4. ⏳ **QR code fallback** - Future

## User Experience

**Current:**
- Fast, reliable connections ✅
- See user's name and initials
- No photos (for now)

**Future:**
- Fast, reliable connections ✅
- See user's name and initials immediately
- Photos sync in background when online
- Manual share option if offline

## Technical Notes

**Why not chunk over BLE?**
- 50KB photo = ~100 GATT operations
- Each operation has overhead
- Easy to lose packets
- Reconnection complexity
- Not worth it for optional feature

**Why HTTP is better:**
- Designed for large files
- Automatic retries
- Resume capability
- Much faster
- Well-tested infrastructure

## Migration Path

When HTTP sync is implemented:
1. Keep current BLE handshake (essential data)
2. Add optional `photoSyncUrl` field (20 bytes)
3. Background download after connection
4. Update connection in database
5. Notify UI to refresh

## Database Schema (Already Ready)

```sql
CREATE TABLE connections (
  ...
  profile_photo TEXT,  -- Can store base64 OR URL
  ...
);
```

The schema supports both:
- Base64 images (current, but not transferred)
- URLs (future HTTP sync)

## Summary

**Current Implementation:**
- ✅ Minimal, reliable BLE handshake
- ✅ Essential connection data only
- ✅ No truncation or parse errors
- ❌ No profile photos in connections

**Future Enhancement:**
- HTTP/HTTPS photo sync when online
- Optional, doesn't break offline mode
- Fast and reliable
- Standard web infrastructure

