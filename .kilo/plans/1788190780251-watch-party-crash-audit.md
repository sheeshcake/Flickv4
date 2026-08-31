# Watch Party Crash Audit — Mobile (iOS/Android) & macOS (Catalyst)

## Goal
Identify and fix the root causes of crashes / freezes that occur specifically on
mobile and macOS **during Watch Party sessions**, and harden the feature for
stability across these platforms. This is an audit + implementation plan; an
implementation-capable agent should execute the ordered tasks below.

## Architecture recap (evidence base)
- Transport: raw `WebSocket` (`src/party/WatchPartyClient.ts`). Server authoritative
  (`party-server/server.mjs`, in-memory `rooms` Map).
- State: single React Context provider (`src/hooks/useWatchParty.tsx`), no Zustand/Redux.
- Playback sync: host heartbeat every 2s + explicit play/pause/seek; guests reconcile
  via `predictedHostTime` and `videoRef.seek` (`src/components/player/PlayerCore.tsx`
  1000-1034). Player is `react-native-video` v6.
- Camera call: WebRTC. Mobile uses `react-native-webrtc`; macOS Catalyst uses a native
  WKWebView-based shim (`macos/stubs/FlickMacRtc.m`, `src/native/FlickMacRtc.ts`) because
  JitsiWebRTC has no Catalyst slice. Signaling relayed over the same WebSocket
  (`src/hooks/usePartyRtc.ts`).

---

## Root causes (prioritized)

### RC-1 — [Mobile, CRITICAL] Use-after-close of native `RTCPeerConnection` across `await` boundaries
`src/hooks/usePartyRtc.ts`
- `handleSignal` (408-499) awaits native async ops (`setRemoteDescription`,
  `createAnswer`, `addIceCandidate`) but a concurrent `syncPeers` (388-406) →
  `closePeer` (142-150) → `teardownPc` (125-140) can call `pc.close()` and delete the
  peer **between awaits**. The continuation then calls methods on a closed PC.
  `react-native-webrtc` forwards these to native libwebrtc, where operating on a closed
  peer can hard-crash the app instead of throwing catchable JS.
- `flushIce` (183-210) loops `await pc.addIceCandidate(...)` without re-checking that the
  peer is still live/open after each await.
- Recovery/glare: `recoverPeer`/`offerTo` (299-385) can create a new PC or issue an ICE
  restart while an in-flight `handleSignal` still references the old PC. An `answer`
  arriving in a non-`have-local-offer` signaling state throws → caught → triggers
  `recoverPeerRef.current(from)` again → recover loop / churn.
- The `onconnectionstatechange` handler (274-293) already wraps in try/catch and checks
  `peersRef.current.get(peerId) !== pc`; that pattern is missing from the async signal path.

**Why platform-specific:** native WebRTC lifecycle crashes only manifest where the native
module runs (iOS/Android). Web is excluded (`available` false at 92); TV excluded.

### RC-2 — [macOS Catalyst, CRITICAL] Singleton WKWebView reparent thrash & lifecycle
`macos/stubs/FlickMacRtc.m`
- One process-global engine + one shared `WKWebView` (161-168). `FlickMacRtcView`
  re-attaches it from **both** `layoutSubviews` and `didMoveToWindow` (491-501), i.e. on
  every layout pass, performing `removeFromSuperview`/`addSubview` on the main thread
  during layout.
- `attachToView` (265-280) and `ensureInWindow` (244-263) can both parent the same webView
  into different superviews (call overlay vs key window), racing on the main queue.
- Reparenting a WKWebView that is actively running `getUserMedia`/`RTCPeerConnection`
  during layout is a strong crash / media-teardown vector on Catalyst. Overlay show/hide
  and drawer open/close each retrigger layout.
- The webView + JS peer state is never destroyed between sessions (only `leave()` stops
  tracks), so a second party reuses global state; `emitter` is `weak` (150) and set in
  `-init` (377-382) — safe but fragile across reloads.

### RC-3 — [Both, HIGH] No WebSocket keepalive or reconnect → backgrounding reads as a crash
`src/party/WatchPartyClient.ts`
- No ping/pong; no reconnect/backoff. On unexpected close it synthesizes
  `{type:'ended'}` (63-71), and `useWatchParty` then nulls `clientRef` and tears the room
  down (211-218). Server likewise has no ping — only a 60s idle sweep
  (`party-server/server.mjs` ~2409).
