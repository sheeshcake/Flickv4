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
import { isTV } from '@/src/utils/tv';

const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export interface PartyRtcRemote {
  id: string;
  name: string;
  streamURL: string;
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
  const pendingIceRef = useRef(new Map<string, PartyRtcSignalPayload[]>());
  const mutedRef = useRef(false);
  const camOffRef = useRef(false);

  memberIdRef.current = memberId;
  roomRef.current = room;
  mutedRef.current = muted;
  camOffRef.current = camOff;

  const dropRemote = useCallback((id: string) => {
    setRemotes((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const closePeer = useCallback(
    (id: string) => {
      const pc = peersRef.current.get(id);
      if (pc) {
        pc.close();
        peersRef.current.delete(id);
      }
      pendingIceRef.current.delete(id);
      dropRemote(id);
    },
    [dropRemote],
  );

  const closeAllPeers = useCallback(() => {
    for (const id of [...peersRef.current.keys()]) closePeer(id);
  }, [closePeer]);

  const stopLocal = useCallback(() => {
    localRef.current?.getTracks().forEach((track) => track.stop());
    localRef.current = null;
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

  const flushIce = useCallback(async (id: string, pc: RTCPeerConnection) => {
    const queued = pendingIceRef.current.get(id) ?? [];
    pendingIceRef.current.delete(id);
    for (const payload of queued) {
      if (!payload.candidate) continue;
      try {
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
      pc.onicecandidate = (ev) => {
        const candidate = (
          ev as unknown as {
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
      pc.ontrack = (ev) => {
        const streams = (ev as unknown as { streams?: MediaStream[] }).streams;
        const stream = streams?.[0];
        const url = streamUrl(stream ?? null);
        if (!url) return;
        const name =
          roomRef.current?.members.find((m) => m.id === peerId)?.displayName ??
          'Guest';
        setRemotes((prev) => {
          const next = prev.filter((r) => r.id !== peerId);
          next.push({ id: peerId, name, streamURL: url });
          return next;
        });
      };
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'failed' || state === 'closed' || state === 'disconnected') {
          closePeer(peerId);
        }
      };
      return pc;
    },
    [closePeer, send],
  );

  const offerTo = useCallback(
    async (peerId: string) => {
      try {
        const pc = attachPeer(peerId);
        const offer = await pc.createOffer({});
        await pc.setLocalDescription(offer);
        const sdp = pc.localDescription?.sdp;
        if (!sdp) return;
        send({
          type: 'rtc-signal',
          to: peerId,
          payload: { type: 'offer', sdp },
        });
      } catch {
        closePeer(peerId);
      }
    },
    [attachPeer, closePeer, send],
  );

  const syncPeers = useCallback(
    (ids: string[]) => {
      const self = memberIdRef.current;
      if (!self || !joinedRef.current) return;
      const live = new Set(ids.filter((id) => id !== self));
      for (const id of [...peersRef.current.keys()]) {
        if (!live.has(id)) closePeer(id);
      }
      for (const id of live) {
        if (peersRef.current.has(id)) continue;
        if (shouldOffer(self, id)) void offerTo(id);
      }
    },
    [closePeer, offerTo],
  );

  const handleSignal = useCallback(
    async (from: string, payload: PartyRtcSignalPayload) => {
      if (!joinedRef.current) return;
      try {
      if (payload.type === 'ice') {
        const pc = peersRef.current.get(from);
        if (!pc || !pc.remoteDescription) {
          const queued = pendingIceRef.current.get(from) ?? [];
          queued.push(payload);
          pendingIceRef.current.set(from, queued);
          return;
        }
        if (!payload.candidate) return;
        try {
          await pc.addIceCandidate(
            new RTCIceCandidate({
              candidate: payload.candidate,
              sdpMid: payload.sdpMid ?? undefined,
              sdpMLineIndex: payload.sdpMLineIndex ?? undefined,
            }),
          );
        } catch {
          // ignore
        }
        return;
      }
      if (payload.type === 'offer' && payload.sdp) {
        const pc = attachPeer(from);
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
        const pc = peersRef.current.get(from);
        if (!pc) return;
        await pc.setRemoteDescription(
          new RTCSessionDescription({ type: 'answer', sdp: payload.sdp }),
        );
        await flushIce(from, pc);
      }
      } catch {
        closePeer(from);
      }
    },
    [attachPeer, closePeer, flushIce, send],
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
      localRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = !next;
      });
      return next;
    });
  }, []);

  const toggleCam = useCallback(() => {
    setCamOff((prev) => {
      const next = !prev;
      camOffRef.current = next;
      localRef.current?.getVideoTracks().forEach((track) => {
        track.enabled = !next;
      });
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
    if (!joined) return;
    const timer = setInterval(() => {
      void (async () => {
        const levels: Record<string, number> = {};
        for (const [id, pc] of peersRef.current) {
          try {
            const stats = await pc.getStats();
            stats.forEach((report) => {
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
    if (joinedRef.current || localRef.current || peersRef.current.size) {
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
