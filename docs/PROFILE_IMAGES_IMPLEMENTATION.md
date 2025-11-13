# Profile Images Implementation

## Overview

Profile images are now automatically transferred during BLE connections, making users instantly recognizable. Images are compressed to ~50-100KB for efficient BLE transfer.

## What Was Implemented

### 1. Image Utilities (`src/utils/imageUtils.ts`)

**Features:**
- Image picker with camera and photo library support
- Automatic resize to 200x200px (optimal for profile photos)
- JPEG compression to 70% quality
- Base64 encoding for BLE transfer  
- Size validation (ensures images are under 100KB)

**Functions:**
```typescript
pickProfileImage()      // Pick from photo library
takeProfilePhoto()       // Take with camera  
base64ToDataUri()       // Convert base64 to React Native Image URI
getBase64SizeKB()       // Check image size
validateImageSize()     // Ensure under size limit
```

### 2. Profile Screen Updates

**Added:**
- Camera/library choice dialog when tapping avatar
- Automatic image compression on selection
- Base64 storage in database
- Live preview of profile photo

**User Flow:**
1. Tap avatar or "Add Profile Photo" button
2. Choose "Take Photo" or "Choose from Library"
3. Image auto-compresses and saves
4. Profile photo appears immediately

### 3. Connection Service Integration

**Profile images are included in:**
- GATT server profile data (served when device connects)
- Connection requests (sent to other device)
- Connection responses (sent back to requester)
- Stored connections (saved in database)

**Automatic Transfer:**
```typescript
// When broadcasting
const fullProfile = {
  userId: user.id,
  displayName: user.displayName,
  publicKey: Buffer.from(identity.publicKey).toString('base64'),
  profilePhoto: profilePhotoBase64,  // ← Transferred automatically
};

// When connecting
const connectionRequest = {
  type: 'connection-request',
  requester: {
    userId, displayName, publicKey,
    profilePhoto: currentUser.profilePhoto,  // ← Sent over BLE
  },
};
```

### 4. UI Display

**Profile images now appear in:**
- ✅ ProfileScreen (user's own photo)
- ✅ ConnectionsScreen (all connection cards)
- ✅ ConnectScreen (discovered devices with existing connections)

**Fallback:**
- Shows first initial in colored circle if no photo
- Maintains consistent size and styling

## File Changes

### New Files
- `src/utils/imageUtils.ts` - Image processing utilities

### Modified Files
1. `src/screens/ProfileScreen.tsx`
   - Added camera/library picker
   - Integrated image compression
   - Display base64 images

2. `src/screens/ConnectionsScreen.tsx`
   - Display profile photos in connection cards
   - Use base64ToDataUri() helper

3. `src/screens/ConnectScreen.tsx`
   - Display profile photos for discovered devices
   - Use base64ToDataUri() helper

4. `src/services/bluetooth/BLEBroadcastService.ts`
   - Already had support (no changes needed)

5. `src/services/ConnectionService.ts`
   - Already had support (no changes needed)

6. `src/services/IdentityService.ts`
   - Already had support (no changes needed)

7. `src/types/bluetooth.ts`
   - Already had `profilePhoto?: string` fields

## Image Specifications

**Format:** JPEG (Base64 encoded)  
**Resolution:** 200x200 pixels  
**Quality:** 70% compression  
**Size:** ~50-100KB per image  
**Storage:** Base64 string in SQLite database

### Why These Settings?

- **200x200px**: Perfect for profile avatars, large enough to be clear
- **70% JPEG**: Sweet spot for quality vs size
- **Base64**: Required for BLE transfer over GATT characteristics
- **50-100KB**: Small enough for fast BLE transfer (~1-2 seconds)

## BLE Transfer Process

```
Device A → Device B Connection Flow:

1. Device A starts advertising (includes profile data in GATT server)
2. Device B discovers Device A and connects
3. Device B reads profile from Device A's GATT server
   ├─ userId, displayName, publicKey
   └─ profilePhoto (base64, ~50-100KB)
4. Device B sends connection request (includes Device B's profile)
   └─ profilePhoto transferred back
5. Both devices now have each other's profile photos
6. Photos stored in connections table
```

## Testing Checklist

- [ ] Add profile photo from library
- [ ] Take profile photo with camera
- [ ] Photo appears in ProfileScreen
- [ ] Connect to another device
- [ ] Photo transfers successfully
- [ ] Photo appears in ConnectionsScreen
- [ ] Photo appears in ConnectScreen
- [ ] Connection without photo shows initials
- [ ] Update photo and verify it syncs

## Known Limitations

1. **One-time transfer**: Photos are transferred during initial connection
   - Future: Add sync to update photos for existing connections
   
2. **Size limit**: Images must be under 100KB
   - Automatic compression usually handles this
   - Very large or high-resolution images may need multiple attempts

3. **BLE transfer time**: ~1-2 seconds for image transfer
   - Normal for BLE, not a bug
   - User sees "Connecting..." status during transfer

## Future Enhancements

- [ ] Photo sync for existing connections (detect updates)
- [ ] Background photo updates during reconnections
- [ ] Photo caching for faster display
- [ ] Progressive image loading (show low-res first)
- [ ] Photo verification/authenticity indicators

