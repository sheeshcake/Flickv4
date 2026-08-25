#if TARGET_OS_MACCATALYST
/**
 * JitsiWebRTC.xcframework has ios / ios-simulator / macos slices, but no
 * Mac Catalyst (ios-macabi) slice. Compile this stub instead of the real
 * WebRTC iOS sources so the app links and `NativeModules.WebRTCModule`
 * exists. Watch-party camera is unavailable on Mac.
 */

#import <React/RCTEventEmitter.h>
#import <React/RCTViewManager.h>
#import <UIKit/UIKit.h>

@interface WebRTCModule : RCTEventEmitter <RCTBridgeModule>
@end

@implementation WebRTCModule

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (NSArray<NSString *> *)supportedEvents {
  return @[
    @"peerConnectionSignalingStateChanged",
    @"peerConnectionStateChanged",
    @"peerConnectionOnRenegotiationNeeded",
    @"peerConnectionIceConnectionChanged",
    @"peerConnectionIceGatheringChanged",
    @"peerConnectionGotICECandidate",
    @"peerConnectionDidOpenDataChannel",
    @"peerConnectionOnRemoveTrack",
    @"peerConnectionOnTrack",
    @"dataChannelStateChanged",
    @"dataChannelReceiveMessage",
    @"dataChannelDidChangeBufferedAmount",
    @"mediaStreamTrackMuteChanged",
    @"mediaStreamTrackEnded",
  ];
}

@end

@interface RTCVideoViewManager : RCTViewManager
@end

@implementation RTCVideoViewManager

RCT_EXPORT_MODULE();

- (UIView *)view {
  return [UIView new];
}

@end

#endif
