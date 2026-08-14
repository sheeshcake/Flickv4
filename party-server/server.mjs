/**
 * Flick watch-party room server.
 * Syncs TMDB identity + a host playback clock. Never proxies video.
 *
 * Protocol: keep in sync with `src/party/protocol.ts`.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');

const PORT = Number(process.env.PORT) || 8787;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const MAX_MEMBERS = 8;
const IDLE_MS = 30 * 60 * 1000;
const CHAT_MAX = 200;
const URI_MAX = 8192;
const SUBTITLE_MAX_BYTES = 1_500_000;

/** @typedef {{ tmdbId: number, mediaType: 'movie'|'tv', title: string, posterPath?: string|null, season?: number, episode?: number }} PartyContent */
/** @typedef {{ positionSeconds: number, paused: boolean, updatedAt: number }} PartyClock */
/** @typedef {{ uri: string, kind: 'hls'|'file' }} PartySource */
/** @typedef {{ url: string, language: string, display: string, offsetSeconds: number }} PartySubtitles */
/** @typedef {{ id: string, displayName: string, kind: 'player'|'companion', role: 'host'|'guest', buffering: boolean, ws: import('ws').WebSocket }} Member */
/** @typedef {{ code: string, hostId: string, content: PartyContent, clock: PartyClock, source: PartySource|null, embedUrl: string|null, subtitles: PartySubtitles|null, members: Map<string, Member>, lastActive: number }} Room */

/** @type {Map<string, Room>} */
const rooms = new Map();
let memberSeq = 0;

const randomCode = () => {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
};

const uniqueCode = () => {
  for (let i = 0; i < 20; i++) {
    const code = randomCode();
    if (!rooms.has(code)) return code;
  }
  return randomCode() + randomCode().slice(0, 1);
};

const publicRoom = (room) => ({
  code: room.code,
  hostId: room.hostId,
  content: room.content,
  clock: room.clock,
  source: room.source,
  embedUrl: room.embedUrl,
  subtitles: room.subtitles,
  members: [...room.members.values()].map((m) => ({
    id: m.id,
    displayName: m.displayName,
    kind: m.kind,
    role: m.role,
    buffering: m.buffering,
  })),
});

const send = (ws, msg) => {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
};

const broadcast = (room, msg, exceptId) => {
  const raw = JSON.stringify(msg);
  for (const m of room.members.values()) {
    if (exceptId && m.id === exceptId) continue;
    if (m.ws.readyState === 1) m.ws.send(raw);
  }
};

const touch = (room) => {
  room.lastActive = Date.now();
};

const destroyRoom = (code, reason) => {
  const room = rooms.get(code);
  if (!room) return;
  broadcast(room, { type: 'ended', reason });
  rooms.delete(code);
};

const memberRoom = (memberId) => {
  for (const room of rooms.values()) {
    if (room.members.has(memberId)) return room;
  }
  return null;
};

const isHost = (room, memberId) => room.hostId === memberId;

const applyHostClock = (room, patch) => {
  room.clock = {
    ...room.clock,
    ...patch,
    updatedAt: Date.now(),
  };
  touch(room);
  broadcast(room, { type: 'clock', clock: room.clock });
  broadcast(room, { type: 'state', room: publicRoom(room) });
};

const isBlockedSubtitleHost = (hostname) => {
  const host = hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
};

