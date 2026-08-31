#if TARGET_OS_MACCATALYST
/**
 * JitsiWebRTC has no Catalyst slice, so party video uses WKWebView's
 * RTCPeerConnection + getUserMedia. Signaling stays in RN.
 */

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <React/RCTViewManager.h>
#import <WebKit/WebKit.h>
#import <UIKit/UIKit.h>

static NSString *const kFlickMacRtcIce = @"macRtcIce";
static NSString *const kFlickMacRtcTrack = @"macRtcTrack";
static NSString *const kFlickMacRtcState = @"macRtcState";

static NSString *FlickMacRtcHTML(void) {
  return @"<!DOCTYPE html><html><head><meta charset='utf-8'>"
         @"<meta name='viewport' content='width=device-width,initial-scale=1'>"
         @"<style>"
         @"html,body{margin:0;background:transparent;overflow:hidden;font-family:"
         @"-apple-system,sans-serif}"
         @"#wrap{display:flex;flex-direction:column;align-items:flex-end;gap:8px}"
         @".tile{width:80px;height:112px;border-radius:6px;overflow:hidden;"
         @"background:#1a1a1a;position:relative;border:1px solid #333}"
         @"video{width:100%;height:100%;object-fit:cover;background:#111}"
         @".label{position:absolute;bottom:0;left:0;right:0;font-size:10px;"
         @"color:#fff;background:rgba(0,0,0,.7);padding:2px 4px;white-space:nowrap;"
         @"overflow:hidden;text-overflow:ellipsis}"
         @"#localWrap.camoff video{opacity:0}"
         @"</style></head><body><div id='wrap'>"
         @"<div class='tile' id='localWrap'><video id='local' autoplay muted "
         @"playsinline></video><div class='label'>You</div></div>"
         @"</div><script>"
         @"(function(){"
         @"const peers={}; const iceQ={}; let localStream=null;"
         @"let muted=false; let camOff=false;"
         @"const stun={iceServers:[{urls:'stun:stun.l.google.com:19302'}]};"
         @"function post(msg){try{webkit.messageHandlers.rtc.postMessage(msg);}catch(e){}}"
         @"function applyFlags(){"
         @"  if(!localStream)return;"
         @"  localStream.getAudioTracks().forEach(t=>t.enabled=!muted);"
         @"  localStream.getVideoTracks().forEach(t=>t.enabled=!camOff);"
         @"  document.getElementById('localWrap').classList.toggle('camoff',camOff);"
         @"}"
         @"function ensurePeer(id){"
         @"  if(peers[id])return peers[id];"
         @"  const pc=new RTCPeerConnection(stun);"
         @"  if(localStream) localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));"
         @"  pc.onicecandidate=e=>{"
         @"    if(!e.candidate||!e.candidate.candidate)return;"
         @"    post({type:'ice',peerId:id,candidate:e.candidate.candidate,"
         @"      sdpMid:e.candidate.sdpMid,sdpMLineIndex:e.candidate.sdpMLineIndex});"
         @"  };"
         @"  pc.ontrack=e=>{"
         @"    let el=document.getElementById('r-'+id);"
         @"    if(!el){"
         @"      const tile=document.createElement('div'); tile.className='tile'; tile.id='t-'+id;"
         @"      el=document.createElement('video'); el.id='r-'+id; el.autoplay=true; el.playsInline=true;"
         @"      const lab=document.createElement('div'); lab.className='label'; lab.id='l-'+id; lab.textContent='Guest';"
         @"      tile.appendChild(el); tile.appendChild(lab);"
         @"      document.getElementById('wrap').appendChild(tile);"
         @"    }"
         @"    el.srcObject=e.streams&&e.streams[0]?e.streams[0]:new MediaStream([e.track]);"
         @"    post({type:'track',peerId:id});"
         @"  };"
         @"  pc.onconnectionstatechange=()=>post({type:'state',peerId:id,state:pc.connectionState});"
         @"  peers[id]=pc; return pc;"
         @"}"
         @"async function flushIce(id){"
         @"  const pc=peers[id]; const q=iceQ[id]||[]; iceQ[id]=[];"
         @"  if(!pc||!pc.remoteDescription)return;"
         @"  for(const c of q){ try{ await pc.addIceCandidate(c);}catch(e){} }"
         @"}"
         @"const api={"
         @"  join: async()=>{"
         @"    localStream=await navigator.mediaDevices.getUserMedia({"
         @"      audio:true, video:{facingMode:'user',width:480,height:360,frameRate:24}});"
         @"    applyFlags();"
         @"    document.getElementById('local').srcObject=localStream;"
         @"    return true;"
         @"  },"
         @"  leave: ()=>{"
         @"    Object.keys(peers).forEach(id=>api.closePeer(id));"
         @"    if(localStream){ localStream.getTracks().forEach(t=>t.stop()); localStream=null; }"
         @"    const v=document.getElementById('local'); if(v) v.srcObject=null;"
         @"    return true;"
         @"  },"
         @"  createOffer: async(id, iceRestart)=>{"
         @"    const pc=ensurePeer(id);"
         @"    const offer=await pc.createOffer(iceRestart?{iceRestart:true}:{});"
         @"    await pc.setLocalDescription(offer);"
         @"    return {type:offer.type,sdp:offer.sdp};"
         @"  },"
         @"  setRemote: async(id, type, sdp)=>{"
         @"    const pc=ensurePeer(id);"
         @"    await pc.setRemoteDescription({type,sdp});"
         @"    await flushIce(id);"
         @"    return true;"
         @"  },"
         @"  createAnswer: async(id)=>{"
         @"    const pc=ensurePeer(id);"
         @"    const answer=await pc.createAnswer();"
         @"    await pc.setLocalDescription(answer);"
         @"    return {type:answer.type,sdp:answer.sdp};"
         @"  },"
         @"  addIce: async(id, candidate, sdpMid, sdpMLineIndex)=>{"
         @"    const c={candidate,sdpMid,sdpMLineIndex};"
         @"    const pc=peers[id];"
         @"    if(!pc||!pc.remoteDescription){ (iceQ[id]=iceQ[id]||[]).push(c); return true; }"
         @"    try{ await pc.addIceCandidate(c);}catch(e){}"
         @"    return true;"
         @"  },"
         @"  closePeer: (id)=>{"
         @"    const pc=peers[id]; if(pc){ try{pc.close();}catch(e){} delete peers[id]; }"
         @"    delete iceQ[id];"
         @"    const tile=document.getElementById('t-'+id); if(tile) tile.remove();"
         @"    return true;"
         @"  },"
         @"  setMuted: (v)=>{ muted=!!v; applyFlags(); return true; },"
         @"  setCamOff: (v)=>{ camOff=!!v; applyFlags(); return true; },"
         @"  setPeerName: (id, name)=>{"
         @"    const lab=document.getElementById('l-'+id); if(lab) lab.textContent=name||'Guest';"
         @"    return true;"
         @"  }"
         @"};"
         @"window.FlickMacRtc={"
         @"  dispatch: async(msg)=>{"
         @"    try{"
         @"      const fn=api[msg.op];"
         @"      if(!fn) throw new Error('unknown op '+msg.op);"
         @"      const value=await fn.apply(null, msg.args||[]);"
         @"      post({type:'rpc',id:msg.id,ok:true,value:value});"
         @"    }catch(e){"
         @"      post({type:'rpc',id:msg.id,ok:false,value:String(e&&e.message||e)});"
         @"    }"
         @"  }"
         @"};"
         @"post({type:'ready'});"
         @"})();</script></body></html>";
}

