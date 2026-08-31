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
import { AppState } from 'react-native';
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

const RECONNECTING_MESSAGE = 'Reconnecting…';
const MAX_RECONNECT_ATTEMPTS = 6;

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
  rejoinCall: () => {},
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

  // RC-3 reconnection state. `sessionRef` holds enough to re-join after an
  // unexpected drop; the *Ref indirections keep `ensureClient` stable while
  // still letting the socket's close hook reach the latest reconnect logic.
  const sessionRef = useRef<{ code: string; kind: PartyClientKind } | null>(
    null,
  );
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectingRef = useRef(false);
  const endSessionRef = useRef<() => void>(() => {});
  const scheduleReconnectRef = useRef<() => void>(() => {});
  const attemptReconnectRef = useRef<() => void>(() => {});

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
          // RC-4: the host emits a clock heartbeat every 2s. Calling setRoom
          // here would re-render the entire provider subtree twice a second
          // for the whole session. Nothing renders from the live context
          // clock — PlayerCore's guest sync consumes the raw `clock` message
          // via the listener fan-out below — so keep the ref fresh for any
          // late reader without triggering a render.
          roomRef.current.clock = msg.clock;
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
          // An explicit server `ended` is terminal — do not attempt to
          // reconnect (the room is gone / the host closed it).
          endSessionRef.current();
        }
        if (msg.type === 'error') setError(msg.message);
        for (const listener of listenersRef.current) listener(msg);
      });
      // RC-3: an unexpected socket close drives reconnection instead of
      // immediately tearing the room down.
      client.onUnexpectedClose = () => scheduleReconnectRef.current();
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
      sessionRef.current = { code: res.room.code, kind: 'player' };
      reconnectAttemptsRef.current = 0;
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
      sessionRef.current = { code: code.trim().toUpperCase(), kind };
      reconnectAttemptsRef.current = 0;
      setMemberId(res.memberId);
      setRoom(res.room);
      return res.room;
    },
    [ensureClient],
  );

  const send = useCallback((msg: ClientMessage) => {
    clientRef.current?.send(msg);
  }, []);

  // --- RC-3: reconnection orchestration ---------------------------------
  const endSession = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectingRef.current = false;
    reconnectAttemptsRef.current = 0;
    sessionRef.current = null;
    rtcRef.current.leaveCall();
    clientRef.current?.disconnect();
    clientRef.current = null;
    setRoom(null);
    setMemberId(null);
    setConnected(false);
    setChat([]);
  }, []);
  endSessionRef.current = endSession;

  // Terminal end: tear down AND notify subscribers so screens that eject on a
  // dead party (e.g. the guest PlayerScreen) still react. Used only when
  // reconnection is impossible/exhausted — transient drops reconnect silently.
  const failSession = useCallback(
    (reason: string) => {
      endSession();
      for (const listener of listenersRef.current) {
        listener({ type: 'ended', reason });
      }
    },
    [endSession],
  );
  const failSessionRef = useRef(failSession);
  failSessionRef.current = failSession;

  const attemptReconnect = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) {
      reconnectingRef.current = false;
      return;
    }
    reconnectAttemptsRef.current += 1;
    try {
      // Force a fresh client — the previous socket is dead. Disconnect first
      // so a lingering half-open socket is not leaked across retries.
      clientRef.current?.disconnect();
      clientRef.current = null;
      const client = await ensureClient();
      const hostKey = (await getPartyHostKey(session.code)) ?? undefined;
      // Re-join preserves host control via the reclaim key; guests get a new
      // member id and resync from the room's persisted clock/source.
      const res = await client.join(
        session.code,
        displayNameRef.current,
        session.kind,
        hostKey,
      );
      setMemberId(res.memberId);
      setRoom(res.room);
      // Finding 1: the silent reconnect kept the local RTC state alive but the
      // server dropped our call membership and (for guests) our member id
      // changed. Re-announce so in-call members don't silently fall out.
      rtcRef.current.rejoinCall();
      reconnectAttemptsRef.current = 0;
      reconnectingRef.current = false;
      setError((prev) => (prev === RECONNECTING_MESSAGE ? null : prev));
    } catch (err) {
      reconnectingRef.current = false;
      const message = err instanceof Error ? err.message : '';
      if (/not found|full|password/i.test(message)) {
        // The room is gone or no longer joinable — stop retrying.
        setError(message || 'The watch party has ended.');
        failSessionRef.current(message || 'The watch party has ended.');
        return;
      }
      scheduleReconnectRef.current();
    }
  }, [ensureClient]);
  attemptReconnectRef.current = () => {
    void attemptReconnect();
  };

  const scheduleReconnect = useCallback(() => {
    if (!sessionRef.current) {
      endSessionRef.current();
      return;
    }
    if (reconnectingRef.current) return;
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setError('Lost connection to the watch party.');
      failSessionRef.current('Lost connection to the watch party.');
      return;
    }
    reconnectingRef.current = true;
    setConnected(false);
    setError(RECONNECTING_MESSAGE);
    const delay = Math.min(
      1000 * 2 ** reconnectAttemptsRef.current,
      15000,
    );
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(() => {
      attemptReconnectRef.current();
    }, delay);
  }, []);
  scheduleReconnectRef.current = scheduleReconnect;

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
    // User-initiated leave — cancel any pending reconnect and tear down.
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectingRef.current = false;
    reconnectAttemptsRef.current = 0;
    sessionRef.current = null;
    rtcRef.current.leaveCall();
    clientRef.current?.send({ type: 'leave' });
    clientRef.current?.disconnect();
    clientRef.current = null;
    setRoom(null);
    setMemberId(null);
    setConnected(false);
    setChat([]);
    setError(null);
  }, []);

  // RC-3: eagerly reconnect when the app returns to the foreground and the
  // socket died while backgrounded (common on iOS/Android/macOS sleep).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (!sessionRef.current) return;
      if (clientRef.current?.connected) return;
      if (reconnectingRef.current) return;
      reconnectAttemptsRef.current = 0;
      scheduleReconnectRef.current();
    });
    return () => sub.remove();
  }, []);

  useEffect(
    () => () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    },
    [],
  );

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
