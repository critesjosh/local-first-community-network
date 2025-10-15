# Local Social Network Expo

A React Native mobile application built with Expo SDK 54, configured for local development and testing on physical devices.

## Tech Stack

- **Expo SDK**: 54.0.13
- **React Native**: 0.81.4 (New Architecture enabled)
- **React**: 19.1.0
- **Development**: expo-dev-client for local builds

## Getting Started

### Quick Start (5 minutes)

The fastest way to test on your phone is using Expo Go:

1. Install Expo Go on your phone (Android: Play Store, iOS: App Store)
2. Run `npm start` in this directory
3. Scan the QR code with Expo Go (Android) or Camera app (iOS)

See **QUICKSTART.md** for detailed step-by-step instructions.

### Complete Setup

For full setup instructions including local builds and development builds, see **SETUP.md**.

## Available Commands

### Development
```bash
npm start                 # Start Expo development server
npm run start:dev-client  # Start for development builds
npm run android          # Run on Android device/emulator
npm run ios              # Run on iOS device/simulator
npm run web              # Run in web browser
```

### Building
```bash
npm run prebuild          # Generate native projects (android/, ios/)
npm run prebuild:clean    # Clean and regenerate native projects
npm run build:android     # Build Android APK locally
npm run build:ios         # Build iOS app locally (macOS only)
```

## Project Structure

```
local-social-network-expo/
├── App.js              # Main application entry point
├── app.json            # Expo configuration
├── eas.json            # Build configuration
├── package.json        # Dependencies and scripts
├── assets/             # Images, fonts, icons
├── QUICKSTART.md       # 5-minute setup guide
├── SETUP.md            # Complete setup documentation
└── README.md           # This file
```

## Testing Methods

| Method | Best For | Requires Build |
|--------|----------|----------------|
| **Expo Go** | Quick testing, prototyping | No |
| **Development Build** | Full native features | Yes |
| **Local Build** | Complete control | Yes |

## Features

- React Native New Architecture enabled for better performance
- Configured for both Expo Go and development builds
- Ready for local building without cloud services
- Pre-configured EAS Build settings
- Git repository initialized

## Documentation

- **QUICKSTART.md** - Get running in 5 minutes
- **SETUP.md** - Complete setup guide with all options
- [Expo Documentation](https://docs.expo.dev)
- [React Native Documentation](https://reactnative.dev)

## Development Workflow

1. Edit `App.js` to build your app
2. Save files to see live reload on device
3. Shake device for developer menu
4. Add packages: `npm install <package-name>`
5. If adding native modules, rebuild with `npm run prebuild`

## Prerequisites

- Node.js v22 or compatible
- npm or yarn
- For Android: Expo Go app OR Android Studio for builds
- For iOS: Expo Go app OR macOS with Xcode for builds

## Troubleshooting

**Can't connect to device?**
- Ensure same WiFi network
- Try: `npm start -- --tunnel`
- Check firewall settings

**Build errors?**
- Clear cache: `npm start -- --clear`
- Reinstall: `rm -rf node_modules && npm install`
- See SETUP.md for detailed troubleshooting

## Next Steps

1. Start the development server: `npm start`
2. Test on your physical device
3. Begin building your social network features
4. Commit changes: `git add . && git commit -m "Your message"`

## License

Private project

## Support

For setup issues, see SETUP.md or consult:
- [Expo Forums](https://forums.expo.dev)
- [Expo Discord](https://chat.expo.dev)
