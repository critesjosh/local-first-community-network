# Local Social Network Expo - Setup Guide

This project is configured for local development and testing on physical devices without requiring Expo's cloud build service.

## Project Configuration

- **Expo SDK**: 54.0.13
- **React Native**: 0.81.4 (with New Architecture enabled)
- **React**: 19.1.0
- **Development**: expo-dev-client for local builds

## Prerequisites

### Required for All Platforms

- Node.js (v22.16.0 or compatible)
- npm or yarn package manager
- Git (already initialized)

### For Android Development

- **Option 1: Expo Go App (Easiest, Limited)**

  - Install "Expo Go" from Google Play Store
  - Best for simple projects without native modules

- **Option 2: Development Build (Recommended)**
  - Android Studio with Android SDK
  - Java Development Kit (JDK 17 or later)
  - Android device with USB debugging enabled OR Android emulator
  - For local builds: EAS CLI (`npm install -g eas-cli`)

### For iOS Development (macOS only for local builds)

- **Option 1: Expo Go App (Easiest, Limited)**

  - Install "Expo Go" from Apple App Store
  - Best for simple projects without native modules

- **Option 2: Development Build (Recommended)**
  - macOS with Xcode (latest version)
  - iOS device with developer mode enabled OR iOS simulator
  - Apple Developer account (free account works for development)
  - For local builds: EAS CLI (`npm install -g eas-cli`)

## Quick Start - Testing on Physical Device

### Method 1: Using Expo Go (Fastest, No Build Required)

This is the easiest method and works for most basic React Native apps:

1. **Install Expo Go on your phone**:

   - Android: Download from Google Play Store
   - iOS: Download from Apple App Store

2. **Start the development server**:

   ```bash
   npm start
   ```

3. **Connect your device**:

   - Ensure your phone and computer are on the same WiFi network
   - **Android**: Open Expo Go app and scan the QR code shown in terminal
   - **iOS**: Open Camera app and scan the QR code, then tap the notification

4. **Development workflow**:
   - Edit code in `App.js`
   - Save the file
   - App automatically reloads on your device
   - Shake device to open developer menu

**Limitations**:

- Cannot use custom native modules
- Limited to Expo SDK modules only
- Some advanced features unavailable

### Method 2: Development Build (Full Features)

This method gives you full control and allows custom native modules:

#### Initial Setup (One-time)

1. **Install EAS CLI globally** (if not already installed):

   ```bash
   npm install -g eas-cli
   ```

2. **Login to Expo** (creates free account if needed):

   ```bash
   eas login
   ```

3. **Configure the project**:
   ```bash
   eas build:configure
   ```

#### Building for Android

**Option A: Local Build (No Cloud Required)**

1. **Prerequisites**:

   - Install Android Studio
   - Configure Android SDK and environment variables
   - Accept Android SDK licenses: `sdkmanager --licenses`

2. **Generate native Android project**:

   ```bash
   npm run prebuild
   ```

   This creates the `android/` folder with native code.

3. **Build APK locally**:

   ```bash
   cd android
   ./gradlew assembleDebug
   ```

   APK will be in `android/app/build/outputs/apk/debug/app-debug.apk`

4. **Install on device**:
   - Connect device via USB with debugging enabled
   - Run: `adb install android/app/build/outputs/apk/debug/app-debug.apk`
   - Or copy APK to device and install manually

**Option B: Using EAS Local Build**

```bash
npm run build:android
```

This builds locally using Docker (requires Docker installed).

#### Building for iOS (macOS only)

**Option A: Local Build with Xcode**

1. **Generate native iOS project**:

   ```bash
   npm run prebuild
   ```

   This creates the `ios/` folder with native code.

2. **Install CocoaPods dependencies**:

   ```bash
   cd ios
   pod install
   cd ..
   ```

3. **Open in Xcode**:

   ```bash
   open ios/localsocialnetworkexpo.xcworkspace
   ```

4. **Configure signing**:

   - Select your project in Xcode
   - Go to Signing & Capabilities
   - Select your team/Apple ID
   - Xcode will handle provisioning

5. **Build and run**:
   - Connect your iOS device
   - Select your device in Xcode
   - Click the Play button or press Cmd+R

**Option B: Using EAS Local Build**

```bash
npm run build:ios
```

Requires macOS with Xcode installed.

#### Running Development Build

After building and installing the development build on your device:

1. **Start the development server**:

   ```bash
   npm run start:dev-client
   ```

2. **Open the app on your device**:
   - Launch the installed app (not Expo Go)
   - It will automatically connect to the dev server
   - Ensure phone and computer are on same network

## Development Commands

```bash
# Start development server (for Expo Go)
npm start

# Start development server (for development builds)
npm run start:dev-client

# Start with specific platform (attempts to open emulator/simulator)
npm run android
npm run ios

# Generate native projects for manual builds
npm run prebuild

# Clean and regenerate native projects
npm run prebuild:clean

# Local builds using EAS (requires setup)
npm run build:android
npm run build:ios
```

## Project Structure

```
local-social-network-expo/
├── App.js                 # Main application component
├── app.json              # Expo configuration
├── eas.json              # EAS Build configuration
├── package.json          # Dependencies and scripts
├── assets/               # Images, fonts, and other assets
├── android/              # Native Android project (after prebuild)
├── ios/                  # Native iOS project (after prebuild)
└── node_modules/         # Installed dependencies
```

## Network Configuration

If you have trouble connecting your device to the development server:

1. **Check WiFi**: Ensure both devices are on the same network
2. **Firewall**: Allow Metro bundler (port 8081) through firewall
3. **Use tunnel**: Start with `npm start -- --tunnel` (slower but works across networks)
4. **Manual connection**:
   - Find your computer's IP address
   - In Expo Go or dev build, manually enter: `exp://YOUR_IP:8081`

## Troubleshooting

### "Unable to connect to development server"

- Verify same WiFi network
- Try tunnel mode: `npm start -- --tunnel`
- Check firewall settings
- Restart Metro bundler: Stop and run `npm start` again

### Build errors

- Clear cache: `npx expo start --clear`
- Reinstall dependencies: `rm -rf node_modules && npm install`
- Clean native projects: `npm run prebuild:clean`

### iOS build issues

- Update CocoaPods: `sudo gem install cocoapods`
- Clean pods: `cd ios && pod deintegrate && pod install`
- Clean Xcode: Product > Clean Build Folder

### Android build issues

- Accept licenses: `sdkmanager --licenses`
- Clean Gradle: `cd android && ./gradlew clean`
- Check Java version: `java -version` (needs JDK 17+)

## Next Steps

1. Edit `App.js` to start building your social network app
2. Add dependencies as needed: `npm install <package-name>`
3. If you add native modules, rebuild the development build
4. Use version control: `git add . && git commit -m "Initial setup"`

## Testing Options Summary

| Method                | Pros                               | Cons                         | Best For                            |
| --------------------- | ---------------------------------- | ---------------------------- | ----------------------------------- |
| **Expo Go**           | Instant testing, no build needed   | Limited native modules       | Quick prototyping, learning         |
| **Development Build** | Full native access, custom modules | Requires build step          | Production apps, native features    |
| **Local Build**       | Full control, no cloud dependency  | Complex setup, longer builds | Advanced users, custom requirements |

## Additional Resources

- Expo Documentation: https://docs.expo.dev
- React Native Docs: https://reactnative.dev
- EAS Build Docs: https://docs.expo.dev/build/introduction/
- Expo Forums: https://forums.expo.dev

## Support

For issues specific to this setup, check the Expo documentation or open an issue in this repository.
