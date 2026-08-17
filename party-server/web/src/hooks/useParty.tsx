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
import type {
  ClientKind,
  ClientMessage,
  PartyChatLine,
  PartyClock,
  PartyContent,
  PartyRoom,
  ServerMessage,
} from '@/lib/party';

export type { PartyChatLine } from '@/lib/party';

type Listener = (msg: ServerMessage) => void;

const DISPLAY_NAME_KEY = 'flick.partyDisplayName';
const HOST_KEYS_KEY = 'flick.partyHostKeys';
const CONNECT_TIMEOUT_MS = 12000;

const readHostKeys = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(HOST_KEYS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const saveHostKey = (code: string, hostKey: string) => {
  const next = readHostKeys();
  next[code.toUpperCase()] = hostKey;
  localStorage.setItem(HOST_KEYS_KEY, JSON.stringify(next));
};

const getHostKey = (code: string): string | undefined =>
  readHostKeys()[code.toUpperCase()];

const readDisplayName = (): string => {
  try {
    return localStorage.getItem(DISPLAY_NAME_KEY)?.trim() || 'Web';
  } catch {
    return 'Web';
  }
};

interface PartyContextValue {
  connected: boolean;
  room: PartyRoom | null;
  memberId: string | null;
  role: 'host' | 'guest' | null;
  error: string | null;
  displayName: string;
  setDisplayName: (next: string) => string;
  chat: PartyChatLine[];
  joinNotice: string | null;
  createRoom: (
    content: PartyContent,
    clock?: PartyClock,
    password?: string,
  ) => Promise<PartyRoom>;
  joinRoom: (
    code: string,
    kind?: ClientKind,
    password?: string,
  ) => Promise<PartyRoom>;
  leaveRoom: () => void;
  send: (msg: ClientMessage | Record<string, unknown>) => void;
  subscribe: (listener: Listener) => () => void;
}

const PartyContext = createContext<PartyContextValue | null>(null);

export const PartyProvider = ({ children }: { children: ReactNode }) => {
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef(new Set<Listener>());
  const pendingRef = useRef<{
    ok: (msg: ServerMessage) => boolean;
    resolve: (msg: ServerMessage) => void;
    reject: (err: Error) => void;
  } | null>(null);
  const roomRef = useRef<PartyRoom | null>(null);
  const memberIdRef = useRef<string | null>(null);
  const seenMembersRef = useRef<Set<string> | null>(null);
  const intentionalCloseRef = useRef(false);

  const [room, setRoom] = useState<PartyRoom | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chat, setChat] = useState<PartyChatLine[]>([]);
  const [joinNotice, setJoinNotice] = useState<string | null>(null);
  const [displayName, setDisplayNameState] = useState(readDisplayName);
  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;
  roomRef.current = room;
  memberIdRef.current = memberId;

  const setDisplayName = useCallback((next: string) => {
    const saved = next.trim().slice(0, 32) || 'Web';
    displayNameRef.current = saved;
    setDisplayNameState(saved);
    try {
      localStorage.setItem(DISPLAY_NAME_KEY, saved);
    } catch {
      // ignore
    }
    return saved;
  }, []);

  const dispatch = useCallback((msg: ServerMessage) => {
    if (msg.type === 'created' || msg.type === 'joined') {
      roomRef.current = msg.room;
      memberIdRef.current = msg.memberId;
      setRoom(msg.room);
      setMemberId(msg.memberId);
      setError(null);
    }
    if (msg.type === 'state') {
      roomRef.current = msg.room;
      setRoom(msg.room);
    }
    if (msg.type === 'clock' && roomRef.current) {
      roomRef.current = { ...roomRef.current, clock: msg.clock };
      setRoom(roomRef.current);
    }
    if (msg.type === 'episode' && roomRef.current) {
      roomRef.current = {
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
      };
      setRoom(roomRef.current);
    }
    if (msg.type === 'browse' && roomRef.current) {
      roomRef.current = {
        ...roomRef.current,
        source: null,
        embedUrl: null,
        subtitles: null,
        browsing: true,
      };
      setRoom(roomRef.current);
    }
    if (msg.type === 'content' && roomRef.current) {
      roomRef.current = {
        ...roomRef.current,
        content: msg.content,
        source: null,
        embedUrl: null,
        subtitles: null,
        browsing: false,
      };
      setRoom(roomRef.current);
    }
    if (msg.type === 'source' && roomRef.current) {
      roomRef.current = {
        ...roomRef.current,
        source: msg.source,
        embedUrl: msg.embedUrl,
      };
      setRoom(roomRef.current);
    }
    if (msg.type === 'subtitles' && roomRef.current) {
      roomRef.current = { ...roomRef.current, subtitles: msg.subtitles };
      setRoom(roomRef.current);
    }
    if (msg.type === 'rtc-peers' && roomRef.current) {
      roomRef.current = { ...roomRef.current, rtcMemberIds: msg.ids };
      setRoom(roomRef.current);
    }
    if (msg.type === 'chat') {
      setChat((prev) => [...prev, { from: msg.from, text: msg.text, at: msg.at }]);
    }
    if (msg.type === 'error') setError(msg.message);
    if (msg.type === 'ended') {
      roomRef.current = null;
      memberIdRef.current = null;
      setRoom(null);
      setMemberId(null);
      setConnected(false);
      setChat([]);
    }
    for (const listener of listenersRef.current) listener(msg);
  }, []);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    pendingRef.current?.reject(new Error('Disconnected'));
    pendingRef.current = null;
    const ws = wsRef.current;
    wsRef.current = null;
    try {
      ws?.close();
    } catch {
      // ignore
    }
    setConnected(false);
  }, []);

  const ensureSocket = useCallback((): Promise<WebSocket> => {
    const existing = wsRef.current;
    if (existing && existing.readyState === WebSocket.OPEN) {
      return Promise.resolve(existing);
    }
    if (existing && existing.readyState === WebSocket.CONNECTING) {
      return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
          reject(new Error('Could not reach the watch party server.'));
        }, CONNECT_TIMEOUT_MS);
        existing.addEventListener(
          'open',
          () => {
            window.clearTimeout(timer);
            resolve(existing);
          },
          { once: true },
        );
        existing.addEventListener(
          'error',
          () => {
            window.clearTimeout(timer);
            reject(new Error('Could not reach the watch party server.'));
          },
          { once: true },
        );
      });
    }
    intentionalCloseRef.current = false;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as ServerMessage;
        if (msg.type === 'error' && pendingRef.current) {
          pendingRef.current.reject(new Error(msg.message));
          pendingRef.current = null;
        } else if (pendingRef.current?.ok(msg)) {
          pendingRef.current.resolve(msg);
          pendingRef.current = null;
        }
        dispatch(msg);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      pendingRef.current?.reject(new Error('Disconnected'));
      pendingRef.current = null;
      setConnected(false);
      if (!intentionalCloseRef.current && roomRef.current) {
        dispatch({ type: 'ended', reason: 'Disconnected' });
      }
    };
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        ws.close();
        reject(new Error('Could not reach the watch party server.'));
      }, CONNECT_TIMEOUT_MS);
      ws.onopen = () => {
        window.clearTimeout(timer);
        setConnected(true);
        resolve(ws);
      };
      ws.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('Could not reach the watch party server.'));
      };
    });
  }, [dispatch]);

  const request = useCallback(
    <T extends ServerMessage>(
      msg: ClientMessage,
      ok: (m: ServerMessage) => m is T,
    ): Promise<T> => {
      return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
          pendingRef.current = null;
          reject(new Error('Watch party timed out.'));
        }, CONNECT_TIMEOUT_MS);
        pendingRef.current = {
          ok,
          resolve: (m) => {
            window.clearTimeout(timer);
            pendingRef.current = null;
            resolve(m as T);
          },
          reject: (err) => {
            window.clearTimeout(timer);
            pendingRef.current = null;
            reject(err);
          },
        };
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          window.clearTimeout(timer);
          pendingRef.current = null;
          reject(new Error('Not connected'));
          return;
        }
        ws.send(JSON.stringify(msg));
      });
    },
    [],
  );

  const send = useCallback((msg: ClientMessage | Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const resetSession = useCallback(() => {
    disconnect();
    roomRef.current = null;
    memberIdRef.current = null;
    setRoom(null);
    setMemberId(null);
    setChat([]);
    setError(null);
  }, [disconnect]);

  const createRoom = useCallback(
    async (content: PartyContent, clock?: PartyClock, password?: string) => {
      setError(null);
      if (roomRef.current) resetSession();
      await ensureSocket();
      setChat([]);
      const res = await request(
        {
          type: 'create',
          displayName: displayNameRef.current,
          kind: 'player',
          content,
          clock,
          ...(password ? { password } : {}),
        },
        (m): m is Extract<ServerMessage, { type: 'created' }> => m.type === 'created',
      );
      if (res.hostKey) saveHostKey(res.room.code, res.hostKey);
      return res.room;
    },
    [ensureSocket, request, resetSession],
  );

  const joinRoom = useCallback(
    async (code: string, kind: ClientKind = 'companion', password?: string) => {
      setError(null);
      if (roomRef.current) resetSession();
      await ensureSocket();
      setChat([]);
      const hostKey = getHostKey(code);
      return (
        await request(
          {
            type: 'join',
            displayName: displayNameRef.current,
            kind,
            code: code.trim().toUpperCase(),
            ...(hostKey ? { hostKey } : {}),
            ...(password ? { password } : {}),
          },
          (m): m is Extract<ServerMessage, { type: 'joined' }> => m.type === 'joined',
        )
      ).room;
    },
    [ensureSocket, request, resetSession],
  );

  const leaveRoom = useCallback(() => {
    send({ type: 'leave' });
    resetSession();
  }, [resetSession, send]);

  const role: 'host' | 'guest' | null = useMemo(() => {
    if (!room || !memberId) return null;
    return room.hostId === memberId ? 'host' : 'guest';
  }, [memberId, room]);

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
    const timer = window.setTimeout(() => setJoinNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [joinNotice]);

  useEffect(() => () => disconnect(), [disconnect]);

  const value = useMemo(
    () => ({
      connected,
      room,
      memberId,
      role,
      error,
      displayName,
      setDisplayName,
      chat,
      joinNotice,
      createRoom,
      joinRoom,
      leaveRoom,
      send,
      subscribe,
    }),
    [
      chat,
      connected,
      createRoom,
      displayName,
      error,
      joinNotice,
      joinRoom,
      leaveRoom,
      memberId,
      role,
      room,
      send,
      setDisplayName,
      subscribe,
    ],
  );

  return <PartyContext.Provider value={value}>{children}</PartyContext.Provider>;
};

export const useParty = (): PartyContextValue => {
  const ctx = useContext(PartyContext);
  if (!ctx) throw new Error('useParty must be used within PartyProvider');
  return ctx;
};
