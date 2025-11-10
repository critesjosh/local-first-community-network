# BLE Production Readiness Checklist

## Overview

This document outlines the critical steps and requirements for deploying the BLE implementation to production. **The current implementation uses test/development identifiers and is NOT production-ready.**

## 🚨 Critical Blockers

### 1. Bluetooth SIG Company Identifier

**Status:** ❌ BLOCKER - Must be resolved before production

**Current State:**
- Using Company ID `0x1337` (5431 decimal)
- This is an unassigned test identifier
- Violates Bluetooth SIG specifications for shipping products

**Required Action:**
```
1. Join Bluetooth SIG (https://www.bluetooth.com/develop/join/)
   - Free for most organizations
   - Provides access to specifications and tools

2. Request Company Identifier Assignment
   - Navigate to: Company Identifier Request
   - Fill out organization details
   - Typical turnaround: 2-4 weeks

3. Update Code with Assigned ID
   - Android: BLEPeripheralManager.kt (line 35)
   - iOS: BLEPeripheralManager.swift (line 17)
   - TypeScript: packages/rn-bluetooth/src/types.ts (line 98)
   - TypeScript: src/services/bluetooth/BLEConstants.ts (line 21)
```

**Alternative for Testing:**
- Use `0xFFFF` (reserved for testing) during development
- Document clearly as test-only
- Never ship `0xFFFF` to production

### 2. iOS Info.plist Declarations

**Status:** ⚠️ VERIFY - Ensure descriptions are user-friendly

**Required Keys:**
```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>We use Bluetooth to help you discover and connect with people nearby.</string>

<key>NSBluetoothPeripheralUsageDescription</key>
<string>We use Bluetooth to let others discover you when you're nearby.</string>
```

**Production Checklist:**
- [ ] Descriptions are clear and user-friendly
- [ ] Explains actual use case (not technical jargon)
- [ ] Approved by legal/privacy team
- [ ] Localized for all supported languages

### 3. Android Permissions Declarations

**Status:** ⚠️ VERIFY - Ensure runtime permissions handled correctly

**Required in AndroidManifest.xml:**
```xml
<!-- Android 12+ (API 31+) -->
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />

<!-- Android 11 and below -->
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
```

**Production Checklist:**
- [ ] Permission rationale dialogs implemented
- [ ] Graceful handling of permission denial
- [ ] Settings deep-link for permission re-request
- [ ] Privacy policy updated with Bluetooth usage

## ⚙️ Configuration Review

### Advertisement Parameters

**Current Settings:**
```typescript
// BLEConstants.ts
RSSI_THRESHOLD = -85           // ~10 meters
SCAN_TIMEOUT = 30000           // 30 seconds
DEVICE_EXPIRY_TIME = 15000     // 15 seconds
FOLLOW_TOKEN_ROTATION_MS = 60000  // 60 seconds
```

**Production Review:**
- [ ] RSSI threshold tested in target environments
- [ ] Scan timeout appropriate for use case
- [ ] Device expiry doesn't cause UI flicker
- [ ] Token rotation balances privacy vs performance

### Battery Life Optimization

**Current Implementation:**
- Continuous advertising when started
- Pulsed scanning available (3s scan, 2s pause)
- No automatic duty cycling

**Production Recommendations:**
```typescript
// Consider implementing:
1. Adaptive scanning based on battery level
2. Reduced advertising in background
3. Pause both when battery < 20%
4. User-configurable "discovery range" (RSSI threshold)
```

**Production Checklist:**
- [ ] Battery impact measured on target devices
- [ ] Background mode behavior tested (iOS & Android)
- [ ] User controls for power management
- [ ] Analytics tracking battery drain

## 🔒 Security & Privacy

### Data Handling

**Current Implementation:**
- User hash broadcast (6 bytes of SHA-256)
- Rotating 4-byte token every 60 seconds
- Full profile shared only after connection

**Production Checklist:**
- [ ] Privacy policy covers BLE data collection
- [ ] User consent obtained for broadcasting
- [ ] Clear UI indicating when broadcasting/scanning
- [ ] Data retention policy for discovered devices
- [ ] Security audit of cryptographic implementation

### Cryptographic Keys

