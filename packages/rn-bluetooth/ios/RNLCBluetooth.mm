/**
 * RNLCBluetooth.mm
 * Event emitter bridge implementation
 */

#import "RNLCBluetooth.h"

@implementation RNLCBluetooth

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"RNLCBluetoothEvent"];
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
