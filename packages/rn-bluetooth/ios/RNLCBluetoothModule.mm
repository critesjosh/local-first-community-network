/**
 * RNLCBluetoothModule.mm
 * TurboModule implementation that bridges to Swift managers
 */

#import <React/RCTBridgeModule.h>
#import <React/RCTConvert.h>
#import <React/RCTUtils.h>
#import <CoreBluetooth/CoreBluetooth.h>

// Import the generated header from Swift
#import "RNLCBluetooth-Swift.h"

@interface RNLCBluetoothModule : NSObject <RCTBridgeModule>
@end

@implementation RNLCBluetoothModule

RCT_EXPORT_MODULE(RNLCBluetoothModule)

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

// MARK: - Initialization

RCT_EXPORT_METHOD(initialize:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    [[BLECentralManager shared] initializeWithRestoreIdentifier:nil];
    [[BLEPeripheralManager shared] initialize];
    resolve(nil);
  } @catch (NSException *exception) {
    reject(@"init_error", exception.reason, nil);
  }
}

RCT_EXPORT_METHOD(requestPermissions:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  // On iOS, permissions are handled via Info.plist
  // Just return true
  resolve(@YES);
}

// MARK: - Central Role (Scanning & Connection)

RCT_EXPORT_METHOD(startScanning:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  [[BLECentralManager shared] startScanningAndReturnError:&error];
  if (error) {
    reject(@"scan_error", error.localizedDescription, error);
  } else {
    resolve(nil);
  }
}

RCT_EXPORT_METHOD(stopScanning:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [[BLECentralManager shared] stopScanning];
  resolve(nil);
}

RCT_EXPORT_METHOD(connect:(NSString *)deviceId
                  timeoutMs:(NSInteger)timeoutMs
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSUUID *uuid = [[NSUUID alloc] initWithUUIDString:deviceId];
  if (uuid == nil) {
    reject(@"invalid_device_id", @"Invalid device ID format", nil);
    return;
  }

  [[BLECentralManager shared] connectWithDeviceId:uuid timeoutMs:(int)timeoutMs];
  resolve(nil);
}

RCT_EXPORT_METHOD(disconnect:(NSString *)deviceId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSUUID *uuid = [[NSUUID alloc] initWithUUIDString:deviceId];
  if (uuid == nil) {
    reject(@"invalid_device_id", @"Invalid device ID format", nil);
    return;
  }

  [[BLECentralManager shared] disconnectWithDeviceId:uuid];
  resolve(nil);
}

RCT_EXPORT_METHOD(readProfile:(NSString *)deviceId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSUUID *uuid = [[NSUUID alloc] initWithUUIDString:deviceId];
  if (uuid == nil) {
    reject(@"invalid_device_id", @"Invalid device ID format", nil);
    return;
  }

  [[BLECentralManager shared] readProfileWithDeviceId:uuid completion:^(NSString * _Nullable result, NSError * _Nullable error) {
    if (error) {
      reject(@"read_error", error.localizedDescription, error);
    } else {
      resolve(result);
    }
  }];
}

RCT_EXPORT_METHOD(writeFollowRequest:(NSString *)deviceId
                  payloadJson:(NSString *)payloadJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSUUID *uuid = [[NSUUID alloc] initWithUUIDString:deviceId];
  if (uuid == nil) {
    reject(@"invalid_device_id", @"Invalid device ID format", nil);
    return;
  }

  [[BLECentralManager shared] writeFollowRequestWithDeviceId:uuid
                                                  payloadJson:payloadJson
                                                   completion:^(NSError * _Nullable error) {
    if (error) {
      reject(@"write_error", error.localizedDescription, error);
    } else {
      resolve(nil);
    }
  }];
}

// MARK: - Peripheral Role (Advertising & GATT Server)

RCT_EXPORT_METHOD(setProfileData:(NSString *)profileJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  [[BLEPeripheralManager shared] setProfileDataWithProfileJson:profileJson error:&error];
  if (error) {
    reject(@"profile_error", error.localizedDescription, error);
  } else {
    resolve(nil);
  }
}

RCT_EXPORT_METHOD(startAdvertising:(NSString *)displayName
                  userHashHex:(NSString *)userHashHex
                  followTokenHex:(NSString *)followTokenHex
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  [[BLEPeripheralManager shared] startAdvertisingWithDisplayName:displayName
                                                      userHashHex:userHashHex
                                                  followTokenHex:followTokenHex
                                                            error:&error];
  if (error) {
    reject(@"advertise_error", error.localizedDescription, error);
  } else {
    resolve(nil);
  }
}

RCT_EXPORT_METHOD(updateAdvertisement:(NSString *)displayName
                  userHashHex:(NSString *)userHashHex
                  followTokenHex:(NSString *)followTokenHex
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  [[BLEPeripheralManager shared] updateAdvertisementWithDisplayName:displayName
                                                        userHashHex:userHashHex
                                                    followTokenHex:followTokenHex
                                                              error:&error];
  if (error) {
    reject(@"update_error", error.localizedDescription, error);
  } else {
    resolve(nil);
  }
}

RCT_EXPORT_METHOD(stopAdvertising:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [[BLEPeripheralManager shared] stopAdvertising];
  resolve(nil);
}

// MARK: - Utility Methods

RCT_EXPORT_METHOD(isScanning:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  BOOL scanning = [[BLECentralManager shared] getIsScanning];
  resolve(@(scanning));
}

RCT_EXPORT_METHOD(isAdvertising:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  BOOL advertising = [[BLEPeripheralManager shared] getIsAdvertising];
  resolve(@(advertising));
}

RCT_EXPORT_METHOD(isConnected:(NSString *)deviceId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSUUID *uuid = [[NSUUID alloc] initWithUUIDString:deviceId];
  if (uuid == nil) {
    reject(@"invalid_device_id", @"Invalid device ID format", nil);
    return;
  }

  BOOL connected = [[BLECentralManager shared] isConnectedWithDeviceId:uuid];
  resolve(@(connected));
}

// Don't compile this code when we build for the old architecture.
#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeRNLCBluetoothSpecJSI>(params);
}
#endif

@end
