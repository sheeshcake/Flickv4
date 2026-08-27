#if TARGET_OS_MACCATALYST
/**
 * JitsiWebRTC.xcframework has no Mac Catalyst (ios-macabi) slice, so the real
 * react-native-webrtc iOS sources cannot link. This module still implements
 * AVFoundation permission + capture so TCC shows Flick under Camera /
 * Microphone, local preview works, and Join camera does not no-op.
 *
 * Peer connections stay unavailable (no WebRTC binary).
 */

#import <AVFoundation/AVFoundation.h>
#import <React/RCTBridge.h>
#import <React/RCTEventEmitter.h>
#import <React/RCTViewManager.h>
#import <UIKit/UIKit.h>

@class WebRTCModule;

#pragma mark - Capture controller

@class RTCVideoView;

@interface FlickCatalystCapture : NSObject
@property(nonatomic, weak) WebRTCModule *module;
@property(nonatomic, strong) AVCaptureSession *session;
@property(nonatomic, strong) AVCaptureDeviceInput *videoInput;
@property(nonatomic, strong) AVCaptureDeviceInput *audioInput;
@property(nonatomic, copy) NSString *streamId;
@property(nonatomic, copy) NSString *videoTrackId;
@property(nonatomic, copy) NSString *audioTrackId;
@property(nonatomic, assign) BOOL videoEnabled;
@property(nonatomic, assign) BOOL audioEnabled;
- (AVCaptureDevice *)deviceForMediaType:(AVMediaType)mediaType;
- (BOOL)startWithVideo:(BOOL)video audio:(BOOL)audio error:(NSError **)error;
- (void)setTrackId:(NSString *)trackId enabled:(BOOL)enabled;
- (void)releaseTrack:(NSString *)trackId;
- (void)stop;
- (void)addView:(RTCVideoView *)view;
- (void)syncViews;
@end

#pragma mark - Preview view

@interface RTCVideoView : UIView
@property(nonatomic, copy) NSString *streamURL;
@property(nonatomic, assign) BOOL mirror;
@property(nonatomic, copy) NSString *objectFit;
@property(nonatomic, assign) NSInteger zOrder;
@property(nonatomic, weak) FlickCatalystCapture *capture;
@property(nonatomic, strong) AVCaptureVideoPreviewLayer *previewLayer;
- (void)syncPreview;
@end

@implementation RTCVideoView

- (instancetype)initWithFrame:(CGRect)frame {
  if (self = [super initWithFrame:frame]) {
    self.clipsToBounds = YES;
    self.backgroundColor = [UIColor blackColor];
    _objectFit = @"cover";
  }
  return self;
}

- (void)layoutSubviews {
  [super layoutSubviews];
  self.previewLayer.frame = self.bounds;
}

- (void)setMirror:(BOOL)mirror {
  _mirror = mirror;
  [self applyMirror];
}

- (void)setObjectFit:(NSString *)objectFit {
  _objectFit = [objectFit copy] ?: @"cover";
  self.previewLayer.videoGravity = [self.objectFit isEqualToString:@"contain"]
                                       ? AVLayerVideoGravityResizeAspect
                                       : AVLayerVideoGravityResizeAspectFill;
}

- (void)setStreamURL:(NSString *)streamURL {
  _streamURL = [streamURL copy];
  [self syncPreview];
}

- (void)applyMirror {
  self.previewLayer.affineTransform =
      self.mirror ? CGAffineTransformMakeScale(-1.0, 1.0) : CGAffineTransformIdentity;
}

- (void)syncPreview {
  AVCaptureSession *session = self.capture.session;
  BOOL show = self.streamURL.length > 0 && session != nil &&
              [self.streamURL isEqualToString:self.capture.streamId] &&
              self.capture.videoEnabled && self.capture.videoInput != nil;
  if (!show) {
    [self.previewLayer removeFromSuperlayer];
    self.previewLayer = nil;
    return;
  }
  if (!self.previewLayer) {
    self.previewLayer = [AVCaptureVideoPreviewLayer layerWithSession:session];
    self.previewLayer.videoGravity = [self.objectFit isEqualToString:@"contain"]
                                         ? AVLayerVideoGravityResizeAspect
                                         : AVLayerVideoGravityResizeAspectFill;
    [self.layer addSublayer:self.previewLayer];
  } else if (self.previewLayer.session != session) {
    self.previewLayer.session = session;
  }
  self.previewLayer.frame = self.bounds;
  [self applyMirror];
}

@end

#pragma mark - Capture implementation

@implementation FlickCatalystCapture {
  dispatch_queue_t _queue;
  NSHashTable<RTCVideoView *> *_views;
}

