import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { WATCH_PARTY_CONFIG } from '@/src/config/env';
import {
  WatchPartyClient,
  wsUrlToHttpOrigin,
} from '@/src/party/WatchPartyClient';
import type {
  ClientMessage,
  PartyChatLine,
  PartyClientKind,
  PartyClock,
  PartyContent,
  PartyRole,
  PartyRoom,
  ServerMessage,
} from '@/src/party/protocol';
import { companionPathForCode } from '@/src/party/protocol';
import { getPartyHostKey, savePartyHostKey } from '@/src/party/hostKeys';
import {
  deviceDisplayName,
  getPartyDisplayName,
  savePartyDisplayName,
} from '@/src/party/displayName';
import { usePartyRtc, type PartyRtcApi } from '@/src/hooks/usePartyRtc';

type Listener = (msg: ServerMessage) => void;

const idleRtc: PartyRtcApi = {
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

interface WatchPartyContextValue {
  enabled: boolean;
  connected: boolean;
  room: PartyRoom | null;
  memberId: string | null;
  role: PartyRole | null;
  error: string | null;
  companionUrl: string | null;
  displayName: string;
  setDisplayName: (next: string) => Promise<string>;
  chat: PartyChatLine[];
  rtc: PartyRtcApi;
  joinNotice: string | null;
  createRoom: (
    content: PartyContent,
    clock?: PartyClock,
    password?: string,
  ) => Promise<PartyRoom>;
  joinRoom: (
    code: string,
    kind?: PartyClientKind,
    password?: string,
  ) => Promise<PartyRoom>;
  leaveRoom: () => void;
  send: (msg: ClientMessage) => void;
  subscribe: (listener: Listener) => () => void;
}

const WatchPartyContext = createContext<WatchPartyContextValue>({
  enabled: false,
  connected: false,
  room: null,
  memberId: null,
  role: null,
  error: null,
  companionUrl: null,
  displayName: 'Flick user',
  setDisplayName: async () => 'Flick user',
  chat: [],
  rtc: idleRtc,
  joinNotice: null,
  createRoom: async () => {
    throw new Error('Watch party is not configured');
  },
  joinRoom: async () => {
    throw new Error('Watch party is not configured');
  },
  leaveRoom: () => {},
  send: () => {},
  subscribe: () => () => {},
});

export const WatchPartyProvider = ({ children }: { children: ReactNode }) => {
  const enabled = WATCH_PARTY_CONFIG.enabled;
  const clientRef = useRef<WatchPartyClient | null>(null);
  const listenersRef = useRef(new Set<Listener>());
  const roomRef = useRef<PartyRoom | null>(null);
  const [room, setRoom] = useState<PartyRoom | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chat, setChat] = useState<PartyChatLine[]>([]);
  const [joinNotice, setJoinNotice] = useState<string | null>(null);
  const seenMembersRef = useRef<Set<string> | null>(null);
  const rtcRef = useRef<PartyRtcApi>(idleRtc);
  roomRef.current = room;

  const [displayName, setDisplayNameState] = useState(deviceDisplayName);
  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;

  useEffect(() => {
    void getPartyDisplayName().then((name) => {
      displayNameRef.current = name;
      setDisplayNameState(name);
    });
  }, []);

  const setDisplayName = useCallback(async (next: string) => {
    const saved = await savePartyDisplayName(next);
    displayNameRef.current = saved;
    setDisplayNameState(saved);
    return saved;
  }, []);

  const role: PartyRole | null = useMemo(() => {
    if (!room || !memberId) return null;
    return room.hostId === memberId ? 'host' : 'guest';
  }, [room, memberId]);

  const companionUrl = useMemo(() => {
    if (!room || !WATCH_PARTY_CONFIG.url) return null;
    return `${wsUrlToHttpOrigin(WATCH_PARTY_CONFIG.url)}${companionPathForCode(room.code)}`;
  }, [room]);

  const ensureClient = useCallback(async () => {
    if (!WATCH_PARTY_CONFIG.url) {
      throw new Error('Set EXPO_PUBLIC_WATCH_PARTY_URL to enable watch party.');
    }
    if (!clientRef.current) {
      const client = new WatchPartyClient(WATCH_PARTY_CONFIG.url);
      client.subscribe((msg) => {
        if (msg.type === 'state') {
          setRoom(msg.room);
          if (msg.room.members.some((m) => m.id === msg.room.hostId || m.role === 'host')) {
            setError((prev) => (prev === 'Host is away' ? null : prev));
          }
        }
        if (msg.type === 'clock' && roomRef.current) {
          setRoom({ ...roomRef.current, clock: msg.clock });
        }
        if (msg.type === 'episode' && roomRef.current) {
          setRoom({
            ...roomRef.current,
            content: {
              ...roomRef.current.content,
              season: msg.season,
              episode: msg.episode,
            },
            source: null,
            embedUrl: null,
            subtitles: null,
            browsing: false,
          });
        }
        if (msg.type === 'browse' && roomRef.current) {
          setRoom({
            ...roomRef.current,
            source: null,
            embedUrl: null,
            subtitles: null,
            browsing: true,
          });
        }
        if (msg.type === 'content' && roomRef.current) {
          setRoom({
            ...roomRef.current,
            content: msg.content,
            source: null,
            embedUrl: null,
            subtitles: null,
            browsing: false,
          });
        }
        if (msg.type === 'source' && roomRef.current) {
          setRoom({
            ...roomRef.current,
            source: msg.source,
            embedUrl: msg.embedUrl,
          });
        }
        if (msg.type === 'subtitles' && roomRef.current) {
          setRoom({ ...roomRef.current, subtitles: msg.subtitles });
        }
        if (msg.type === 'chat') {
          setChat((prev) => [...prev, { from: msg.from, text: msg.text, at: msg.at }]);
        }
        if (msg.type === 'rtc-peers' && roomRef.current) {
          setRoom({ ...roomRef.current, rtcMemberIds: msg.ids });
        }
        if (msg.type === 'ended') {
          rtcRef.current.leaveCall();
          setRoom(null);
          setMemberId(null);
          setConnected(false);
          setChat([]);
          clientRef.current = null;
        }
        if (msg.type === 'error') setError(msg.message);
        for (const listener of listenersRef.current) listener(msg);
      });
      clientRef.current = client;
    }
    await clientRef.current.connect();
    setConnected(true);
    return clientRef.current;
  }, []);

  const createRoom = useCallback(
    async (content: PartyContent, clock?: PartyClock, password?: string) => {
      setError(null);
      const client = await ensureClient();
      setChat([]);
      const res = await client.create(
        displayNameRef.current,
        content,
        'player',
        clock,
        password,
      );
      if (res.hostKey) void savePartyHostKey(res.room.code, res.hostKey);
      setMemberId(res.memberId);
      setRoom(res.room);
      return res.room;
    },
    [ensureClient],
  );

  const joinRoom = useCallback(
    async (
      code: string,
      kind: PartyClientKind = 'player',
      password?: string,
    ) => {
      setError(null);
      const client = await ensureClient();
      setChat([]);
      const hostKey = (await getPartyHostKey(code)) ?? undefined;
      const res = await client.join(
        code,
        displayNameRef.current,
        kind,
        hostKey,
        password,
      );
      setMemberId(res.memberId);
      setRoom(res.room);
      return res.room;
    },
    [ensureClient],
  );

  const send = useCallback((msg: ClientMessage) => {
    clientRef.current?.send(msg);
  }, []);

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!room) {
      seenMembersRef.current = null;
      setJoinNotice(null);
      return;
    }
    const nextIds = new Set(room.members.map((m) => m.id));
    if (seenMembersRef.current == null) {
      seenMembersRef.current = nextIds;
      return;
    }
    for (const member of room.members) {
      if (!seenMembersRef.current.has(member.id) && member.id !== memberId) {
        setJoinNotice(member.displayName);
      }
    }
    seenMembersRef.current = nextIds;
  }, [memberId, room]);

  useEffect(() => {
    if (!joinNotice) return;
    const timer = setTimeout(() => setJoinNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [joinNotice]);

  const rtc = usePartyRtc({
    enabled: enabled && connected && !!room,
    memberId,
    room,
    send,
    subscribe,
  });
  rtcRef.current = rtc;

  const leaveRoom = useCallback(() => {
    rtcRef.current.leaveCall();
    clientRef.current?.send({ type: 'leave' });
    clientRef.current?.disconnect();
    clientRef.current = null;
    setRoom(null);
    setMemberId(null);
    setConnected(false);
    setChat([]);
  }, []);

  const value = useMemo(
    () => ({
      enabled,
      connected,
      room,
      memberId,
      role,
      error,
      companionUrl,
      displayName,
      setDisplayName,
      chat,
      rtc,
      joinNotice,
      createRoom,
      joinRoom,
      leaveRoom,
      send,
      subscribe,
    }),
    [
      enabled,
      connected,
      room,
      memberId,
      role,
      error,
      companionUrl,
      displayName,
      setDisplayName,
      chat,
      rtc,
      joinNotice,
      createRoom,
      joinRoom,
      leaveRoom,
      send,
      subscribe,
    ],
  );

  return (
    <WatchPartyContext.Provider value={value}>
      {children}
    </WatchPartyContext.Provider>
  );
};

export const useWatchParty = () => useContext(WatchPartyContext);
