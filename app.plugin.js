/**
 * Expo Config Plugin for Local Community Bluetooth
 * Automatically configures iOS and Android for Bluetooth operations
 */

const {
  withInfoPlist,
  withAndroidManifest,
  createRunOncePlugin,
} = require('@expo/config-plugins');

/**
 * Configure iOS Info.plist for Bluetooth
 */
function withIOSBluetooth(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.NSBluetoothAlwaysUsageDescription =
      config.modResults.NSBluetoothAlwaysUsageDescription ||
      'This app uses Bluetooth to discover nearby community members and connect with local events.';

    config.modResults.NSBluetoothPeripheralUsageDescription =
      config.modResults.NSBluetoothPeripheralUsageDescription ||
      'This app uses Bluetooth to advertise your presence to nearby community members.';

    config.modResults.UIBackgroundModes = [
      ...(config.modResults.UIBackgroundModes || []),
      'bluetooth-central',
      'bluetooth-peripheral',
    ];

    return config;
  });
}

/**
 * Configure Android Manifest for Bluetooth
 */
function withAndroidBluetooth(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults.manifest;

    // Add permissions if not already present
    const permissions = [
      // Legacy permissions (Android <= 11)
      { $: { 'android:name': 'android.permission.BLUETOOTH', 'android:maxSdkVersion': '30' } },
      { $: { 'android:name': 'android.permission.BLUETOOTH_ADMIN', 'android:maxSdkVersion': '30' } },
      { $: { 'android:name': 'android.permission.ACCESS_FINE_LOCATION', 'android:maxSdkVersion': '30' } },
      { $: { 'android:name': 'android.permission.ACCESS_COARSE_LOCATION', 'android:maxSdkVersion': '30' } },
      // Modern permissions (Android 12+)
      { $: { 'android:name': 'android.permission.BLUETOOTH_SCAN' } },
      { $: { 'android:name': 'android.permission.BLUETOOTH_CONNECT' } },
      { $: { 'android:name': 'android.permission.BLUETOOTH_ADVERTISE' } },
      // Foreground service
      { $: { 'android:name': 'android.permission.FOREGROUND_SERVICE' } },
      { $: { 'android:name': 'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE' } },
    ];

    androidManifest['uses-permission'] = androidManifest['uses-permission'] || [];

    permissions.forEach((permission) => {
      const permName = permission.$['android:name'];
      const exists = androidManifest['uses-permission'].some(
        (p) => p.$['android:name'] === permName
      );

      if (!exists) {
        androidManifest['uses-permission'].push(permission);
      }
    });

    // Add foreground service to application
    const application = androidManifest.application[0];
    application.service = application.service || [];

    const serviceExists = application.service.some(
      (s) => s.$['android:name'] === 'com.rnbluetooth.BluetoothForegroundService'
    );

    if (!serviceExists) {
      application.service.push({
        $: {
          'android:name': 'com.rnbluetooth.BluetoothForegroundService',
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:foregroundServiceType': 'connectedDevice',
        },
      });
    }

    return config;
  });
}

/**
 * Main plugin function
 */
function withLocalBluetoothConfig(config) {
  config = withIOSBluetooth(config);
  config = withAndroidBluetooth(config);
  return config;
}

module.exports = createRunOncePlugin(
  withLocalBluetoothConfig,
  'local-community-bluetooth',
  '1.0.0'
);