- (instancetype)init {
  if (self = [super init]) {
    _queue = dispatch_queue_create("com.wfrdee.flick.catalyst-capture", DISPATCH_QUEUE_SERIAL);
    _views = [NSHashTable weakObjectsHashTable];
    _videoEnabled = YES;
    _audioEnabled = YES;
  }
  return self;
}

- (void)addView:(RTCVideoView *)view {
  dispatch_async(dispatch_get_main_queue(), ^{
    [self->_views addObject:view];
    view.capture = self;
    [view syncPreview];
  });
}

- (void)syncViews {
  dispatch_async(dispatch_get_main_queue(), ^{
    for (RTCVideoView *view in self->_views) {
      view.capture = self;
      [view syncPreview];
    }
  });
}

- (AVCaptureDevice *)deviceForMediaType:(AVMediaType)mediaType {
  return [AVCaptureDevice defaultDeviceWithMediaType:mediaType];
}

- (BOOL)startWithVideo:(BOOL)video audio:(BOOL)audio error:(NSError **)error {
  __block BOOL ok = NO;
  __block NSError *localError = nil;
  dispatch_sync(_queue, ^{
    [self stopLocked];

    AVCaptureSession *session = [[AVCaptureSession alloc] init];
    [session beginConfiguration];
    if ([session canSetSessionPreset:AVCaptureSessionPreset640x480]) {
      session.sessionPreset = AVCaptureSessionPreset640x480;
    }

    if (video) {
      AVCaptureDevice *cam = [self deviceForMediaType:AVMediaTypeVideo];
      if (!cam) {
        localError = [NSError errorWithDomain:@"FlickCapture"
                                         code:1
                                     userInfo:@{NSLocalizedDescriptionKey : @"No camera found."}];
        [session commitConfiguration];
        return;
      }
      NSError *inputError = nil;
      AVCaptureDeviceInput *input = [AVCaptureDeviceInput deviceInputWithDevice:cam error:&inputError];
      if (!input || ![session canAddInput:input]) {
        localError = inputError ?: [NSError errorWithDomain:@"FlickCapture"
                                                       code:2
                                                   userInfo:@{
                                                     NSLocalizedDescriptionKey : @"Could not open camera."
                                                   }];
        [session commitConfiguration];
        return;
      }
      [session addInput:input];
      self.videoInput = input;
    }

    if (audio) {
      AVCaptureDevice *mic = [self deviceForMediaType:AVMediaTypeAudio];
      if (mic) {
        NSError *inputError = nil;
        AVCaptureDeviceInput *input = [AVCaptureDeviceInput deviceInputWithDevice:mic error:&inputError];
        if (input && [session canAddInput:input]) {
          [session addInput:input];
          self.audioInput = input;
        }
      }
    }

    [session commitConfiguration];
    self.session = session;
    self.videoEnabled = video && self.videoInput != nil;
    self.audioEnabled = audio && self.audioInput != nil;
    [session startRunning];
    ok = session.isRunning || self.videoInput != nil || self.audioInput != nil;
    if (!ok) {
      localError = [NSError errorWithDomain:@"FlickCapture"
                                       code:3
                                   userInfo:@{NSLocalizedDescriptionKey : @"Capture session failed to start."}];
      [self stopLocked];
    }
  });
  if (!ok && error) {
    *error = localError;
  }
  [self syncViews];
  return ok;
}

- (void)setTrackEnabledLocked:(BOOL)enabled input:(AVCaptureDeviceInput *)input {
  if (!self.session || !input) {
    return;
  }
  [self.session beginConfiguration];
  if (enabled) {
    if (![self.session.inputs containsObject:input] && [self.session canAddInput:input]) {
      [self.session addInput:input];
    }
  } else if ([self.session.inputs containsObject:input]) {
    [self.session removeInput:input];
  }
  [self.session commitConfiguration];
  BOOL any = self.session.inputs.count > 0;
  if (any && !self.session.isRunning) {
    [self.session startRunning];
  } else if (!any && self.session.isRunning) {
    [self.session stopRunning];
  }
}

- (void)setTrackId:(NSString *)trackId enabled:(BOOL)enabled {
  dispatch_sync(_queue, ^{
    if ([trackId isEqualToString:self.videoTrackId]) {
      self.videoEnabled = enabled;
      [self setTrackEnabledLocked:enabled input:self.videoInput];
    } else if ([trackId isEqualToString:self.audioTrackId]) {
      self.audioEnabled = enabled;
      [self setTrackEnabledLocked:enabled input:self.audioInput];
    }
  });
  [self syncViews];
}

