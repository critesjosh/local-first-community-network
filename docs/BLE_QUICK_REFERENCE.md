# BLE Implementation Quick Reference

**Quick links for developers working with the BLE stack**

## 📚 Documentation Index

| Document | Purpose | When to Read |
|----------|---------|--------------|
| [BLE_IMPLEMENTATION_GUIDE.md](./BLE_IMPLEMENTATION_GUIDE.md) | Complete technical architecture | Understanding the system |
| [BLE_PRODUCTION_READINESS.md](./BLE_PRODUCTION_READINESS.md) | Production deployment checklist | Before shipping |
| [BLE_CROSS_PLATFORM_GUIDE.md](./BLE_CROSS_PLATFORM_GUIDE.md) | iOS/Android compatibility | Debugging cross-platform |
| [BLE_REVIEW_SUMMARY.md](./BLE_REVIEW_SUMMARY.md) | What was changed in review | Understanding recent changes |

## 🔑 Key UUIDs

```typescript
Service:     6e400001-b5a3-f393-e0a9-e50e24dcca9e
Profile:     6e400002-b5a3-f393-e0a9-e50e24dcca9e  // READ
Handshake:   6e400003-b5a3-f393-e0a9-e50e24dcca9e  // WRITE + NOTIFY
```

## ⚠️ Production Warning

```
Company ID: 0x1337 is TEST ONLY
Must obtain official Bluetooth SIG Company Identifier before production
See: BLE_PRODUCTION_READINESS.md
```

## 📱 Advertisement Formats

### Android Broadcasts
```
Main:     Service UUID only
Response: Manufacturer Data
  [Company ID: 0x1337 (LE)]
  [version: 1]
  [nameLength]
  [displayName (max 12 bytes)]
  [userHash (6 bytes)]
  [followToken (4 bytes)]
```

### iOS Broadcasts
```
Main: Service UUID + Local Name
Format: "LCNS:<name>:<hash>:<token>"
Example: "LCNS:Alice:a1b2c3d4e5f6:12345678"
```

## 🔍 Quick Debugging

### iOS Not Finding Android?
1. Check Android is advertising Service UUID
2. Verify iOS scanning for Service UUID
3. Check RSSI threshold
4. Confirm manufacturer data parser working

### Android Not Finding iOS?
1. Check iOS advertising (foreground/background)
2. Verify local name format "LCNS:..."
3. Check Service UUID filter
4. Confirm local name parser working

## 📂 File Locations

### Native Code
```
iOS Peripheral:  packages/rn-bluetooth/ios/BLEPeripheralManager.swift
iOS Central:     packages/rn-bluetooth/ios/BLECentralManager.swift
Android Periph:  packages/rn-bluetooth/android/.../BLEPeripheralManager.kt
Android Central: packages/rn-bluetooth/android/.../BLECentralManager.kt
```

### TypeScript
```
Types:           packages/rn-bluetooth/src/types.ts
Module:          packages/rn-bluetooth/src/BluetoothModule.js
Constants:       src/services/bluetooth/BLEConstants.ts
Manager:         src/services/bluetooth/BLEManager.ts
Broadcast:       src/services/bluetooth/BLEBroadcastService.ts
```

## 🧪 Testing Checklist

- [ ] iOS → iOS discovery
- [ ] Android → Android discovery
- [ ] iOS → Android discovery
- [ ] Android → iOS discovery
- [ ] Connection and profile read
- [ ] Handshake write and response
- [ ] Background mode (both platforms)
- [ ] RSSI filtering
- [ ] Token rotation

## 🚨 Common Gotchas

1. **iOS can't set Manufacturer Data** - Use local name instead
2. **Company ID is little-endian** - 0x1337 = [0x37, 0x13]
3. **Platform handles Company ID** - Don't include in app payload
4. **Always advertise Service UUID** - Required for discovery
5. **Parse both formats** - Support iOS and Android advertisements

## 📞 Support

**Questions?** See the full documentation:
- Architecture: `BLE_IMPLEMENTATION_GUIDE.md`
- Production: `BLE_PRODUCTION_READINESS.md`
- Cross-platform: `BLE_CROSS_PLATFORM_GUIDE.md`

---

Last Updated: 2025-10-29