- iOS/Android suspend sockets on background; on resume the socket is dead/half-open and the
  session silently ends or freezes — reported by users as a "crash on mobile". A macOS app
  nap / sleep produces the same.

### RC-4 — [Both, HIGH] Host heartbeat mutates room every 2s → whole-app re-render + GC pressure
`src/hooks/useWatchParty.tsx` 159-161: each `clock` message does
`setRoom({ ...roomRef.current, clock })`. `clock` arrives every 2s (host heartbeat,
`PlayerCore.tsx` 1000-1010). Because `clock` is stored inside `room`, the context `value`
useMemo (329-368) recomputes and the **entire provider subtree re-renders every 2s** for
the whole session, on every platform. Combined with the 250ms `getStats` loop
(`usePartyRtc.ts` 669-701) running `pc.getStats()` per peer, this creates sustained
CPU/allocation churn → on low-end Android this surfaces as ANR/OOM, on macOS as beachball/
memory growth during long sessions.

### RC-5 — [Mobile, MEDIUM] Released `MediaStream` rendered by `RTCView`
`usePartyRtc.ts` teardown clears `remoteStreamsRef` (139, 161) and `PartyCallOverlay.tsx`
renders `RTCView streamURL={remote.streamURL}` (45-52). `closePeer` drops the remote
synchronously so the window is small, but any path that stops a stream while a remote
tile is still in state can hand a dangling native stream URL to `RTCView` → Android render
crash. Also the 2s provider re-render (RC-4) recreates the `rtc` object and re-runs
`usePartyRtc`, increasing the chance of tile churn.

### RC-6 — [Both, MEDIUM] Single-slot request/response correlation
`WatchPartyClient.ts` `pending` is a single object (18-22, 132-156). Overlapping
`create`/`join`/reconnect requests clobber each other; a late `error` frame rejects an
unrelated pending promise. Rare today, but reconnect logic (RC-3) will make overlap common.

### RC-7 — [macOS, INVESTIGATE] Media pipeline contention
Catalyst runs AVPlayer HLS decode (react-native-video) **and** a WKWebView doing
`getUserMedia`/WebRTC decode simultaneously. VideoToolbox/session contention is a plausible
secondary crash source once RC-2 is fixed. Validate with Instruments before deep changes.

---

## Implementation tasks (ordered)

1. **RC-1 Guard native PC lifecycle (highest impact).** In `src/hooks/usePartyRtc.ts`:
   - Add a per-peer generation counter (`Map<string, number>`). Capture `gen` at the start
     of `handleSignal`/`offerTo`/`recoverPeer`; after each `await`, bail if
     `peersRef.current.get(id) !== pc` or the peer's `gen` changed or `pc` is closed
     (`pc.connectionState === 'closed'` / `signalingState === 'closed'`).
   - In `flushIce` (183-210) re-check `pc` liveness before each `addIceCandidate`.
   - Before `createAnswer`/`setLocalDescription`, verify `signalingState` is the expected
     value; on mismatch, drop instead of proceeding (avoid recover loop).
   - Serialize signaling per peer (a small per-peer promise chain / async queue) so
     offer/answer/ice never interleave for the same peer.
   - Add a max recovery attempt window (already partially via `iceRestartedRef`) and a
     cool-down so `failed` → recover cannot tight-loop.
   - Apply the same `pc === peersRef.current.get(id)` re-check pattern used in
     `onconnectionstatechange` (274-293) to every async path.

2. **RC-2 Fix the macOS singleton WKWebView.** In `macos/stubs/FlickMacRtc.m`:
   - Do **not** call `attachToView` from `layoutSubviews`; only attach on
     `didMoveToWindow` when `self.window != nil` and only when the current superview differs
     (guard the `removeFromSuperview`/`addSubview`). Update frame on layout without
     reparenting.
   - Ensure a single `FlickMacRtcView` is mounted at a time (the overlay already renders one
     — confirm it is not remounted on every `rtc` object change from RC-4; memoize).
   - Add an explicit teardown op (destroy/reset the JS peers + optionally the webView) tied
     to `leaveCall`, so a new session starts clean.
   - Keep all UIKit mutation on the main queue (already done) but avoid main-thread
     reparent during layout.