- (void)releaseTrack:(NSString *)trackId {
  [self setTrackId:trackId enabled:NO];
  dispatch_sync(_queue, ^{
    if ([trackId isEqualToString:self.videoTrackId]) {
      self.videoTrackId = nil;
      self.videoInput = nil;
    } else if ([trackId isEqualToString:self.audioTrackId]) {
      self.audioTrackId = nil;
      self.audioInput = nil;
    }
    if (!self.videoTrackId && !self.audioTrackId) {
      [self stopLocked];
    }
  });
  [self syncViews];
}

- (void)stopLocked {
  if (self.session.isRunning) {
    [self.session stopRunning];
  }
  if (self.session) {
    [self.session beginConfiguration];
    NSArray *inputs = [self.session.inputs copy];
    for (AVCaptureInput *input in inputs) {
      [self.session removeInput:input];
    }
    [self.session commitConfiguration];
  }
  self.session = nil;
  self.videoInput = nil;
  self.audioInput = nil;
  self.streamId = nil;
  self.videoTrackId = nil;
  self.audioTrackId = nil;
}

- (void)stop {
  dispatch_sync(_queue, ^{
    [self stopLocked];
  });
  [self syncViews];
}

@end

#pragma mark - WebRTCModule

@interface WebRTCModule : RCTEventEmitter <RCTBridgeModule>
@property(nonatomic, strong) FlickCatalystCapture *capture;
@end

@implementation WebRTCModule

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (instancetype)init {
  if (self = [super init]) {
    _capture = [[FlickCatalystCapture alloc] init];
    _capture.module = self;
  }
  return self;
}