**Current Usage:**
- Ed25519 public keys in profiles
- Base64 encoding for JSON transport
- Keys stored in secure storage (Keychain/Keystore)

**Production Checklist:**
- [ ] Key generation audited
- [ ] Secure storage implementation reviewed
- [ ] Key backup/recovery strategy defined
- [ ] Cryptographic library versions pinned
- [ ] No keys logged or exposed in error messages

## 🧪 Testing Requirements

### Functional Testing

**Minimum Test Matrix:**
```
iOS Versions:        Android Versions:
- iOS 15             - Android 11
- iOS 16             - Android 12
- iOS 17             - Android 13
                     - Android 14

Device Types:
- iPhone (various models)
- iPad
- Android phones (Samsung, Google, OnePlus)
- Android tablets
```

**Test Scenarios:**
- [ ] Same platform (iOS-iOS, Android-Android)
- [ ] Cross-platform (iOS-Android, Android-iOS)
- [ ] Multiple simultaneous connections
- [ ] Background discovery and advertising
- [ ] App restart while advertising
- [ ] Bluetooth toggled off/on during operation
- [ ] Airplane mode scenarios
- [ ] Low battery conditions

### Performance Testing

**Metrics to Measure:**
- [ ] Time to first device discovered (< 5 seconds)
- [ ] Connection establishment time (< 3 seconds)
- [ ] Profile read latency (< 2 seconds)
- [ ] Battery drain per hour (< 5% for mixed usage)
- [ ] Memory usage stable (no leaks)
- [ ] CPU usage acceptable (< 10% average)

### Edge Cases

- [ ] Rapid repeated connections/disconnections
- [ ] Large profile data (with photos)
- [ ] Hundreds of devices in range (conference scenario)
- [ ] Poor signal conditions (< -90 dBm)
- [ ] Concurrent scanning and advertising
- [ ] Multiple app instances (different users, same device)

## 📱 Platform-Specific Considerations

### iOS

**App Store Review:**
- [ ] Background modes declared if using background BLE
- [ ] Clear explanation of Bluetooth usage in App Review notes
- [ ] Privacy nutrition labels updated
- [ ] No undocumented private API usage

**Known iOS Limitations:**
- Cannot set Manufacturer Specific Data
- Background advertising heavily restricted
- Scan results throttled in background
- Service UUID required for background scanning

**Production Checklist:**
- [ ] Tested on oldest supported iOS version
- [ ] Background behavior documented and tested
- [ ] Fallback for iOS version-specific bugs
- [ ] CoreBluetooth state restoration implemented

### Android

**Google Play Requirements:**
- [ ] Permissions declaration in Play Console
- [ ] Location permission justification provided
- [ ] Data safety form completed (Bluetooth data)
- [ ] Target API level meets requirements

**Known Android Fragmentation:**
- Some devices require `ACCESS_FINE_LOCATION` even on Android 12+
- BLE reliability varies by manufacturer
- Background scanning restricted on some OEM skins
- Doze mode affects BLE operations

**Production Checklist:**
- [ ] Tested on Samsung, Google, OnePlus devices
- [ ] Foreground service for background operations
- [ ] Battery optimization exemption requested (if needed)
- [ ] Manufacturer-specific issues documented

## 📊 Monitoring & Analytics

### Key Metrics to Track

**Discovery Metrics:**
```typescript
- Scan start/stop events
- Devices discovered per scan
- Time to first discovery
- Discovery success rate
- Cross-platform discovery ratio (iOS↔Android)
```

**Connection Metrics:**
```typescript
- Connection attempts
- Connection success/failure rate
- Connection duration
- Disconnection reasons
- Retry attempts needed
```

**Error Tracking:**
```typescript
- Bluetooth state errors (off, unauthorized, etc.)
- Permission denial rate
- GATT operation failures
- Timeout occurrences
- Platform-specific errors
```

**Production Checklist:**
- [ ] Analytics SDK integrated
- [ ] PII not logged in analytics
- [ ] Error aggregation configured
- [ ] Performance monitoring enabled
- [ ] Crash reporting covers native code

## 🚀 Deployment Strategy

### Phased Rollout

