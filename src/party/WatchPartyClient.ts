import {
  type ClientMessage,
  type PartyClientKind,
  type PartyClock,
  type PartyContent,
  type PublicRoomSummary,
  type ServerMessage,
} from '@/src/party/protocol';

export type PartyListener = (msg: ServerMessage) => void;

const DEFAULT_TIMEOUT_MS = 12000;
// App-level keepalive: keeps intermediaries from idling the socket and lets us
// detect a dead/half-open connection quickly instead of waiting for TCP.
const PING_INTERVAL_MS = 20000;
const PONG_TIMEOUT_MS = 10000;

type Timer = ReturnType<typeof setTimeout>;

interface PendingRequest {
  resolve: (msg: ServerMessage) => void;
  reject: (err: Error) => void;
  ok: (msg: ServerMessage) => boolean;
}

export class WatchPartyClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<PartyListener>();
  private intentionalClose = false;
  // RC-6: multiple in-flight requests are matched by their `ok` predicate
  // instead of a single slot that overlapping requests would clobber.
  private pending: PendingRequest[] = [];
  private pingTimer: Timer | null = null;
  private pongTimer: Timer | null = null;
  // Set when the server rejects our app-level ping (older server without
  // ping/pong support). We then stop pinging and rely on the transport, so a
  // version-skewed server does not trigger a reconnect loop or spurious errors.
  private appKeepaliveDisabled = false;
  /**
   * RC-3: invoked when the socket closes unexpectedly (not via `disconnect`).
   * When set, the owner drives reconnection instead of the client synthesizing
   * an immediate `ended`. If unset, the client falls back to the legacy
   * `ended` dispatch so existing consumers keep working.
   */
  onUnexpectedClose: (() => void) | null = null;

  constructor(private readonly url: string) {}

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  subscribe(listener: PartyListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    this.intentionalClose = false;
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('Could not reach the watch party server.'));
      }, DEFAULT_TIMEOUT_MS);
      ws.onopen = () => {
        clearTimeout(timer);
        this.startKeepalive();
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Could not reach the watch party server.'));
      };
      ws.onmessage = (event) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(event.data));
        } catch {
          return; // ignore malformed frames
        }
        const frame = parsed as { type?: string; message?: string };
        if (frame && typeof frame === 'object' && frame.type === 'pong') {
          this.handlePong();
          return;
        }
        // Backward-compat: an older server has no `ping` handler and replies
        // with `{type:'error', message:'Unknown message'}`. If that arrives
        // while we're awaiting a pong, it is the response to our ping — treat
        // it as "keepalive unsupported" and swallow it so it neither closes the
        // socket (reconnect loop) nor rejects an unrelated in-flight request.
        if (
          frame &&
          typeof frame === 'object' &&
          frame.type === 'error' &&
          this.pongTimer != null &&
          typeof frame.message === 'string' &&
          /unknown message/i.test(frame.message)
        ) {
          this.appKeepaliveDisabled = true;
          this.stopKeepalive();
          return;
        }
        this.dispatch(parsed as ServerMessage);
      };
      ws.onclose = () => {
        this.stopKeepalive();
        this.rejectAllPending(new Error('Disconnected'));
        if (this.intentionalClose) return;
        if (this.onUnexpectedClose) {
          this.onUnexpectedClose();
          return;
        }
        this.dispatch({ type: 'ended', reason: 'Disconnected' });
      };
    });
  }

  disconnect(): void {
    this.stopKeepalive();
    this.rejectAllPending(new Error('Disconnected'));
    this.intentionalClose = true;
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close();
    } catch {
      // ignore
    }
  }

  send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  private startKeepalive(): void {
    if (this.appKeepaliveDisabled) return;
    this.stopKeepalive();
    this.pingTimer = setInterval(() => {
      if (this.appKeepaliveDisabled) return;
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      try {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      } catch {
        return;
      }
      if (this.pongTimer) return;
      this.pongTimer = setTimeout(() => {
        this.pongTimer = null;
        // No pong in time — treat the socket as dead. Closing it drives the
        // owner's reconnect path via `onUnexpectedClose`.
        try {
          this.ws?.close();
        } catch {
          // ignore
        }
      }, PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS);
  }

  private stopKeepalive(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pingTimer = null;
    this.pongTimer = null;
  }

  private handlePong(): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private rejectAllPending(err: Error): void {
    const pending = this.pending;
    this.pending = [];
    for (const entry of pending) entry.reject(err);
  }

  create(
    displayName: string,
    content: PartyContent,
    kind: PartyClientKind = 'player',
    clock?: PartyClock,
    password?: string,
  ): Promise<Extract<ServerMessage, { type: 'created' }>> {
    return this.request(
      {
        type: 'create',
        displayName,
        kind,
        content,
        clock,
        ...(password ? { password } : {}),
      },
      (m): m is Extract<ServerMessage, { type: 'created' }> => m.type === 'created',
    );
  }

  join(
    code: string,
    displayName: string,
    kind: PartyClientKind = 'player',
    hostKey?: string,
    password?: string,
  ): Promise<Extract<ServerMessage, { type: 'joined' }>> {
    return this.request(
      {
        type: 'join',
        displayName,
        kind,
        code: code.trim().toUpperCase(),
        ...(hostKey ? { hostKey } : {}),
        ...(password ? { password } : {}),
      },
      (m): m is Extract<ServerMessage, { type: 'joined' }> => m.type === 'joined',
    );
  }

  private request<T extends ServerMessage>(
    msg: ClientMessage,
    ok: (m: ServerMessage) => m is T,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const remove = () => {
        const i = this.pending.indexOf(entry);
        if (i >= 0) this.pending.splice(i, 1);
      };
      const timer = setTimeout(() => {
        remove();
        reject(new Error('Watch party timed out.'));
      }, DEFAULT_TIMEOUT_MS);
      const entry: PendingRequest = {
        ok,
        resolve: (m) => {
          clearTimeout(timer);
          remove();
          resolve(m as T);
        },
        reject: (err) => {
          clearTimeout(timer);
          remove();
          reject(err);
        },
      };
      this.pending.push(entry);
      this.send(msg);
    });
  }

  private dispatch(msg: ServerMessage): void {
    // An error frame belongs to the oldest outstanding request (FIFO) and is
    // consumed there rather than fanned out to listeners.
    if (this.pending.length && msg.type === 'error') {
      this.pending[0].reject(new Error(msg.message));
      return;
    }
    const entry = this.pending.find((p) => p.ok(msg));
    if (entry) entry.resolve(msg);
    for (const listener of this.listeners) listener(msg);
  }
}

export const wsUrlToHttpOrigin = (wsUrl: string): string => {
  try {
    const u = new URL(wsUrl);
    u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
    u.pathname = '';
    u.search = '';
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return wsUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  }
};

export const fetchPublicRooms = async (
  wsUrl: string,
): Promise<PublicRoomSummary[]> => {
  try {
    const res = await fetch(`${wsUrlToHttpOrigin(wsUrl)}/rooms`);
    if (!res.ok) return [];
    const data = (await res.json()) as { rooms?: PublicRoomSummary[] };
    return Array.isArray(data.rooms) ? data.rooms : [];
  } catch {
    return [];
  }
};