- (void)dealloc {
  [_capture stop];
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

- (AVMediaType)avMediaType:(NSString *)mediaType {
  if ([mediaType isEqualToString:@"microphone"]) {
    return AVMediaTypeAudio;
  }
  if ([mediaType isEqualToString:@"camera"]) {
    return AVMediaTypeVideo;
  }
  return nil;
}

RCT_EXPORT_METHOD(checkPermission
                  : (NSString *)mediaType resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  AVMediaType type = [self avMediaType:mediaType];
  if (!type) {
    reject(@"invalid_type", @"Invalid media type", nil);
    return;
  }
  AVAuthorizationStatus status = [AVCaptureDevice authorizationStatusForMediaType:type];
  switch (status) {
    case AVAuthorizationStatusAuthorized:
      resolve(@"granted");
      break;
    case AVAuthorizationStatusNotDetermined:
      resolve(@"prompt");
      break;
    default:
      resolve(@"denied");
      break;
  }
}

RCT_EXPORT_METHOD(requestPermission
                  : (NSString *)mediaType resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  AVMediaType type = [self avMediaType:mediaType];
  if (!type) {
    reject(@"invalid_type", @"Invalid media type", nil);
    return;
  }
  [AVCaptureDevice requestAccessForMediaType:type
                           completionHandler:^(BOOL granted) {
                             resolve(@(granted));
                           }];
}

RCT_EXPORT_METHOD(getUserMedia
                  : (NSDictionary *)constraints successCallback
                  : (RCTResponseSenderBlock)successCallback errorCallback
                  : (RCTResponseSenderBlock)errorCallback) {
  BOOL wantAudio = constraints[@"audio"] != nil && constraints[@"audio"] != [NSNull null] &&
                   ![constraints[@"audio"] isEqual:@NO];
  BOOL wantVideo = constraints[@"video"] != nil && constraints[@"video"] != [NSNull null] &&
                   ![constraints[@"video"] isEqual:@NO];
  if (!wantAudio && !wantVideo) {
    errorCallback(@[ @"TypeError", @"audio and/or video is required" ]);
    return;
  }

  NSError *error = nil;
  if (![self.capture startWithVideo:wantVideo audio:wantAudio error:&error]) {
    errorCallback(@[ @"AbortError", error.localizedDescription ?: @"Could not start capture." ]);
    return;
  }

  NSString *streamId = [[NSUUID UUID] UUIDString];
  self.capture.streamId = streamId;
  NSMutableArray *tracks = [NSMutableArray array];

  if (wantVideo && self.capture.videoInput) {
    NSString *trackId = [[NSUUID UUID] UUIDString];
    self.capture.videoTrackId = trackId;
    AVCaptureDevice *device = self.capture.videoInput.device;
    [tracks addObject:@{
      @"enabled" : @YES,
      @"id" : trackId,
      @"kind" : @"video",
      @"readyState" : @"live",
      @"remote" : @NO,
      @"settings" : @{
        @"deviceId" : device.uniqueID ?: @"camera",
        @"groupId" : @"",
        @"width" : @640,
        @"height" : @480,
        @"frameRate" : @24,
        @"facingMode" : @"user",
      }
    }];
  }

  if (wantAudio) {
    NSString *trackId = [[NSUUID UUID] UUIDString];
    self.capture.audioTrackId = trackId;
    AVCaptureDevice *device = self.capture.audioInput.device;
    [tracks addObject:@{
      @"enabled" : @YES,
      @"id" : trackId,
      @"kind" : @"audio",
      @"readyState" : @"live",
      @"remote" : @NO,
      @"settings" : @{
        @"deviceId" : device.uniqueID ?: @"audio",
        @"groupId" : @"",
      }
    }];
  }

  if (tracks.count == 0) {
    [self.capture stop];
    errorCallback(@[ @"AbortError", @"No camera or microphone available." ]);
    return;
  }

  [self.capture syncViews];
  successCallback(@[ streamId, tracks ]);
}

RCT_EXPORT_METHOD(enumerateDevices : (RCTResponseSenderBlock)callback) {
  NSMutableArray *devices = [NSMutableArray array];
  AVCaptureDevice *cam = [self.capture deviceForMediaType:AVMediaTypeVideo];
  if (cam.uniqueID) {
    [devices addObject:@{
      @"deviceId" : cam.uniqueID,
      @"groupId" : @"",
      @"kind" : @"videoinput",
      @"label" : cam.localizedName ?: @"Camera",
      @"facing" : @"front",
    }];
  }
  AVCaptureDevice *mic = [self.capture deviceForMediaType:AVMediaTypeAudio];
  if (mic.uniqueID) {
    [devices addObject:@{
      @"deviceId" : mic.uniqueID,
      @"groupId" : @"",
      @"kind" : @"audioinput",
      @"label" : mic.localizedName ?: @"Microphone",
    }];
  }
  callback(@[ devices ]);
}

RCT_EXPORT_METHOD(mediaStreamCreate : (nonnull NSString *)streamID) {
}

RCT_EXPORT_METHOD(mediaStreamAddTrack
                  : (nonnull NSString *)streamID
                  : (nonnull NSNumber *)pcId
                  : (nonnull NSString *)trackID) {
}

RCT_EXPORT_METHOD(mediaStreamRemoveTrack
                  : (nonnull NSString *)streamID
                  : (nonnull NSNumber *)pcId
                  : (nonnull NSString *)trackID) {
}

RCT_EXPORT_METHOD(mediaStreamRelease : (nonnull NSString *)streamID) {
  if ([streamID isEqualToString:self.capture.streamId]) {
    [self.capture stop];
  }
}

RCT_EXPORT_METHOD(mediaStreamTrackRelease : (nonnull NSString *)trackID) {
  [self.capture releaseTrack:trackID];
}

RCT_EXPORT_METHOD(mediaStreamTrackSetEnabled
                  : (nonnull NSNumber *)pcId
                  : (nonnull NSString *)trackID
                  : (BOOL)enabled) {
  [self.capture setTrackId:trackID enabled:enabled];
}

RCT_EXPORT_METHOD(mediaStreamTrackApplyConstraints
                  : (nonnull NSString *)trackID
                  : (NSDictionary *)constraints
                  resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  resolve(@{});
}

RCT_EXPORT_METHOD(mediaStreamTrackSetVolume
                  : (nonnull NSNumber *)pcId
                  : (nonnull NSString *)trackID
                  : (double)volume) {
}

RCT_EXPORT_METHOD(mediaStreamTrackSetVideoEffects
                  : (nonnull NSString *)trackID names
                  : (nonnull NSArray<NSString *> *)names) {
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(peerConnectionInit
                                       : (id)configuration objectID
                                       : (nonnull NSNumber *)objectID) {
  return @NO;
}

RCT_EXPORT_METHOD(peerConnectionClose : (nonnull NSNumber *)objectID) {
}

RCT_EXPORT_METHOD(peerConnectionDispose : (nonnull NSNumber *)objectID) {
}

@end

#pragma mark - RTCVideoViewManager

@interface RTCVideoViewManager : RCTViewManager
@end

@implementation RTCVideoViewManager

RCT_EXPORT_MODULE();

- (UIView *)view {
  RTCVideoView *view = [[RTCVideoView alloc] init];
  WebRTCModule *module = [self.bridge moduleForName:@"WebRTCModule"];
  if ([module isKindOfClass:[WebRTCModule class]]) {
    [module.capture addView:view];
  }
  return view;
}

- (dispatch_queue_t)methodQueue {
  return dispatch_get_main_queue();
}

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

RCT_EXPORT_VIEW_PROPERTY(mirror, BOOL)
RCT_EXPORT_VIEW_PROPERTY(streamURL, NSString)
RCT_EXPORT_VIEW_PROPERTY(objectFit, NSString)
RCT_EXPORT_VIEW_PROPERTY(zOrder, NSInteger)

@end

#endif