3. **RC-3 WebSocket keepalive + reconnect.** In `src/party/WatchPartyClient.ts` +
   `src/hooks/useWatchParty.tsx` + `party-server/server.mjs`:
   - Client: send periodic app-level ping (or use WS ping) and detect missed pongs; on
     unexpected close, attempt exponential-backoff reconnect (cap attempts) instead of
     immediately dispatching `ended`. Only emit `ended` after reconnect exhaustion.
   - On reconnect, automatically re-`join` the room using the saved `code` + `hostKey`
     (`src/party/hostKeys.ts`) and current `memberId`/displayName, then resubscribe.
   - Add an `AppState` listener in the provider to force a reconnect on foreground.
   - Server: add ping/pong (or WS heartbeat) and terminate dead sockets faster than the 60s
     idle sweep; ensure re-join restores host role via `hostKey`.

4. **RC-4 Stop the 2s full-app re-render.** In `src/hooks/useWatchParty.tsx`:
   - Do not store the fast-moving `clock` inside `room` (which feeds the memoized context
     value). Expose the clock via a separate lightweight channel: a `clockRef` +
     `subscribe`-style notifier, or a second, narrowly-scoped context consumed only by
     `PlayerCore`'s guest sync. Keep `room` changes limited to membership/content/source.
   - Verify `PlayerCore.tsx` guest sync (1012-1034) reads the clock from the new channel.
   - Relax the `getStats` interval in `usePartyRtc.ts` (669-701) from 250ms to ~1000ms and
     skip it entirely while the call overlay is `hidden`.

5. **RC-5 Prevent stale-stream render.** In `usePartyRtc.ts`/`PartyCallOverlay.tsx`:
   - Ensure a remote is removed from `remotes` state **before** its underlying stream/PC is
     closed (order `dropRemote` first, then `teardownPc`), and never keep a `streamURL`
     whose stream has been released. Consider gating `RTCView` render on a "peer connected"
     flag.

6. **RC-6 Support concurrent requests.** In `WatchPartyClient.ts`: key pending requests by
   a client-generated request id echoed by the server (or a small `Map` of pending
   matchers) so overlapping create/join/reconnect don't clobber each other. Requires a
   minor server change to echo the id (or add correlation ids).

7. **RC-7 Validate media contention (macOS).** After tasks 1-6, profile a Catalyst party
   session with Instruments (VideoToolbox/GPU/memory) while both AVPlayer and the WebRTC
   webView are active. Only then decide whether to gate camera video quality or pause one
   pipeline.

---

## Risks & considerations
- Reconnect (task 3) must be idempotent with the server's member/host bookkeeping; a botched
  rejoin could duplicate members or drop host control. Coordinate client + server together.
- Moving `clock` out of `room` (task 4) touches every consumer that currently reads
  `room.clock`; audit `predictedHostTime` call sites and the companion web app is separate
  (no change needed there).
- The macOS webView teardown (task 2) must not break the mobile path — it is `#if
  TARGET_OS_MACCATALYST` only; mobile uses `react-native-webrtc` directly.
- These are native/RN source and native Obj-C changes plus a server change — an
  implementation-capable agent (not this planner) must apply them. Rebuild native for
  iOS/Android and run `bash macos/build.sh` for Catalyst.

## Validation plan
1. **RC-1:** Stress test on a physical iOS + Android device: rapid join/leave, backgrounding
   mid-negotiation, 3+ participants with forced network drops. No native crash;
   `RTCPeerConnection` ops never run on a closed PC (add temporary logging around teardown).
2. **RC-2:** On a Catalyst build, repeatedly open/close the call overlay and player drawers,
   rotate/resize the window, run two consecutive parties. WebView must not reparent on plain
   layout; no crash; second session starts clean.
3. **RC-3:** Toggle airplane mode / background the app for >30s mid-party on iOS, Android,
   and macOS; session must auto-recover (host retains control) rather than end. Kill server
   socket to confirm backoff + rejoin.
4. **RC-4:** Profile CPU + JS render counts during a 10-minute session; confirm the provider
   subtree no longer re-renders every 2s and memory is flat. Verify guest playback stays in
   sync (drift < 1.5s).
5. **RC-5:** Force a remote to leave while speaking; no render crash, tile disappears cleanly.
6. **Regression:** Full smoke of solo playback (non-party) on all platforms to ensure the
   clock-channel refactor and player changes did not affect normal playback.

## Open questions
- Do you have crash logs / stack traces (Crashlytics, Xcode Organizer, Play Console ANRs)
  to confirm which of RC-1 vs RC-2 vs RC-4 dominates in production? That would let us
  sequence effort precisely. Recommended next step: attach the top mobile and macOS crash
  signatures so we can confirm the native frames (libwebrtc vs WebKit vs AVFoundation).