const serveSubtitle = async (code, res) => {
  const room = rooms.get(String(code || '').toUpperCase());
  const url = room?.subtitles?.url;
  if (!url) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('No subtitles');
    return;
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Bad subtitle URL');
    return;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Bad subtitle URL');
    return;
  }
  if (isBlockedSubtitleHost(parsed.hostname)) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Bad subtitle URL');
    return;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const upstream = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/plain, text/vtt, application/x-subrip, */*' },
    });
    clearTimeout(timer);
    if (!upstream.ok) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Subtitle fetch failed');
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > SUBTITLE_MAX_BYTES) {
      res.writeHead(413, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Subtitle too large');
      return;
    }
    res.writeHead(200, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(buf);
  } catch {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Subtitle fetch failed');
  }
};

const serveStatic = (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }

  const subMatch = url.pathname.match(/^\/subtitle\/([A-Za-z0-9]+)\/?$/);
  if (subMatch && req.method === 'GET') {
    void serveSubtitle(subMatch[1], res);
    return;
  }

  const isPartyPage =
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    /^\/p\/[A-Za-z0-9]+\/?$/.test(url.pathname);

  const filePath = isPartyPage
    ? path.join(PUBLIC_DIR, 'index.html')
    : path.join(PUBLIC_DIR, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
    };
    res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
};

const httpServer = http.createServer(serveStatic);
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  /** @type {string | null} */
  let memberId = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      send(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }
    if (!msg || typeof msg.type !== 'string') {
      send(ws, { type: 'error', message: 'Missing type' });
      return;
    }

    try {
      handleMessage(ws, msg, () => memberId, (id) => {
        memberId = id;
      });
    } catch (err) {
      send(ws, {
        type: 'error',
        message: err instanceof Error ? err.message : 'Server error',
      });
    }
  });

  ws.on('close', () => {
    if (!memberId) return;
    const room = memberRoom(memberId);
    if (!room) return;
    const leavingHost = isHost(room, memberId);
    room.members.delete(memberId);
    if (leavingHost || room.members.size === 0) {
      destroyRoom(room.code, leavingHost ? 'Host left' : 'Room empty');
      return;
    }
    touch(room);
    broadcast(room, { type: 'state', room: publicRoom(room) });
  });
});

/**
 * @param {import('ws').WebSocket} ws
 * @param {any} msg
 * @param {() => string | null} getMemberId
 * @param {(id: string) => void} setMemberId
 */