#pragma mark - Engine

@interface FlickMacRtcEngine : NSObject <WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate>
@property(nonatomic, strong) WKWebView *webView;
@property(nonatomic, assign) BOOL ready;
@property(nonatomic, strong) NSMutableArray<void (^)(void)> *readyWaiters;
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSDictionary *> *pending;
@property(nonatomic, weak) RCTEventEmitter *emitter;
@property(nonatomic, weak) UIView *host;
- (void)attachToView:(UIView *)view;
- (void)layoutInView:(UIView *)view;
- (void)detachFromView:(UIView *)view;
- (void)callOp:(NSString *)op
          args:(NSArray *)args
      resolver:(RCTPromiseResolveBlock)resolve
      rejecter:(RCTPromiseRejectBlock)reject;
@end

@implementation FlickMacRtcEngine

+ (instancetype)shared {
  static FlickMacRtcEngine *engine;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    engine = [[FlickMacRtcEngine alloc] init];
  });
  return engine;
}

- (instancetype)init {
  if (self = [super init]) {
    _readyWaiters = [NSMutableArray array];
    _pending = [NSMutableDictionary dictionary];
    dispatch_async(dispatch_get_main_queue(), ^{
      [self setupWebView];
    });
  }
  return self;
}

static void FlickMacRtcEnableMedia(WKWebViewConfiguration *config) {
  // Catalyst WKWebView leaves getUserMedia / RTCPeerConnection off unless
  // these private preferences are enabled (Safari has them on by default).
  WKPreferences *prefs = config.preferences;
  NSDictionary *prefValues = @{
    @"mediaDevicesEnabled" : @YES,
    @"_mediaDevicesEnabled" : @YES,
    @"peerConnectionEnabled" : @YES,
    @"_peerConnectionEnabled" : @YES,
    @"getUserMediaRequiresFocus" : @NO,
    @"_getUserMediaRequiresFocus" : @NO,
    @"mediaCaptureRequiresSecureConnection" : @NO,
    @"_mediaCaptureRequiresSecureConnection" : @NO,
  };
  [prefValues enumerateKeysAndObjectsUsingBlock:^(NSString *key, id value, BOOL *stop) {
    @try {
      [prefs setValue:value forKey:key];
    } @catch (NSException *exception) {
    }
  }];
  NSDictionary *configValues = @{
    @"mediaCaptureEnabled" : @YES,
    @"_mediaCaptureEnabled" : @YES,
  };
  [configValues enumerateKeysAndObjectsUsingBlock:^(NSString *key, id value, BOOL *stop) {
    @try {
      [config setValue:value forKey:key];
    } @catch (NSException *exception) {
    }
  }];
}

