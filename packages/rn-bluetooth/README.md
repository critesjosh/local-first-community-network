# @localcommunity/rn-bluetooth

Custom Bluetooth TurboModule optimized for Local Community Network.

## Features

- **Central Role**: Scan for nearby devices, connect, read profiles
- **Peripheral Role**: Advertise presence, respond to connections
- **Optimized**: Hardcoded GATT schema for your specific protocol
- **TurboModule**: Type-safe, high-performance native bridge

## Installation

```bash
npm install @localcommunity/rn-bluetooth
npx expo prebuild --clean
```

## Usage

```typescript
import { Bluetooth, addBluetoothListener } from '@localcommunity/rn-bluetooth';

// Initialize
await Bluetooth.initialize();
await Bluetooth.requestPermissions();

// Start advertising
await Bluetooth.startAdvertising('DisplayName', 'userHashHex', 'tokenHex');

// Start scanning
await Bluetooth.startScanning();

// Listen for events
const unsubscribe = addBluetoothListener((event) => {
  if (event.type === 'deviceDiscovered') {
    console.log('Found device:', event.deviceId, event.rssi);
  }
});
```

## Protocol

### Service UUID
`6e400001-b5a3-f393-e0a9-e50e24dcca9e`

### Characteristics
- **Profile** (READ): `6e400002-b5a3-f393-e0a9-e50e24dcca9e`
  - Returns JSON: `{userId, displayName, publicKey, profilePhoto?}`
- **Handshake** (WRITE): `6e400003-b5a3-f393-e0a9-e50e24dcca9e`
  - Accepts JSON follow-request payload

### Advertisement Format
Manufacturer data: `[version, nameLength, displayName, userHash(6 bytes), followToken(4 bytes)]`

## License

MIT
