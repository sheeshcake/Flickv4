import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as Device from 'expo-device';
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

type Listener = (msg: ServerMessage) => void;

interface WatchPartyContextValue {
  enabled: boolean;
  connected: boolean;
  room: PartyRoom | null;
  memberId: string | null;
  role: PartyRole | null;
  error: string | null;
  companionUrl: string | null;
  displayName: string;
  chat: PartyChatLine[];
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
  chat: [],
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

const deviceDisplayName = (): string => {
  const name = Device.deviceName?.trim();
  if (name) return name.slice(0, 32);
  if (Device.modelName) return Device.modelName.slice(0, 32);
  return 'Flick user';
};

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
  roomRef.current = room;

  const displayName = useMemo(() => deviceDisplayName(), []);

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
        if (msg.type === 'ended') {
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
        displayName,
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
    [displayName, ensureClient],
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
      const res = await client.join(code, displayName, kind, hostKey, password);
      setMemberId(res.memberId);
      setRoom(res.room);
      return res.room;
    },
    [displayName, ensureClient],
  );

  const leaveRoom = useCallback(() => {
    clientRef.current?.send({ type: 'leave' });
    clientRef.current?.disconnect();
    clientRef.current = null;
    setRoom(null);
    setMemberId(null);
    setConnected(false);
    setChat([]);
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    clientRef.current?.send(msg);
  }, []);

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
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
      chat,
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
      chat,
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
