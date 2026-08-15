import {
  type ClientMessage,
  type PartyClientKind,
  type PartyClock,
  type PartyContent,
  type ServerMessage,
} from '@/src/party/protocol';

export type PartyListener = (msg: ServerMessage) => void;

const DEFAULT_TIMEOUT_MS = 12000;

export class WatchPartyClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<PartyListener>();
  private intentionalClose = false;
  private pending: {
    resolve: (msg: ServerMessage) => void;
    reject: (err: Error) => void;
    ok: (msg: ServerMessage) => boolean;
  } | null = null;

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
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Could not reach the watch party server.'));
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as ServerMessage;
          this.dispatch(msg);
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        if (this.pending) {
          this.pending.reject(new Error('Disconnected'));
          this.pending = null;
        }
        if (!this.intentionalClose) {
          this.dispatch({ type: 'ended', reason: 'Disconnected' });
        }
      };
    });
  }

  disconnect(): void {
    this.pending = null;
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
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new Error('Watch party timed out.'));
      }, DEFAULT_TIMEOUT_MS);
      this.pending = {
        ok,
        resolve: (m) => {
          clearTimeout(timer);
          this.pending = null;
          resolve(m as T);
        },
        reject: (err) => {
          clearTimeout(timer);
          this.pending = null;
          reject(err);
        },
      };
      this.send(msg);
    });
  }

  private dispatch(msg: ServerMessage): void {
    if (this.pending) {
      if (msg.type === 'error') {
        this.pending.reject(new Error(msg.message));
        return;
      }
      if (this.pending.ok(msg)) {
        this.pending.resolve(msg);
      }
    }
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
