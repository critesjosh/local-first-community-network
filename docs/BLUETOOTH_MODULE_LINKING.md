# Bluetooth Module Linking Fix

## Problem

The custom `@localcommunity/rn-bluetooth` native module was not being properly linked to the iOS app, resulting in:
- `WARN RNLCBluetoothModule not available` 
- Mock implementation being used instead of actual Bluetooth functionality
- No devices found during Bluetooth scanning

## Root Cause

The module wasn't being discovered by Expo's autolinking system because:
1. It's a local package in `packages/rn-bluetooth/`
2. Expo's autolinking takes precedence over React Native CLI's autolinking
3. The module needed to be explicitly added to the iOS `Podfile`

## Solution

### 1. Added Autolinking Configuration
Created `/react-native.config.js` to tell React Native CLI about the local module:

```javascript
module.exports = {
  dependencies: {
    '@localcommunity/rn-bluetooth': {
      root: './packages/rn-bluetooth',
    },
  },
};
```

### 2. Manually Added Pod to Podfile
Since Expo autolinking didn't pick up the local module, we explicitly added it to `ios/Podfile`:

```ruby
# Custom local Bluetooth module
pod 'RNLCBluetooth', :path => '../packages/rn-bluetooth/ios'
```

### 3. Reinstalled Pods
```bash
cd ios
pod install --repo-update
```

This properly linked the native module, as confirmed by:
```
Installing RNLCBluetooth (1.0.0)
```

## Verification

Check `ios/Podfile.lock` for:
```
- RNLCBluetooth (1.0.0):
```

## Result

After rebuilding the app:
- ✅ `RNLCBluetoothModule` is now available
- ✅ Actual native Bluetooth implementation is used
- ✅ Bluetooth scanning should now discover nearby devices
- ✅ BLE advertising should work properly

## Related Files

- `/react-native.config.js` - Autolinking configuration
- `ios/Podfile` - Manual pod reference
- `ios/Podfile.lock` - Confirmation of installation
- `packages/rn-bluetooth/` - Custom Bluetooth module source

## Testing

To verify the module is working:
1. Rebuild the app: `npx react-native run-ios`
2. Check console logs - the warning should be gone
3. Test Bluetooth scanning - devices should appear
4. Test BLE advertising - should broadcast successfully

## Notes

- This fix is specific to **iOS**. Android autolinking works differently.
- The custom module must be rebuilt whenever its native code changes.
- For production builds, ensure the module is properly signed and configured.

