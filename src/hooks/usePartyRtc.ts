import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  mediaDevices,
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
} from 'react-native-webrtc';
import type {
  ClientMessage,
  PartyRtcSignalPayload,
  PartyRoom,
  ServerMessage,
} from '@/src/party/protocol';
import { ensureCallPermissions } from '@/src/utils/callPermissions';
import { isMacCatalyst, isTV } from '@/src/utils/tv';
import { FlickMacRtc, macRtcAvailable, macRtcEmitter } from '@/src/native/FlickMacRtc';

const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const MAC_LOCAL_STREAM = 'mac-local';

export interface PartyRtcRemote {
  id: string;
  name: string;
  streamURL: string;
  renderKey: string;
  audioLevel?: number;
}

export interface PartyRtcApi {
  available: boolean;
  joined: boolean;
  muted: boolean;
  camOff: boolean;
  localStreamURL: string | null;
  remotes: PartyRtcRemote[];
  error: string | null;
  joinCall: () => Promise<void>;
  leaveCall: () => void;
  toggleMute: () => void;
  toggleCam: () => void;
}

const emptyRtc: PartyRtcApi = {
  available: false,
  joined: false,
  muted: false,
  camOff: false,
  localStreamURL: null,
  remotes: [],
  error: null,
  joinCall: async () => {},
  leaveCall: () => {},
  toggleMute: () => {},
  toggleCam: () => {},
};

type Listener = (msg: ServerMessage) => void;

interface UsePartyRtcArgs {
  enabled: boolean;
  memberId: string | null;
  room: PartyRoom | null;
  send: (msg: ClientMessage) => void;
  subscribe: (listener: Listener) => () => void;
}

type RtcTrackEvent = {
  track?: { id: string; kind: string };
  streams?: MediaStream[];
};

const streamUrl = (stream: MediaStream | null): string | null => {
  if (!stream) return null;
  const withUrl = stream as MediaStream & { toURL?: () => string };
  return typeof withUrl.toURL === 'function' ? withUrl.toURL() : null;
};

const shouldOffer = (selfId: string, peerId: string) => selfId > peerId;

