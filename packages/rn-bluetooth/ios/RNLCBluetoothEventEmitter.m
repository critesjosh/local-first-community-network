/**
 * RNLCBluetoothEventEmitter.m
 * Objective-C bridge to expose Swift EventEmitter to React Native
 */

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(RNLCBluetoothEventEmitter, RCTEventEmitter)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

@end