- (void)setupWebView {
  if (self.webView) return;
  WKWebViewConfiguration *config = [[WKWebViewConfiguration alloc] init];
  WKUserContentController *controller = [[WKUserContentController alloc] init];
  [controller addScriptMessageHandler:self name:@"rtc"];
  config.userContentController = controller;
  config.allowsInlineMediaPlayback = YES;
  config.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeNone;
  FlickMacRtcEnableMedia(config);
  WKWebView *webView = [[WKWebView alloc] initWithFrame:CGRectZero configuration:config];
  webView.navigationDelegate = self;
  webView.UIDelegate = self;
  webView.opaque = NO;
  webView.backgroundColor = [UIColor clearColor];
  webView.scrollView.backgroundColor = [UIColor clearColor];
  webView.scrollView.scrollEnabled = NO;
  self.webView = webView;
  NSURL *base = [NSURL URLWithString:@"https://localhost/"];
  [webView loadHTMLString:FlickMacRtcHTML() baseURL:base];
}

- (void)whenReady:(void (^)(void))block {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.ready) {
      block();
      return;
    }
    [self.readyWaiters addObject:[block copy]];
  });
}

- (void)ensureInWindow {
  if (self.webView.superview) return;
  UIWindow *window = nil;
  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (![scene isKindOfClass:[UIWindowScene class]]) continue;
    UIWindowScene *ws = (UIWindowScene *)scene;
    for (UIWindow *candidate in ws.windows) {
      if (candidate.isKeyWindow) {
        window = candidate;
        break;
      }
    }
    if (!window) window = ws.windows.firstObject;
    if (window) break;
  }
  if (!window) return;
  self.webView.frame = CGRectMake(0, 0, 80, 120);
  self.webView.hidden = YES;
  [window addSubview:self.webView];
}

- (void)attachToView:(UIView *)view {
  dispatch_async(dispatch_get_main_queue(), ^{
    [self setupWebView];
    self.host = view;
    WKWebView *webView = self.webView;
    webView.hidden = NO;
    // Only reparent when the superview actually changes. Reparenting the
    // shared WKWebView on every layout pass while it is actively running
    // getUserMedia / RTCPeerConnection can tear down the media session and
    // crash on Catalyst (RC-2).
    if (webView.superview != view) {
      [webView removeFromSuperview];
      webView.frame = view.bounds;
      webView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
      [view addSubview:webView];
    }
  });
}

