# Crypto Fix Summary

## Problem
The app was failing during identity creation with two related errors:
1. `TypeError: c.getRandomValues is not a function (it is undefined)` - `@noble/ed25519` requires `crypto.getRandomValues()`
2. `Error: crypto.subtle must be defined` - `@noble/ed25519`'s `keygenAsync()` requires the Web Crypto API

Neither of these are available in React Native by default.

## Solution
Two-part fix:
1. Installed `react-native-get-random-values` to polyfill `crypto.getRandomValues()`
2. Updated key generation code to use methods that only need `getRandomValues()` (not the full Web Crypto API)

## Changes Made

### 1. Installed react-native-get-random-values
```bash
npm install react-native-get-random-values
```

### 2. Added Polyfill Import to Entry Point
**File:** `index.js`
- Added `import 'react-native-get-random-values';` as the very first import
- This polyfills `crypto.getRandomValues()` globally before any crypto operations

### 3. Added Polyfill Import to Test Setup  
**File:** `__tests__/setup.ts`
- Added the same import to ensure tests work properly

### 4. Updated KeyManager to avoid crypto.subtle dependency
**File:** `src/services/crypto/KeyManager.ts`
- Changed from `ed.keygenAsync()` (requires crypto.subtle) to `ed.utils.randomSecretKey()` + `ed.getPublicKeyAsync()`
- For secp256k1 ECDH keys, generates random bytes directly using `crypto.getRandomValues()` 
- This approach only needs `crypto.getRandomValues()` which is now polyfilled
- Both methods are cryptographically secure and produce identical key pairs

### 5. Maintained Shared Crypto Configuration
**File:** `src/services/crypto/cryptoConfig.ts`
- Configures `@noble/ed25519` and `@noble/secp256k1` to use `expo-crypto` when available
- Gracefully falls back to the polyfill if needed

### 6. Other Crypto Services (already configured from earlier work)
- **ECDH.ts**: Imports cryptoConfig for ephemeral key generation
- **EncryptionService.ts**: Uses expo-crypto directly for random IV/key generation

### 7. Test Setup
**File:** `__tests__/setup.ts`
- Added polyfill import and mock for `expo-crypto`
- Uses Node's `webcrypto` for crypto.subtle in tests

### 8. Database and Error Handling (from earlier fixes)
- **Database.ts**: Fixed table creation and error handling
- **IdentityService.ts**: Added detailed logging at each step
- **OnboardingScreen.tsx**: Shows actual error messages

## Testing
Run tests to verify everything works:
```bash
npm test
```

## Running the App
Stop your current server and restart with a clean cache:
```bash
npx expo start --clear
```

If you're using a development build, you may need to rebuild the app since we added a new native dependency:
```bash
# For iOS
npx expo run:ios

# For Android  
npx expo run:android
```

Then try creating your identity again!