const handleMessage = (ws, msg, getMemberId, setMemberId) => {
  const displayName = String(msg.displayName || 'Flick user').slice(0, 32);
  const kind = msg.kind === 'companion' ? 'companion' : 'player';

  if (msg.type === 'create') {
    if (getMemberId()) throw new Error('Already in a room');
    const content = msg.content;
    if (!content || typeof content.tmdbId !== 'number' || !content.mediaType) {
      throw new Error('Missing content');
    }
    const code = uniqueCode();
    const id = `m${++memberSeq}`;
    const clock = {
      positionSeconds: Number(msg.clock?.positionSeconds) || 0,
      paused: msg.clock?.paused !== false,
      updatedAt: Date.now(),
    };
    /** @type {Member} */
    const host = {
      id,
      displayName,
      kind,
      role: 'host',
      buffering: false,
      ws,
    };
    /** @type {Room} */
    const room = {
      code,
      hostId: id,
      content: {
        tmdbId: content.tmdbId,
        mediaType: content.mediaType === 'tv' ? 'tv' : 'movie',
        title: String(content.title || 'Untitled').slice(0, 200),
        posterPath: content.posterPath ?? null,
        season: content.season,
        episode: content.episode,
      },
      clock,
      source: null,
      embedUrl: null,
      subtitles: null,
      members: new Map([[id, host]]),
      lastActive: Date.now(),
    };
    rooms.set(code, room);
    setMemberId(id);
    send(ws, { type: 'created', memberId: id, room: publicRoom(room) });
    return;
  }

  if (msg.type === 'join') {
    if (getMemberId()) throw new Error('Already in a room');
    const code = String(msg.code || '')
      .trim()
      .toUpperCase();
    const room = rooms.get(code);
    if (!room) throw new Error('Room not found');
    if (room.members.size >= MAX_MEMBERS) throw new Error('Room is full');
    const id = `m${++memberSeq}`;
    room.members.set(id, {
      id,
      displayName,
      kind,
      role: 'guest',
      buffering: false,
      ws,
    });
    setMemberId(id);
    touch(room);
    send(ws, { type: 'joined', memberId: id, room: publicRoom(room) });
    broadcast(room, { type: 'state', room: publicRoom(room) }, id);
    return;
  }

  const memberId = getMemberId();
  if (!memberId) throw new Error('Join or create a room first');
  const room = memberRoom(memberId);
  if (!room) throw new Error('Room gone');
  const member = room.members.get(memberId);
  if (!member) throw new Error('Not a member');

  switch (msg.type) {
    case 'play':
    case 'pause':
    case 'seek':
    case 'heartbeat':
    case 'episode': {
      if (!isHost(room, memberId)) throw new Error('Only the host can control playback');
      if (msg.type === 'play') applyHostClock(room, { paused: false });
      if (msg.type === 'pause') applyHostClock(room, { paused: true });
      if (msg.type === 'seek') {
        const pos = Number(msg.positionSeconds);
        if (!Number.isFinite(pos)) throw new Error('Bad seek');
        applyHostClock(room, { positionSeconds: Math.max(0, pos) });
      }
      if (msg.type === 'heartbeat') {
        const pos = Number(msg.positionSeconds);
        if (!Number.isFinite(pos)) return;
        room.clock = {
          positionSeconds: Math.max(0, pos),
          paused: !!msg.paused,
          updatedAt: Date.now(),
        };
        touch(room);
        broadcast(room, { type: 'clock', clock: room.clock }, memberId);
      }
      if (msg.type === 'episode') {
        const season = Number(msg.season);
        const episode = Number(msg.episode);
        if (!Number.isFinite(season) || !Number.isFinite(episode)) {
          throw new Error('Bad episode');
        }
        room.content = { ...room.content, season, episode };
        room.clock = { positionSeconds: 0, paused: true, updatedAt: Date.now() };
        room.source = null;
        room.embedUrl = null;
        room.subtitles = null;
        touch(room);
        broadcast(room, { type: 'episode', season, episode });
        broadcast(room, { type: 'source', source: null, embedUrl: null });
        broadcast(room, { type: 'subtitles', subtitles: null });
        broadcast(room, { type: 'clock', clock: room.clock });
        broadcast(room, { type: 'state', room: publicRoom(room) });
      }
      return;
    }
    case 'source': {
      if (!isHost(room, memberId)) throw new Error('Only the host can set the source');
      const uri = String(msg.uri || '').slice(0, URI_MAX);
      if (!uri) throw new Error('Missing source');
      if (!/^https?:\/\//i.test(uri) || !/\.(m3u8|mp4|webm|mkv)(\?|#|$)/i.test(uri)) {
        throw new Error('Source must be a stream URL (m3u8/mp4), not an embed page');
      }
      const kind = /\.m3u8(\?|#|$)/i.test(uri)
        ? 'hls'
        : msg.kind === 'file'
          ? 'file'
          : 'hls';
      room.source = { uri, kind };
      if (msg.embedUrl !== undefined) {
        room.embedUrl = msg.embedUrl ? String(msg.embedUrl).slice(0, URI_MAX) : null;
      }
      touch(room);
      broadcast(room, { type: 'source', source: room.source, embedUrl: room.embedUrl });
      broadcast(room, { type: 'state', room: publicRoom(room) });
      return;
    }
    case 'subtitles': {
      if (!isHost(room, memberId)) throw new Error('Only the host can set subtitles');
      if (msg.subtitles == null) {
        room.subtitles = null;
      } else {
        const url = String(msg.subtitles.url || '').slice(0, URI_MAX);
        if (!url) {
          room.subtitles = null;
        } else {
          room.subtitles = {
            url,
            language: String(msg.subtitles.language || '').slice(0, 16),
            display: String(msg.subtitles.display || 'Subtitles').slice(0, 80),
            offsetSeconds: Number(msg.subtitles.offsetSeconds) || 0,
          };
        }
      }
      touch(room);
      broadcast(room, { type: 'subtitles', subtitles: room.subtitles });
      broadcast(room, { type: 'state', room: publicRoom(room) });
      return;
    }
    case 'buffering': {
      member.buffering = !!msg.buffering;
      touch(room);
      broadcast(room, { type: 'state', room: publicRoom(room) });
      return;
    }
    case 'control': {
      // Companion remote: forward to the host so they apply + rebroadcast.
      if (member.kind !== 'companion' && !isHost(room, memberId)) {
        throw new Error('Guests cannot control playback');
      }
      const action = msg.action;
      if (action !== 'play' && action !== 'pause' && action !== 'seek') {
        throw new Error('Bad control');
      }
      const host = room.members.get(room.hostId);
      if (!host) throw new Error('Host gone');
      send(host.ws, {
        type: 'control',
        action,
        positionSeconds: msg.positionSeconds,
      });
      return;
    }
    case 'chat': {
      const text = String(msg.text || '').trim().slice(0, CHAT_MAX);
      if (!text) return;
      touch(room);
      broadcast(room, {
        type: 'chat',
        from: member.displayName,
        text,
        at: Date.now(),
      });
      return;
    }
    case 'leave': {
      ws.close();
      return;
    }
    default:
      throw new Error('Unknown message');
  }
};

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActive > IDLE_MS) {
      destroyRoom(code, 'Room expired');
    }
  }
}, 60_000).unref();

httpServer.listen(PORT, () => {
  console.log(`[flick-party] listening on :${PORT}`);
});