// Keep the webView frame in sync on layout WITHOUT reparenting. Called from
// FlickMacRtcView.layoutSubviews.
- (void)layoutInView:(UIView *)view {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.webView && self.webView.superview == view) {
      self.webView.frame = view.bounds;
    }
  });
}

// When the hosting RN view leaves the window, don't destroy the singleton (the
// call is still live) — move the webView off-screen back into the key window so
// it is never left parented to a detached view.
- (void)detachFromView:(UIView *)view {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.host == view) {
      self.host = nil;
    }
    if (self.webView && self.webView.superview == view) {
      [self.webView removeFromSuperview];
      self.webView.hidden = YES;
      [self ensureInWindow];
    }
  });
}

- (void)callOp:(NSString *)op
          args:(NSArray *)args
      resolver:(RCTPromiseResolveBlock)resolve
      rejecter:(RCTPromiseRejectBlock)reject {
  [self whenReady:^{
    [self ensureInWindow];
    NSString *reqId = [[NSUUID UUID] UUIDString];
    self.pending[reqId] = @{@"resolve" : [resolve copy], @"reject" : [reject copy]};
    NSDictionary *msg = @{@"id" : reqId, @"op" : op, @"args" : args ?: @[]};
    NSError *err = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:msg options:0 error:&err];
    if (!data || err) {
      [self.pending removeObjectForKey:reqId];
      reject(@"E_RTC", err.localizedDescription ?: @"encode failed", err);
      return;
    }
    NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    NSString *js = [NSString stringWithFormat:@"FlickMacRtc.dispatch(%@)", json];
    [self.webView evaluateJavaScript:js
                   completionHandler:^(id result, NSError *error) {
                     if (!error) return;
                     NSDictionary *cb = self.pending[reqId];
                     [self.pending removeObjectForKey:reqId];
                     RCTPromiseRejectBlock rej = cb[@"reject"];
                     if (rej) rej(@"E_RTC", error.localizedDescription, error);
                   }];
  }];
}

- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message {
  NSDictionary *body = [message.body isKindOfClass:[NSDictionary class]] ? message.body : nil;
  if (!body) return;
  NSString *type = [body[@"type"] isKindOfClass:[NSString class]] ? body[@"type"] : @"";
  if ([type isEqualToString:@"ready"]) {
    self.ready = YES;
    NSArray *waiters = [self.readyWaiters copy];
    [self.readyWaiters removeAllObjects];
    for (void (^block)(void) in waiters) {
      block();
    }
    return;
  }
  if ([type isEqualToString:@"rpc"]) {
    NSString *reqId = [body[@"id"] isKindOfClass:[NSString class]] ? body[@"id"] : nil;
    if (!reqId) return;
    NSDictionary *cb = self.pending[reqId];
    [self.pending removeObjectForKey:reqId];
    BOOL ok = [body[@"ok"] boolValue];
    id value = body[@"value"];
    if (ok) {
      RCTPromiseResolveBlock resolve = cb[@"resolve"];
      if (resolve) resolve(value == nil ? [NSNull null] : value);
    } else {
      RCTPromiseRejectBlock reject = cb[@"reject"];
      if (reject)
        reject(@"E_RTC", [value isKindOfClass:[NSString class]] ? value : @"rtc failed", nil);
    }
    return;
  }
  RCTEventEmitter *emitter = self.emitter;
  if (!emitter) return;
  if ([type isEqualToString:@"ice"]) {
    [emitter sendEventWithName:kFlickMacRtcIce body:body];
  } else if ([type isEqualToString:@"track"]) {
    [emitter sendEventWithName:kFlickMacRtcTrack body:body];
  } else if ([type isEqualToString:@"state"]) {
    [emitter sendEventWithName:kFlickMacRtcState body:body];
  }
}

- (void)webView:(WKWebView *)webView
    requestMediaCapturePermissionForOrigin:(WKSecurityOrigin *)origin
                         initiatedByFrame:(WKFrameInfo *)frame
                                     type:(WKMediaCaptureType)type
                          decisionHandler:(void (^)(WKPermissionDecision decision))decisionHandler
    API_AVAILABLE(ios(15.0)) {
  decisionHandler(WKPermissionDecisionGrant);
}

@end

#pragma mark - Module

@interface FlickMacRtc : RCTEventEmitter
@end

@implementation FlickMacRtc

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

