#if TARGET_OS_MACCATALYST
/**
 * lighttpd/pcre2 CMake does not configure for Mac Catalyst (pcre2-config
 * requires COMPONENTS; Darwin flags hardcode x86_64-apple-ios-macabi).
 * Stub the TurboModule so JS still loads. Offline HLS loopback is unavailable.
 */

#import <React/RCTInvalidating.h>
#import <ReactNativeStaticServerSpec/ReactNativeStaticServerSpec.h>

@interface ReactNativeStaticServer : NativeReactNativeStaticServerSpecBase <
    NativeReactNativeStaticServerSpec,
    RCTInvalidating>
@end

@implementation ReactNativeStaticServer

+ (NSString *)moduleName {
  return @"ReactNativeStaticServer";
}

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (void)invalidate {
}

- (facebook::react::ModuleConstants<JS::NativeReactNativeStaticServer::Constants>)constantsToExport {
  return facebook::react::typedConstants<JS::NativeReactNativeStaticServer::Constants>({
      .CRASHED = @"CRASHED",
      .IS_MAC_CATALYST = true,
      .LAUNCHED = @"LAUNCHED",
      .TERMINATED = @"TERMINATED",
  });
}

- (facebook::react::ModuleConstants<JS::NativeReactNativeStaticServer::Constants>)getConstants {
  return [self constantsToExport];
}

- (void)addListener:(NSString *)eventName {
}

- (void)removeListeners:(double)count {
}

- (void)getActiveServerId:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject {
  resolve([NSNull null]);
}

- (void)start:(double)serverId
   configPath:(NSString *)configPath
   errlogPath:(NSString *)errlogPath
      resolve:(RCTPromiseResolveBlock)resolve
       reject:(RCTPromiseRejectBlock)reject {
  reject(@"E_UNAVAILABLE", @"Local HLS server is not supported on Mac Catalyst", nil);
}

- (void)getLocalIpAddress:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject {
  resolve(@"127.0.0.1");
}

- (void)getOpenPort:(NSString *)address
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject {
  resolve(@(0));
}

- (void)stop:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  resolve([NSNull null]);
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeReactNativeStaticServerSpecJSI>(params);
}

@end

#endif
