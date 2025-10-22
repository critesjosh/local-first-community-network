# BLE Advertising Troubleshooting Guide

This guide helps resolve common Bluetooth Low Energy (BLE) advertising issues.

## Common Error: "Advertising failed to start"

**Note:** The custom Bluetooth module `@localcommunity/rn-bluetooth` is not currently available. The app is using a fallback implementation with `react-native-ble-plx` which has limited advertising support.

### Possible Causes & Solutions

#### 1. **Bluetooth Permissions**
**Error:** `Bluetooth advertising permission not granted`

**Solution:**
- Go to device Settings → Privacy & Security → Bluetooth
- Ensure the app has permission to use Bluetooth
- On iOS: Settings → Privacy & Security → Bluetooth → [App Name] → Allow
- On Android: Settings → Apps → [App Name] → Permissions → Bluetooth → Allow

#### 2. **Bluetooth Not Enabled**
**Error:** `Bluetooth is not enabled`

**Solution:**
- Enable Bluetooth in device settings
- iOS: Settings → Bluetooth → Turn On
- Android: Settings → Connected Devices → Connection Preferences → Bluetooth → Turn On

#### 3. **Device Limitations**
**Error:** `Bluetooth is not available on this device`

**Solution:**
- Ensure device supports BLE (Bluetooth 4.0+)
- Check if device is in airplane mode
- Restart the device

#### 4. **Already Advertising**
**Error:** `Already advertising`

**Solution:**
- This is usually not an error - the app will continue normally
- If persistent, restart the app

#### 5. **iOS Simulator Limitations**
**Error:** Various BLE errors on iOS Simulator

**Solution:**
- BLE advertising doesn't work reliably on iOS Simulator
- Test on a physical device instead
- Use `npm run ios` to build for physical device

#### 6. **Android Emulator Limitations**
**Error:** Various BLE errors on Android Emulator

**Solution:**
- BLE advertising has limited support on Android Emulator
- Test on a physical device instead
- Use `npm run android` to build for physical device

## Current Limitations

### Custom Module Not Available
- The custom `@localcommunity/rn-bluetooth` module is not currently built/available
- Using fallback implementation with `react-native-ble-plx`
- `react-native-ble-plx` has limited advertising support compared to the custom module

### What Works
- Bluetooth initialization and permission checking
- Device scanning (central role)
- Basic BLE functionality

### What Doesn't Work
- Full advertising functionality (peripheral role)
- Custom GATT service advertising
- Manufacturer data advertising

## Debugging Steps

### 1. Check Console Logs
Look for these log messages:
- `🔧 Initializing Bluetooth...`
- `🔐 Requesting Bluetooth permissions...`
- `✅ Bluetooth initialized and permissions requested`
- `📡 Starting BLE advertisement`
- `✅ BLE advertisement started successfully`

### 2. Verify Device State
- Bluetooth is enabled
- Device is not in airplane mode
- App has Bluetooth permissions

### 3. Test on Physical Device
- iOS Simulator and Android Emulator have limited BLE support
- Always test BLE features on physical devices

### 4. Check App Permissions
- iOS: Settings → Privacy & Security → Bluetooth
- Android: Settings → Apps → [App Name] → Permissions

## Common Solutions

### Restart Bluetooth
1. Turn off Bluetooth in device settings
2. Wait 10 seconds
3. Turn on Bluetooth
4. Restart the app

### Restart App
1. Close the app completely
2. Reopen the app
3. Try BLE advertising again

### Reset Permissions
1. Go to device settings
2. Find the app in app settings
3. Reset permissions
4. Grant permissions again when prompted

## Testing Commands

### Check BLE Status
```bash
# Run on physical device
npm run ios          # iOS device
npm run android      # Android device
```

### Debug Mode
```bash
# Enable debug logging
npm start -- --dev-client
```

## Platform-Specific Notes

### iOS
- BLE advertising works best on physical devices
- iOS Simulator has limited BLE support
- Requires explicit permission prompts

### Android
- BLE advertising works on physical devices
- Android Emulator has limited BLE support
- May require location permissions for BLE scanning

## Still Having Issues?

1. **Check the console logs** for specific error messages
2. **Test on a physical device** (not simulator/emulator)
3. **Verify all permissions** are granted
4. **Restart the device** if problems persist
5. **Check device Bluetooth compatibility** (Bluetooth 4.0+ required)

## Error Message Reference

| Error Message | Solution |
|---------------|----------|
| `Bluetooth is not available` | Enable Bluetooth, check device compatibility |
| `Bluetooth is not enabled` | Turn on Bluetooth in device settings |
| `Permission not granted` | Grant Bluetooth permissions in app settings |
| `Advertising failed to start` | Check device state, restart app, test on physical device |
| `Already advertising` | Usually not an error, app continues normally |

---

For more technical details, see the [Bluetooth Implementation Summary](BLUETOOTH_IMPLEMENTATION_SUMMARY.md).