- (instancetype)init {
  if (self = [super init]) {
    [FlickMacRtcEngine shared].emitter = self;
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents {
  return @[ kFlickMacRtcIce, kFlickMacRtcTrack, kFlickMacRtcState ];
}

RCT_EXPORT_METHOD(join : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject) {
  [[FlickMacRtcEngine shared] callOp:@"join" args:@[] resolver:resolve rejecter:reject];
}

RCT_EXPORT_METHOD(leave : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject) {
  [[FlickMacRtcEngine shared] callOp:@"leave" args:@[] resolver:resolve rejecter:reject];
}

RCT_EXPORT_METHOD(createOffer
                  : (NSString *)peerId iceRestart
                  : (BOOL)iceRestart resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  [[FlickMacRtcEngine shared] callOp:@"createOffer"
                                args:@[ peerId ?: @"", @(iceRestart) ]
                            resolver:resolve
                            rejecter:reject];
}

RCT_EXPORT_METHOD(setRemote
                  : (NSString *)peerId type
                  : (NSString *)type sdp
                  : (NSString *)sdp resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  [[FlickMacRtcEngine shared] callOp:@"setRemote"
                                args:@[ peerId ?: @"", type ?: @"", sdp ?: @"" ]
                            resolver:resolve
                            rejecter:reject];
}

RCT_EXPORT_METHOD(createAnswer
                  : (NSString *)peerId resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  [[FlickMacRtcEngine shared] callOp:@"createAnswer"
                                args:@[ peerId ?: @"" ]
                            resolver:resolve
                            rejecter:reject];
}

RCT_EXPORT_METHOD(addIce
                  : (NSString *)peerId candidate
                  : (NSString *)candidate sdpMid
                  : (id)sdpMid sdpMLineIndex
                  : (id)sdpMLineIndex resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  [[FlickMacRtcEngine shared] callOp:@"addIce"
                                args:@[
                                  peerId ?: @"",
                                  candidate ?: @"",
                                  sdpMid ?: [NSNull null],
                                  sdpMLineIndex ?: [NSNull null]
                                ]
                            resolver:resolve
                            rejecter:reject];
}

RCT_EXPORT_METHOD(closePeer
                  : (NSString *)peerId resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  [[FlickMacRtcEngine shared] callOp:@"closePeer"
                                args:@[ peerId ?: @"" ]
                            resolver:resolve
                            rejecter:reject];
}

RCT_EXPORT_METHOD(setMuted
                  : (BOOL)muted resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  [[FlickMacRtcEngine shared] callOp:@"setMuted" args:@[ @(muted) ] resolver:resolve rejecter:reject];
}

RCT_EXPORT_METHOD(setCamOff
                  : (BOOL)camOff resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  [[FlickMacRtcEngine shared] callOp:@"setCamOff" args:@[ @(camOff) ] resolver:resolve rejecter:reject];
}

RCT_EXPORT_METHOD(setPeerName
                  : (NSString *)peerId name
                  : (NSString *)name resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  [[FlickMacRtcEngine shared] callOp:@"setPeerName"
                                args:@[ peerId ?: @"", name ?: @"Guest" ]
                            resolver:resolve
                            rejecter:reject];
}

@end

#pragma mark - Grid view

@interface FlickMacRtcView : UIView
@end

@implementation FlickMacRtcView

- (void)layoutSubviews {
  [super layoutSubviews];
  // Resize only — never reparent during layout (RC-2).
  [[FlickMacRtcEngine shared] layoutInView:self];
}

- (void)didMoveToWindow {
  [super didMoveToWindow];
  if (self.window) {
    [[FlickMacRtcEngine shared] attachToView:self];
  } else {
    [[FlickMacRtcEngine shared] detachFromView:self];
  }
}

@end

@interface FlickMacRtcViewManager : RCTViewManager
@end

@implementation FlickMacRtcViewManager

RCT_EXPORT_MODULE(FlickMacRtcView)

- (UIView *)view {
  FlickMacRtcView *view = [[FlickMacRtcView alloc] init];
  view.backgroundColor = [UIColor clearColor];
  view.clipsToBounds = YES;
  return view;
}

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

- (dispatch_queue_t)methodQueue {
  return dispatch_get_main_queue();
}

@end

#endif