export const usePartyRtc = ({
  enabled,
  memberId,
  room,
  send,
  subscribe,
}: UsePartyRtcArgs): PartyRtcApi => {
  const available = enabled && !isTV && Platform.OS !== 'web';
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [localStreamURL, setLocalStreamURL] = useState<string | null>(null);
  const [remotes, setRemotes] = useState<PartyRtcRemote[]>([]);
  const [error, setError] = useState<string | null>(null);

  const joinedRef = useRef(false);
  const memberIdRef = useRef(memberId);
  const roomRef = useRef(room);
  const localRef = useRef<MediaStream | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const macPeersRef = useRef(new Set<string>());
  const macRemoteReadyRef = useRef(new Set<string>());
  const pendingIceRef = useRef(new Map<string, PartyRtcSignalPayload[]>());
  const remoteStreamsRef = useRef(new Map<string, MediaStream>());
  const livePeerIdsRef = useRef(new Set<string>());
  const iceRestartedRef = useRef(new Set<string>());
  const recoveringRef = useRef(new Set<string>());
  const recoverPeerRef = useRef<(peerId: string) => void>(() => {});
  const mutedRef = useRef(false);
  const camOffRef = useRef(false);

  memberIdRef.current = memberId;
  roomRef.current = room;
  mutedRef.current = muted;
  camOffRef.current = camOff;

  const dropRemote = useCallback((id: string) => {
    setRemotes((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const teardownPc = useCallback((id: string) => {
    if (macRtcAvailable) {
      macPeersRef.current.delete(id);
      macRemoteReadyRef.current.delete(id);
      void FlickMacRtc?.closePeer(id).catch(() => {});
      pendingIceRef.current.delete(id);
      return;
    }
    const pc = peersRef.current.get(id);
    if (pc) {
      peersRef.current.delete(id);
      pc.close();
    }
    pendingIceRef.current.delete(id);
    remoteStreamsRef.current.delete(id);
  }, []);

  const closePeer = useCallback(
    (id: string) => {
      teardownPc(id);
      iceRestartedRef.current.delete(id);
      recoveringRef.current.delete(id);
      dropRemote(id);
    },
    [dropRemote, teardownPc],
  );

  const closeAllPeers = useCallback(() => {
    if (macRtcAvailable) {
      for (const id of [...macPeersRef.current]) closePeer(id);
    } else {
      for (const id of [...peersRef.current.keys()]) closePeer(id);
    }
    livePeerIdsRef.current = new Set();
    iceRestartedRef.current.clear();
    recoveringRef.current.clear();
    remoteStreamsRef.current.clear();
  }, [closePeer]);

  const stopLocal = useCallback(() => {
    if (macRtcAvailable) {
      void FlickMacRtc?.leave().catch(() => {});
    } else {
      localRef.current?.getTracks().forEach((track) => track.stop());
      localRef.current = null;
    }
    setLocalStreamURL(null);
  }, []);

  const applyLocalFlags = useCallback((stream: MediaStream) => {
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !mutedRef.current;
    });
    stream.getVideoTracks().forEach((track) => {
      track.enabled = !camOffRef.current;
    });
  }, []);

  const flushIce = useCallback(async (id: string, pc?: RTCPeerConnection) => {
    const queued = pendingIceRef.current.get(id) ?? [];
    pendingIceRef.current.delete(id);
    for (const payload of queued) {
      if (!payload.candidate) continue;
      try {
        if (macRtcAvailable) {
          await FlickMacRtc?.addIce(
            id,
            payload.candidate,
            payload.sdpMid ?? null,
            payload.sdpMLineIndex ?? null,
          );
          continue;
        }
        if (!pc) continue;
        await pc.addIceCandidate(
          new RTCIceCandidate({
            candidate: payload.candidate,
            sdpMid: payload.sdpMid ?? undefined,
            sdpMLineIndex: payload.sdpMLineIndex ?? undefined,
          }),
        );
      } catch {
        // stale candidate
      }
    }
  }, []);

  const attachPeer = useCallback(
    (peerId: string) => {
      if (macRtcAvailable) {
        macPeersRef.current.add(peerId);
        return null;
      }
      let pc = peersRef.current.get(peerId);
      if (pc) return pc;
      pc = new RTCPeerConnection(RTC_CONFIG);
      peersRef.current.set(peerId, pc);
      const local = localRef.current;
      if (local) {
        local.getTracks().forEach((track) => {
          pc.addTrack(track, local);
        });
      }
      pc.onicecandidate = (ev: unknown) => {
        const candidate = (
          ev as {
            candidate?: {
              candidate?: string;
              sdpMid?: string | null;
              sdpMLineIndex?: number | null;
            };
          }
        ).candidate;
        if (!candidate?.candidate) return;
        send({
          type: 'rtc-signal',
          to: peerId,
          payload: {
            type: 'ice',
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid ?? null,
            sdpMLineIndex: candidate.sdpMLineIndex ?? null,
          },
        });
      };
      pc.ontrack = (ev: unknown) => {
        const event = ev as RtcTrackEvent;
        const track = event.track;
        let stream = event.streams?.[0] ?? remoteStreamsRef.current.get(peerId);
        if (!stream) {
          stream = new MediaStream();
        }
        if (track && !stream.getTracks().some((existing) => existing.id === track.id)) {
          stream.addTrack(track as Parameters<MediaStream['addTrack']>[0]);
        }
        remoteStreamsRef.current.set(peerId, stream);
        const url = streamUrl(stream);
        if (!url) return;
        const videoId = stream.getVideoTracks()[0]?.id;
        const renderKey = videoId ? `${url}:${videoId}` : url;
        const name =
          roomRef.current?.members.find((m) => m.id === peerId)?.displayName ??
          'Guest';
        setRemotes((prev) => {
          const next = prev.filter((r) => r.id !== peerId);
          next.push({ id: peerId, name, streamURL: url, renderKey });
          return next;
        });
      };
      pc.onconnectionstatechange = () => {
        try {
          if (peersRef.current.get(peerId) !== pc) return;
          const state = pc.connectionState;
          if (state === 'connected') {
            iceRestartedRef.current.delete(peerId);
            recoveringRef.current.delete(peerId);
            return;
          }
          if (state === 'closed') {
            closePeer(peerId);
            return;
          }
          if (state === 'failed') {
            recoverPeerRef.current(peerId);
          }
        } catch {
          // Native WebRTC callbacks must not throw into the app.
        }
      };
      return pc;
    },
    [closePeer, send],
  );

  const offerTo = useCallback(
    async (peerId: string, iceRestart = false) => {
      if (macRtcAvailable) {
        attachPeer(peerId);
        const offer = await FlickMacRtc?.createOffer(peerId, iceRestart);
        const sdp = offer?.sdp;
        if (!sdp) return false;
        send({
          type: 'rtc-signal',
          to: peerId,
          payload: { type: 'offer', sdp },
        });
        return true;
      }
      const pc = attachPeer(peerId);
      if (!pc) return false;
      const offer = await pc.createOffer(
        iceRestart ? { iceRestart: true } : {},
      );
      await pc.setLocalDescription(offer);
      const sdp = pc.localDescription?.sdp;
      if (!sdp) return false;
      send({
        type: 'rtc-signal',
        to: peerId,
        payload: { type: 'offer', sdp },
      });
      return true;
    },
    [attachPeer, send],
  );

  const recoverPeer = useCallback(
    (peerId: string) => {
      if (!joinedRef.current || !livePeerIdsRef.current.has(peerId)) {
        closePeer(peerId);
        return;
      }
      if (recoveringRef.current.has(peerId)) return;
      if (iceRestartedRef.current.has(peerId)) {
        closePeer(peerId);
        return;
      }
      iceRestartedRef.current.add(peerId);
      recoveringRef.current.add(peerId);
      const self = memberIdRef.current;
      if (!self) {
        recoveringRef.current.delete(peerId);
        closePeer(peerId);
        return;
      }

      const restart = async () => {
        try {
          if (macRtcAvailable) {
            const existing = macPeersRef.current.has(peerId);
            if (existing && shouldOffer(self, peerId)) {
              try {
                if (await offerTo(peerId, true)) return;
              } catch {
                // Recreate below.
              }
            }
            teardownPc(peerId);
            if (shouldOffer(self, peerId)) await offerTo(peerId);
            return;
          }
          const existing = peersRef.current.get(peerId);
          if (existing && shouldOffer(self, peerId)) {
            try {
              if (await offerTo(peerId, true)) return;
            } catch {
              // Recreate below.
            }
          }
          teardownPc(peerId);
          if (shouldOffer(self, peerId)) await offerTo(peerId);
        } catch {
          closePeer(peerId);
        } finally {
          recoveringRef.current.delete(peerId);
        }
      };
      void restart();
    },
    [closePeer, offerTo, teardownPc],
  );
  recoverPeerRef.current = recoverPeer;

  const syncPeers = useCallback(
    (ids: string[]) => {
      const self = memberIdRef.current;
      if (!self || !joinedRef.current) return;
      const live = new Set(ids.filter((id) => id !== self));
      livePeerIdsRef.current = live;
      const attached = new Set(
        macRtcAvailable ? macPeersRef.current : peersRef.current.keys(),
      );
      for (const id of [...attached]) {
        if (!live.has(id)) closePeer(id);
      }
      for (const id of live) {
        if (attached.has(id)) continue;
        if (shouldOffer(self, id)) void offerTo(id).catch(() => {});
      }
    },
    [closePeer, offerTo],
  );

  const handleSignal = useCallback(
    async (from: string, payload: PartyRtcSignalPayload) => {
      if (!joinedRef.current) return;
      try {
        if (payload.type === 'ice') {
          const ready = macRtcAvailable
            ? macRemoteReadyRef.current.has(from)
            : Boolean(peersRef.current.get(from)?.remoteDescription);
          if (!ready) {
            const queued = pendingIceRef.current.get(from) ?? [];
            queued.push(payload);
            pendingIceRef.current.set(from, queued);
            return;
          }
          if (!payload.candidate) return;
          try {
            if (macRtcAvailable) {
              await FlickMacRtc?.addIce(
                from,
                payload.candidate,
                payload.sdpMid ?? null,
                payload.sdpMLineIndex ?? null,
              );
            } else {
              const pc = peersRef.current.get(from);
              if (!pc) return;
              await pc.addIceCandidate(
                new RTCIceCandidate({
                  candidate: payload.candidate,
                  sdpMid: payload.sdpMid ?? undefined,
                  sdpMLineIndex: payload.sdpMLineIndex ?? undefined,
                }),
              );
            }
          } catch {
            // ignore stale ICE
          }
          return;
        }
        if (payload.type === 'offer' && payload.sdp) {
          if (macRtcAvailable) {
            attachPeer(from);
            await FlickMacRtc?.setRemote(from, 'offer', payload.sdp);
            macRemoteReadyRef.current.add(from);
            await flushIce(from);
            const answer = await FlickMacRtc?.createAnswer(from);
            const sdp = answer?.sdp;
            if (!sdp) return;
            send({
              type: 'rtc-signal',
              to: from,
              payload: { type: 'answer', sdp },
            });
            return;
          }
          const pc = attachPeer(from);
          if (!pc) return;
          await pc.setRemoteDescription(
            new RTCSessionDescription({ type: 'offer', sdp: payload.sdp }),
          );
          await flushIce(from, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          const sdp = pc.localDescription?.sdp;
          if (!sdp) return;
          send({
            type: 'rtc-signal',
            to: from,
            payload: { type: 'answer', sdp },
          });
          return;
        }
        if (payload.type === 'answer' && payload.sdp) {
          if (macRtcAvailable) {
            await FlickMacRtc?.setRemote(from, 'answer', payload.sdp);
            macRemoteReadyRef.current.add(from);
            await flushIce(from);
            return;
          }
          const pc = peersRef.current.get(from);
          if (!pc) return;
          await pc.setRemoteDescription(
            new RTCSessionDescription({ type: 'answer', sdp: payload.sdp }),
          );
          await flushIce(from, pc);
        }
      } catch {
        recoverPeerRef.current(from);
      }
    },
    [attachPeer, flushIce, send],
  );

  const leaveCall = useCallback(() => {
    if (!joinedRef.current) {
      closeAllPeers();
      stopLocal();
      setJoined(false);
      return;
    }
    joinedRef.current = false;
    setJoined(false);
    setMuted(false);
    setCamOff(false);
    closeAllPeers();
    stopLocal();
    send({ type: 'rtc-leave' });
  }, [closeAllPeers, send, stopLocal]);

  const joinCall = useCallback(async () => {
    if (!available || !memberIdRef.current || joinedRef.current) return;
    setError(null);
    try {
      const allowed = await ensureCallPermissions();
      if (!allowed) {
        setError('Allow camera and microphone to join the call.');
        return;
      }
      if (macRtcAvailable) {
        await FlickMacRtc?.join();
        setLocalStreamURL(MAC_LOCAL_STREAM);
        joinedRef.current = true;
        setJoined(true);
        send({ type: 'rtc-join' });
        return;
      }
      const stream = (await mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: 'user',
          frameRate: 24,
          width: 480,
          height: 360,
        },
      })) as MediaStream;
      localRef.current = stream;
      applyLocalFlags(stream);
      setLocalStreamURL(streamUrl(stream));
      joinedRef.current = true;
      setJoined(true);
      send({ type: 'rtc-join' });
    } catch {
      stopLocal();
      setError('Allow camera and microphone to join the call.');
    }
  }, [applyLocalFlags, available, send, stopLocal]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      if (macRtcAvailable) {
        void FlickMacRtc?.setMuted(next).catch(() => {});
      } else {
        localRef.current?.getAudioTracks().forEach((track) => {
          track.enabled = !next;
        });
      }
      return next;
    });
  }, []);

  const toggleCam = useCallback(() => {
    setCamOff((prev) => {
      const next = !prev;
      camOffRef.current = next;
      if (macRtcAvailable) {
        void FlickMacRtc?.setCamOff(next).catch(() => {});
      } else {
        localRef.current?.getVideoTracks().forEach((track) => {
          track.enabled = !next;
        });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === 'rtc-peers') {
        syncPeers(msg.ids);
        return;
      }
      if (msg.type === 'rtc-signal') {
        void handleSignal(msg.from, msg.payload).catch(() => {});
      }
    });
  }, [handleSignal, subscribe, syncPeers]);

  useEffect(() => {
    if (!macRtcAvailable || !macRtcEmitter) return;
    const ice = macRtcEmitter.addListener(
      'macRtcIce',
      (body: {
        peerId?: string;
        candidate?: string;
        sdpMid?: string | null;
        sdpMLineIndex?: number | null;
      }) => {
        if (!joinedRef.current || !body.peerId || !body.candidate) return;
        send({
          type: 'rtc-signal',
          to: body.peerId,
          payload: {
            type: 'ice',
            candidate: body.candidate,
            sdpMid: body.sdpMid ?? null,
            sdpMLineIndex: body.sdpMLineIndex ?? null,
          },
        });
      },
    );
    const track = macRtcEmitter.addListener(
      'macRtcTrack',
      (body: { peerId?: string }) => {
        const peerId = body.peerId;
        if (!peerId) return;
        const name =
          roomRef.current?.members.find((m) => m.id === peerId)?.displayName ??
          'Guest';
        void FlickMacRtc?.setPeerName(peerId, name).catch(() => {});
        setRemotes((prev) => {
          if (prev.some((r) => r.id === peerId)) return prev;
          return [
            ...prev,
            {
              id: peerId,
              name,
              streamURL: `mac:${peerId}`,
              renderKey: `mac:${peerId}`,
            },
          ];
        });
      },
    );
    const state = macRtcEmitter.addListener(
      'macRtcState',
      (body: { peerId?: string; state?: string }) => {
        const peerId = body.peerId;
        if (!peerId) return;
        if (body.state === 'connected') {
          iceRestartedRef.current.delete(peerId);
          recoveringRef.current.delete(peerId);
          return;
        }
        if (body.state === 'closed') {
          closePeer(peerId);
          return;
        }
        if (body.state === 'failed') {
          recoverPeerRef.current(peerId);
        }
      },
    );
    return () => {
      ice.remove();
      track.remove();
      state.remove();
    };
  }, [closePeer, send]);

  useEffect(() => {
    if (!joined || macRtcAvailable) return;
    const timer = setInterval(() => {
      void (async () => {
        const levels: Record<string, number> = {};
        for (const [id, pc] of peersRef.current) {
          try {
            const stats = await pc.getStats();
            stats.forEach((report: unknown) => {
              const row = report as {
                type?: string;
                kind?: string;
                audioLevel?: number;
              };
              if (row.type === 'inbound-rtp' && row.kind === 'audio') {
                const level = Number(row.audioLevel ?? 0);
                levels[id] = Math.max(levels[id] ?? 0, level);
              }
            });
          } catch {
            // ignore
          }
        }
        setRemotes((prev) =>
          prev.map((remote) => ({
            ...remote,
            audioLevel: levels[remote.id] ?? 0,
          })),
        );
      })();
    }, 250);
    return () => clearInterval(timer);
  }, [joined]);

  useEffect(() => {
    if (room && memberId) return;
    if (joinedRef.current || localRef.current || peersRef.current.size || macPeersRef.current.size) {
      joinedRef.current = false;
      setJoined(false);
      setMuted(false);
      setCamOff(false);
      closeAllPeers();
      stopLocal();
    }
  }, [closeAllPeers, memberId, room, stopLocal]);

  if (!available) return emptyRtc;

  return {
    available,
    joined,
    muted,
    camOff,
    localStreamURL,
    remotes,
    error,
    joinCall,
    leaveCall,
    toggleMute,
    toggleCam,
  };
};