**Recommended Approach:**
```
1. Internal Testing (1-2 weeks)
   - Team members only
   - All test scenarios covered
   - Bug fixes and polish

2. Beta Testing (2-4 weeks)
   - TestFlight (iOS) and Internal Testing (Android)
   - 50-100 external users
   - Monitor metrics closely
   - Collect qualitative feedback

3. Limited Release (2-4 weeks)
   - 5-10% of production users
   - Geographic-based rollout
   - A/B test new vs old (if applicable)
   - Monitor error rates

4. Full Release
   - Gradual increase to 100%
   - Emergency rollback plan ready
   - Support team briefed
```

### Rollback Plan

**Critical Issues Requiring Rollback:**
- Crash rate > 1%
- Battery drain > 10%/hour
- Connection success rate < 50%
- Privacy/security vulnerability discovered

**Rollback Checklist:**
- [ ] Previous version binary preserved
- [ ] Rollback procedure documented
- [ ] Backend compatibility maintained
- [ ] User data migration tested both ways

## 📝 Documentation for Users

### In-App Guidance

**Required User Facing Content:**
- [ ] First-time setup wizard
- [ ] Bluetooth permission rationale
- [ ] "How to connect" tutorial
- [ ] Troubleshooting tips
- [ ] Privacy controls and settings

### Support Documentation

**Help Center Articles:**
- [ ] "Bluetooth not working" troubleshooting
- [ ] "Can't find nearby people" guide
- [ ] "Battery optimization" tips
- [ ] Platform-specific setup guides
- [ ] FAQ for common issues

## 🔧 Maintenance Plan

### Regular Updates

**Quarterly Review:**
- [ ] Update to latest BLE specifications
- [ ] Review and update blocked manufacturer list
- [ ] Check for iOS/Android beta issues
- [ ] Performance optimization opportunities
- [ ] Security audit

### Monitoring Ongoing

**Production Monitoring:**
- [ ] Error rate alerts configured
- [ ] Performance regression detection
- [ ] User feedback review process
- [ ] Bluetooth spec compliance monitoring

## ✅ Final Pre-Launch Checklist

### Code Quality
- [ ] All TODOs resolved or documented
- [ ] No test/debug code in production
- [ ] Logging appropriate (not excessive)
- [ ] Code review completed
- [ ] Security review completed

### Testing
- [ ] All functional tests passing
- [ ] Performance benchmarks met
- [ ] Cross-platform testing complete
- [ ] Edge cases covered
- [ ] Beta testing feedback addressed

### Configuration
- [ ] Production Company ID configured
- [ ] Appropriate timeouts set
- [ ] Analytics integrated
- [ ] Error tracking enabled
- [ ] Feature flags configured

### Documentation
- [ ] User guides complete
- [ ] API documentation updated
- [ ] Troubleshooting guide available
- [ ] Privacy policy updated
- [ ] Terms of service updated

### Legal & Compliance
- [ ] Privacy policy covers BLE usage
- [ ] User consent flows implemented
- [ ] Data retention policy defined
- [ ] Compliance requirements met (GDPR, CCPA, etc.)
- [ ] Bluetooth SIG compliance verified

### App Store / Play Store
- [ ] Screenshots and descriptions updated
- [ ] Privacy nutrition labels complete
- [ ] Permission justifications provided
- [ ] Release notes written
- [ ] Support contact information updated

---

## Summary

**The current BLE implementation is NOT production-ready.** The primary blocker is the test Company Identifier (`0x1337`). Additionally, comprehensive testing, security review, and monitoring setup are required before launch.

**Estimated Timeline to Production:**
- Company ID acquisition: 2-4 weeks
- Security & privacy review: 1-2 weeks  
- Comprehensive testing: 2-4 weeks
- Beta testing: 2-4 weeks
- **Total: 7-14 weeks minimum**

**Next Steps:**
1. Initiate Bluetooth SIG membership and Company ID request
2. Begin comprehensive testing on target devices
3. Implement monitoring and analytics
4. Complete security and privacy review
5. Execute phased rollout plan

---

**Last Updated:** 2025-10-29  
**Prepared By:** Development Team  
**Review Required By:** CTO, Legal, Privacy Officer

