import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PartyRtcSignalPayload,
  PartyRoom,
  ServerMessage,
} from '@/lib/party';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export interface PartyRtcRemote {
  id: string;
  name: string;
  stream: MediaStream;
}

export interface PartyRtcApi {
  joined: boolean;
  muted: boolean;
  camOff: boolean;
  localStream: MediaStream | null;
  remotes: PartyRtcRemote[];
  joinCall: () => Promise<void>;
  leaveCall: () => void;
  toggleMute: () => void;
  toggleCam: () => void;
  onMessage: (msg: ServerMessage) => void;
}

const shouldOffer = (selfId: string, peerId: string) => selfId > peerId;

export const usePartyRtc = (
  memberId: string | null,
  room: PartyRoom | null,
  send: (obj: Record<string, unknown>) => void,
): PartyRtcApi => {
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotes, setRemotes] = useState<PartyRtcRemote[]>([]);

  const joinedRef = useRef(false);
  const memberIdRef = useRef(memberId);
  const roomRef = useRef(room);
  const localRef = useRef<MediaStream | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const pendingIceRef = useRef(new Map<string, PartyRtcSignalPayload[]>());
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
    const pc = peersRef.current.get(id);
    if (pc) {
      peersRef.current.delete(id);
      pc.close();
    }
    pendingIceRef.current.delete(id);
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
    for (const id of [...peersRef.current.keys()]) closePeer(id);
    livePeerIdsRef.current = new Set();
    iceRestartedRef.current.clear();
    recoveringRef.current.clear();
  }, [closePeer]);

  const stopLocal = useCallback(() => {
    localRef.current?.getTracks().forEach((track) => track.stop());
    localRef.current = null;
    setLocalStream(null);
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
        await pc.addIceCandidate({
          candidate: payload.candidate,
          sdpMid: payload.sdpMid ?? undefined,
          sdpMLineIndex: payload.sdpMLineIndex ?? undefined,
        });
      } catch {
        // stale
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
        if (!ev.candidate?.candidate) return;
        send({
          type: 'rtc-signal',
          to: peerId,
          payload: {
            type: 'ice',
            candidate: ev.candidate.candidate,
            sdpMid: ev.candidate.sdpMid,
            sdpMLineIndex: ev.candidate.sdpMLineIndex,
          },
        });
      };
      pc.ontrack = (ev) => {
        const stream = ev.streams[0];
        if (!stream) return;
        const name =
          roomRef.current?.members.find((m) => m.id === peerId)?.displayName ??
          'Guest';
        setRemotes((prev) => {
          const next = prev.filter((r) => r.id !== peerId);
          next.push({ id: peerId, name, stream });
          return next;
        });
      };
      pc.onconnectionstatechange = () => {
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
      };
      return pc;
    },
    [closePeer, send],
  );

  const offerTo = useCallback(
    async (peerId: string, iceRestart = false) => {
      const pc = attachPeer(peerId);
      const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      await pc.setLocalDescription(offer);
      if (!pc.localDescription?.sdp) return false;
      send({
        type: 'rtc-signal',
        to: peerId,
        payload: { type: 'offer', sdp: pc.localDescription.sdp },
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
      for (const id of [...peersRef.current.keys()]) {
        if (!live.has(id)) closePeer(id);
      }
      for (const id of live) {
        if (peersRef.current.has(id)) continue;
        if (shouldOffer(self, id)) void offerTo(id).catch(() => {});
      }
    },
    [closePeer, offerTo],
  );

  const handleSignal = useCallback(
    async (from: string, payload: PartyRtcSignalPayload) => {
      if (!joinedRef.current) return;
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
          await pc.addIceCandidate({
            candidate: payload.candidate,
            sdpMid: payload.sdpMid ?? undefined,
            sdpMLineIndex: payload.sdpMLineIndex ?? undefined,
          });
        } catch {
          // ignore
        }
        return;
      }
      if (payload.type === 'offer' && payload.sdp) {
        try {
          const pc = attachPeer(from);
          await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
          await flushIce(from, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (!pc.localDescription?.sdp) return;
          send({
            type: 'rtc-signal',
            to: from,
            payload: { type: 'answer', sdp: pc.localDescription.sdp },
          });
        } catch {
          recoverPeerRef.current(from);
        }
        return;
      }
      if (payload.type === 'answer' && payload.sdp) {
        const pc = peersRef.current.get(from);
        if (!pc) return;
        try {
          await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
          await flushIce(from, pc);
        } catch {
          recoverPeerRef.current(from);
        }
      }
    },
    [attachPeer, flushIce, send],
  );

  const leaveCall = useCallback(() => {
    if (joinedRef.current) send({ type: 'rtc-leave' });
    joinedRef.current = false;
    setJoined(false);
    setMuted(false);
    setCamOff(false);
    closeAllPeers();
    stopLocal();
  }, [closeAllPeers, send, stopLocal]);

  const joinCall = useCallback(async () => {
    if (!memberIdRef.current || joinedRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: 'user', width: 480, height: 360, frameRate: 24 },
      });
      localRef.current = stream;
      applyLocalFlags(stream);
      setLocalStream(stream);
      joinedRef.current = true;
      setJoined(true);
      send({ type: 'rtc-join' });
    } catch {
      stopLocal();
    }
  }, [applyLocalFlags, send, stopLocal]);

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

  const onMessage = useCallback(
    (msg: ServerMessage) => {
      if (msg.type === 'rtc-peers') {
        syncPeers(msg.ids);
        return;
      }
      if (msg.type === 'rtc-signal') {
        void handleSignal(msg.from, msg.payload);
      }
    },
    [handleSignal, syncPeers],
  );

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

  return {
    joined,
    muted,
    camOff,
    localStream,
    remotes,
    joinCall,
    leaveCall,
    toggleMute,
    toggleCam,
    onMessage,
  };
};
