# Multi-Camera Setup

This feature uses `react-native-vision-camera` to record the back camera feed while displaying the front camera in a picture-in-picture overlay. Follow the steps below after installing dependencies.

## Installation

```bash
yarn add react-native-vision-camera
```

> The project now declares the dependency in `package.json`, but you must run the install command locally to update the native modules.

### iOS

- Requires iOS 13 or later and a device with dual-camera support (iPhone XS/XR or newer).
- After installing dependencies, run `npx pod-install`. Multi-cam support is not available in the simulator.
- Add the following usage descriptions to `ios/localsocialnetworkexpo/Info.plist` if they are not already present:
  - `NSCameraUsageDescription`
  - `NSMicrophoneUsageDescription` (if audio capture is enabled)
- Enable background camera access in `AppDelegate` if you plan to continue capture while multitasking.

### Android

- Requires Android 10 (API 29) or later. Multi-camera preview support is only available on select devices.
- Ensure the app declares `android.permission.CAMERA` in `AndroidManifest.xml`.
- For best performance, set `minSdkVersion` to 29 or higher in `android/build.gradle`.
- Vision Camera enables camera2 APIs by default. Some OEMs block simultaneous front/back capture; handle fallback in the UI.

## Runtime Permissions

Request permissions before mounting the multi-camera view:

```ts
await Camera.requestCameraPermission();
await Camera.requestMicrophonePermission();
```

Handle the denied state by showing a CTA that opens the OS settings page.

## Unsupported Devices

When `useCameraDevices()` returns `null` for the front or back camera, fall back to a single-camera experience and prompt the user that picture-in-picture is unavailable on their device.

