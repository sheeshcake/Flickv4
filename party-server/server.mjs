/**
 * Flick watch-party room server.
 * Syncs TMDB identity + a host playback clock.
 * Web guest waterfall: Streamflix → `/media` proxy → host embed.
 * Web host/solo: browser lists/decrypts via `/extract`, plays through `/media`.
 *
 * Protocol: keep in sync with `src/party/protocol.ts`.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
};
loadEnvFile(path.join(__dirname, '.env'));
loadEnvFile(path.join(__dirname, '..', '.env'));

const PORT = Number(process.env.PORT) || 8787;
const APP_VERSION = process.env.APP_VERSION?.trim() || '0.0.0';
const TMDB_API_KEY =
  process.env.TMDB_API_KEY || process.env.EXPO_PUBLIC_TMDB_API_KEY || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const WYZIE_BASE = (
  process.env.WYZIE_BASE_URL ||
  process.env.EXPO_PUBLIC_WYZIE_BASE_URL ||
  'https://sub.wyzie.io'
).replace(/\/+$/, '');
const WYZIE_KEY =
  process.env.WYZIE_API_KEY || process.env.EXPO_PUBLIC_WYZIE_API_KEY || '';
const WYZIE_MAX_TRACKS = 20;
const TMDB_TIMEOUT_MS = 15000;
const GITHUB_OWNER =
  process.env.GITHUB_REPO_OWNER ||
  process.env.EXPO_PUBLIC_UPDATE_REPO_OWNER ||
  'sheeshcake';
const GITHUB_REPO =
  process.env.GITHUB_REPO_NAME ||
  process.env.EXPO_PUBLIC_UPDATE_REPO_NAME ||
  'Flickv4';
const APP_RELEASE_CACHE_MS = 10 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const MAX_MEMBERS = 8;
const IDLE_MS = 30 * 60 * 1000;
const CHAT_MAX = 200;
const REACTION_COOLDOWN_MS = 400;
const PARTY_REACTIONS = new Set(['👍', '👎', '❤️', '😂', '😮', '👏', '🎉', '🔥', '😢']);
/** @type {Map<string, number>} */
const lastReactionAt = new Map();
const URI_MAX = 8192;
const SUBTITLE_MAX_BYTES = 1_500_000;
const PLAYLIST_MAX_BYTES = 2_000_000;
const MEDIA_PLAYLIST_TIMEOUT_MS = 20_000;
const MEDIA_SEGMENT_TIMEOUT_MS = 45_000;
const MEDIA_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

/** @typedef {{ tmdbId: number, mediaType: 'movie'|'tv', title: string, posterPath?: string|null, season?: number, episode?: number, imdbId?: string|null }} PartyContent */
/** @typedef {{ positionSeconds: number, paused: boolean, updatedAt: number }} PartyClock */
/** @typedef {{ uri: string, kind: 'hls'|'file', referer?: string, origin?: string, sourceId?: string }} PartySource */
/** @typedef {{ url: string, language: string, display: string, offsetSeconds: number }} PartySubtitles */
/** @typedef {{ id: string, displayName: string, kind: 'player'|'companion', role: 'host'|'guest', buffering: boolean, ws: import('ws').WebSocket }} Member */
/** @typedef {{ code: string, hostId: string, hostKey: string, passwordHash: string|null, content: PartyContent, clock: PartyClock, source: PartySource|null, embedUrl: string|null, subtitles: PartySubtitles|null, browsing: boolean, playbackOnly?: boolean, rtcMemberIds: Set<string>, mediaAllowedHosts: Set<string>, streamflixHosts: Set<string>, members: Map<string, Member>, lastActive: number }} Room */

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

const uniquePlaybackCode = () => {
  for (let i = 0; i < 20; i++) {
    let tail = '';
    for (let j = 0; j < 8; j++) {
      tail += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    const code = `P${tail}`;
    if (!rooms.has(code)) return code;
  }
  return `P${Date.now().toString(36).toUpperCase()}`;
};

const createPlaybackSession = (content) => {
  const code = uniquePlaybackCode();
  /** @type {Room} */
  const room = {
    code,
    hostId: '',
    hostKey: '',
    passwordHash: null,
    content: {
      tmdbId: content.tmdbId,
      mediaType: content.mediaType === 'tv' ? 'tv' : 'movie',
      title: String(content.title || 'Untitled').slice(0, 200),
      posterPath: content.posterPath ?? null,
      season: content.season,
      episode: content.episode,
      imdbId: content.imdbId ? String(content.imdbId).slice(0, 16) : null,
    },
    clock: { positionSeconds: 0, paused: true, updatedAt: Date.now() },
    source: null,
    embedUrl: null,
    subtitles: null,
    browsing: false,
    playbackOnly: true,
    rtcMemberIds: new Set(),
    mediaAllowedHosts: new Set(),
    streamflixHosts: new Set(),
    members: new Map(),
    lastActive: Date.now(),
  };
  rooms.set(code, room);
  return room;
};

const PASSWORD_MAX = 64;
const SCRYPT_KEYLEN = 32;

const normalizePassword = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, PASSWORD_MAX);
};

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
};

const verifyPassword = (password, stored) => {
  if (!stored) return false;
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length !== SCRYPT_KEYLEN) return false;
  const actual = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

const publicRoom = (room) => ({
  code: room.code,
  hostId: room.hostId,
  content: room.content,
  clock: room.clock,
  source: room.source,
  embedUrl: room.embedUrl,
  subtitles: room.subtitles,
  browsing: Boolean(room.browsing),
  locked: Boolean(room.passwordHash),
  rtcMemberIds: [...(room.rtcMemberIds ?? [])],
  members: [...room.members.values()].map((m) => ({
    id: m.id,
    displayName: m.displayName,
    kind: m.kind,
    role: m.role,
    buffering: m.buffering,
  })),
});

const publicRoomList = () =>
  [...rooms.values()]
    .filter((room) => !room.playbackOnly)
    .map((room) => ({
    code: room.code,
    title: room.content.title,
    posterPath: room.content.posterPath ?? null,
    mediaType: room.content.mediaType,
    season: room.content.season ?? null,
    episode: room.content.episode ?? null,
    memberCount: room.members.size,
    locked: Boolean(room.passwordHash),
    paused: Boolean(room.clock.paused),
  }));

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

const parsePartyContent = (raw) => {
  if (!raw || typeof raw.tmdbId !== 'number' || !raw.mediaType) {
    throw new Error('Missing content');
  }
  return {
    tmdbId: raw.tmdbId,
    mediaType: raw.mediaType === 'tv' ? 'tv' : 'movie',
    title: String(raw.title || 'Untitled').slice(0, 200),
    posterPath: raw.posterPath ?? null,
    season: raw.season,
    episode: raw.episode,
    imdbId: raw.imdbId ? String(raw.imdbId).slice(0, 16) : null,
  };
};

const clearRoomPlayback = (room) => {
  room.clock = { positionSeconds: 0, paused: true, updatedAt: Date.now() };
  room.source = null;
  room.embedUrl = null;
  room.subtitles = null;
  room.mediaAllowedHosts = new Set();
  room.streamflixHosts = new Set();
};

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

const isBlockedPrivateHost = (hostname) => {
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

const hostnameOf = (uri) => {
  try {
    return new URL(uri).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const seedMediaHosts = (room, uri) => {
  room.mediaAllowedHosts = new Set();
  const host = hostnameOf(uri);
  if (host) room.mediaAllowedHosts.add(host);
  if (room.streamflixHosts) {
    for (const allowed of room.streamflixHosts) room.mediaAllowedHosts.add(allowed);
  }
};

const allowMediaHost = (room, hostname) => {
  if (!hostname) return;
  if (!room.mediaAllowedHosts) room.mediaAllowedHosts = new Set();
  room.mediaAllowedHosts.add(hostname.toLowerCase());
};

const allowStreamflixHost = (room, hostname) => {
  allowMediaHost(room, hostname);
  if (!hostname) return;
  if (!room.streamflixHosts) room.streamflixHosts = new Set();
  room.streamflixHosts.add(hostname.toLowerCase());
};

const isStreamflixMediaHost = (room, hostname) =>
  Boolean(hostname && room?.streamflixHosts?.has(hostname.toLowerCase()));

const resolveAgainst = (base, maybeRelative) => {
  try {
    return new URL(maybeRelative, base).href;
  } catch {
    return null;
  }
};

const proxyMediaPath = (code, absoluteUrl) =>
  `/media/${code}?u=${encodeURIComponent(absoluteUrl)}`;

const rewriteHlsPlaylist = (text, playlistUrl, code, room) => {
  const streamflix = isStreamflixMediaHost(room, hostnameOf(playlistUrl));
  const rewriteAbs = (raw) => {
    const abs = resolveAgainst(playlistUrl, raw);
    if (!abs) return raw;
    const host = hostnameOf(abs);
    if (host) {
      if (streamflix) allowStreamflixHost(room, host);
      else allowMediaHost(room, host);
    }
    return proxyMediaPath(code, abs);
  };
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/gi, (_m, raw) => `URI="${rewriteAbs(raw)}"`);
      }
      return rewriteAbs(trimmed);
    })
    .join('\n');
};

const looksLikePlaylistUrl = (parsed) => /\.m3u8(\?|#|$)/i.test(parsed.pathname);

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 1shows wraps MPEG-TS in a 1×1 PNG. Mobile players resync; HLS.js cannot. */
const tsAfterPngPrefix = (buf) => {
  if (buf.length < 16 || !buf.subarray(0, 8).equals(PNG_SIG)) return 0;
  const iend = buf.indexOf('IEND', 8, 'latin1');
  if (iend < 8 || iend + 8 >= buf.length) return 0;
  return buf[iend + 8] === 0x47 ? iend + 8 : 0;
};

const readWebPrefix = async (body, minBytes) => {
  if (!body || typeof body.getReader !== 'function') {
    return { prefix: Buffer.alloc(0), reader: null };
  }
  const reader = body.getReader();
  const parts = [];
  let size = 0;
  while (size < minBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(Buffer.from(value));
    size += value.byteLength;
  }
  return { prefix: Buffer.concat(parts), reader };
};

const serveMedia = async (code, req, res) => {
  const room = rooms.get(String(code || '').toUpperCase());
  if (room) touch(room);
  const reqUrl = new URL(req.url || '/', `http://${req.headers.host}`);
  const raw = reqUrl.searchParams.get('u') || '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Bad media URL');
    return;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Bad media URL');
    return;
  }
  const host = parsed.hostname.toLowerCase();
  const streamflix = isStreamflixMediaHost(room, host);
  if (!room || (!streamflix && (!room.source?.uri || !room.source.referer))) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('No stream');
    return;
  }
  if (isBlockedPrivateHost(host) || !room.mediaAllowedHosts?.has(host)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Host not allowed');
    return;
  }

  const playlistHint = looksLikePlaylistUrl(parsed);
  if (streamflix && playlistHint) {
    streamflixLog('proxy playlist', code, host, parsed.pathname);
  }
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    playlistHint ? MEDIA_PLAYLIST_TIMEOUT_MS : MEDIA_SEGMENT_TIMEOUT_MS,
  );
  const onClose = () => controller.abort();
  req.on('close', onClose);

  try {
    const upstreamHeaders = {
      Accept: '*/*',
      'User-Agent': MEDIA_UA,
      Referer: streamflix ? 'https://vidrock.net/' : room.source.referer,
    };
    if (streamflix) upstreamHeaders.Origin = 'https://vidrock.net';
    else if (room.source.origin) upstreamHeaders.Origin = room.source.origin;
    if (req.headers.range) upstreamHeaders.Range = req.headers.range;

    const upstream = await fetch(parsed.href, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: upstreamHeaders,
      signal: controller.signal,
      redirect: 'follow',
    });
    const finalHost = hostnameOf(upstream.url);
    if (finalHost) {
      if (streamflix) allowStreamflixHost(room, finalHost);
      else allowMediaHost(room, finalHost);
    }

    const contentType = upstream.headers.get('content-type') || '';
    const treatAsPlaylist =
      playlistHint ||
      /mpegurl|x-mpegURL|vnd\.apple\.mpegurl/i.test(contentType);

    if (treatAsPlaylist && req.method !== 'HEAD') {
      const buf = Buffer.from(await upstream.arrayBuffer());
      if (buf.length > PLAYLIST_MAX_BYTES) {
        res.writeHead(413, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Playlist too large');
        return;
      }
      const text = buf.toString('utf8');
      if (upstream.ok && text.trimStart().startsWith('#EXTM3U')) {
        const rewritten = rewriteHlsPlaylist(
          text,
          upstream.url || parsed.href,
          String(code || '').toUpperCase(),
          room,
        );
        res.writeHead(200, {
          'content-type': 'application/vnd.apple.mpegurl; charset=utf-8',
          'cache-control': 'no-store',
        });
        res.end(rewritten);
        return;
      }
      res.writeHead(upstream.status, {
        'content-type': contentType || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(buf);
      return;
    }

    const outHeaders = {
      'content-type': contentType || 'application/octet-stream',
      'cache-control': 'no-store',
    };
    const len = upstream.headers.get('content-length');
    if (len) outHeaders['content-length'] = len;
    const range = upstream.headers.get('content-range');
    if (range) outHeaders['content-range'] = range;
    const acceptRanges = upstream.headers.get('accept-ranges');
    if (acceptRanges) outHeaders['accept-ranges'] = acceptRanges;

    if (req.method === 'HEAD' || !upstream.body) {
      res.writeHead(upstream.status, outHeaders);
      res.end();
      return;
    }

    const { prefix, reader } = await readWebPrefix(upstream.body, 96);
    const skip = tsAfterPngPrefix(prefix);
    const start = skip ? prefix.subarray(skip) : prefix;
    if (skip) {
      outHeaders['content-type'] = 'video/mp2t';
      delete outHeaders['content-length'];
      streamflixLog('proxy strip png', code, host, skip);
    }
    res.writeHead(upstream.status, outHeaders);
    if (start.length) res.write(start);
    if (!reader) {
      res.end();
      return;
    }
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        if (!res.write(chunk)) {
          await new Promise((resolve) => res.once('drain', resolve));
        }
      }
      res.end();
    } catch {
      res.destroy();
    }
  } catch {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Media fetch failed');
    } else {
      res.destroy();
    }
  } finally {
    clearTimeout(timer);
    req.off('close', onClose);
  }
};

const STREAMFLIX_GCM_KEY = Buffer.from(
  '7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f',
  'hex',
);
const STREAMFLIX_UA =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';
const VIDEASY_API = 'https://api.videasy.net';
const VIDEASY_DEC = 'https://enc-dec.app/api/dec-videasy';
const VIDZEE_PLAYER = 'https://player.vidzee.wtf';
const VIDZEE_CORE = 'https://core.vidzee.wtf';
const VIDZEE_PASS = '4f2a9c7d1e8b3a6f0d5c2e9a7b1f4d8c';

const streamflixLog = (...args) => console.log('[Streamflix]', ...args);

const isStreamUri = (uri) =>
  /^https?:\/\//i.test(uri) && /\.(m3u8|mp4|webm|mkv)(\?|#|$)/i.test(uri);

const decryptVidrockUrl = (payload) => {
  try {
    const packed = Buffer.from(String(payload), 'base64url');
    if (packed.length < 28) return null;
    const nonce = packed.subarray(0, 12);
    const tag = packed.subarray(packed.length - 16);
    const ciphertext = packed.subarray(12, packed.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', STREAMFLIX_GCM_KEY, nonce);
    decipher.setAuthTag(tag);
    const url = Buffer.concat([decipher.update(ciphertext), decipher.final()])
      .toString('utf8')
      .trim();
    return /^https?:\/\//i.test(url) ? url : null;
  } catch (err) {
    streamflixLog('decrypt: fail', err instanceof Error ? err.message : err);
    return null;
  }
};

const streamflixKind = (type, url) =>
  String(type).toLowerCase() === 'hls' || /\.m3u8(\?|#|$)/i.test(url) ? 'hls' : 'file';

const isEnglishSource = (data) => {
  const language = String(data?.language || '').toLowerCase();
  const flag = String(data?.flag || '').toLowerCase();
  return language === 'english' || flag === 'us';
};

const streamflixFetch = async (url, init = {}, timeoutMs = 15000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      headers: {
        'User-Agent': STREAMFLIX_UA,
        Accept: 'application/json',
        Referer: 'https://vidrock.net/',
        Origin: 'https://vidrock.net',
        ...init.headers,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const shortStreamflixUrl = (url) => {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(url).slice(0, 120);
  }
};

const slugId = (name) =>
  String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const pickAtlasMp4 = async (listUrl) => {
  try {
    streamflixLog('atlas: fetch', shortStreamflixUrl(listUrl));
    const res = await streamflixFetch(listUrl);
    if (!res.ok) {
      streamflixLog('atlas: http', res.status);
      return null;
    }
    const qualities = await res.json();
    if (!Array.isArray(qualities)) {
      streamflixLog('atlas: not a list');
      return null;
    }
    const highest = qualities
      .filter((q) => typeof q?.url === 'string' && q.url)
      .sort((a, b) => (b.resolution ?? 0) - (a.resolution ?? 0))[0];
    if (!highest?.url || !/^https?:\/\//i.test(highest.url)) {
      streamflixLog('atlas: no playable mp4', qualities.length);
      return null;
    }
    streamflixLog('atlas: pick', highest.resolution, shortStreamflixUrl(highest.url));
    return highest.url;
  } catch (err) {
    streamflixLog('atlas: error', err instanceof Error ? err.message : err);
    return null;
  }
};

const publicSource = (source) => ({
  id: source.id,
  name: source.name,
  language: source.language || '',
  kind: source.kind,
  url: source.url || '',
  subtitles: Array.isArray(source.subtitles) ? source.subtitles : [],
});

const seedSourceHosts = (room, source) => {
  const host = hostnameOf(source.url);
  if (host) allowStreamflixHost(room, host);
  for (const track of source.subtitles || []) {
    const subHost = hostnameOf(track.file);
    if (subHost) allowStreamflixHost(room, subHost);
  }
};

const EXTRACT_ALLOW_HOSTS = [
  'vidrock.net',
  'api.videasy.net',
  'enc-dec.app',
  'player.vidzee.wtf',
  'core.vidzee.wtf',
];

const hostMatchesAllow = (hostname, allowed) => {
  const host = String(hostname || '').toLowerCase();
  const needle = String(allowed || '').toLowerCase();
  return host === needle || host.endsWith(`.${needle}`);
};

const isAllowedExtractHost = (hostname) => {
  const host = String(hostname || '').toLowerCase();
  if (!host || isBlockedPrivateHost(host)) return false;
  return EXTRACT_ALLOW_HOSTS.some((allowed) => hostMatchesAllow(host, allowed));
};

const extractUpstreamHeaders = (hostname, reqHeaders) => {
  const host = String(hostname || '').toLowerCase();
  const headers = {
    'User-Agent': STREAMFLIX_UA,
    Accept: reqHeaders.accept || 'application/json',
  };
  if (hostMatchesAllow(host, 'vidrock.net')) {
    headers.Referer = 'https://vidrock.net/';
    headers.Origin = 'https://vidrock.net';
  } else if (hostMatchesAllow(host, 'videasy.net') || hostMatchesAllow(host, 'enc-dec.app')) {
    headers.Referer = 'https://player.videasy.net/';
    headers.Origin = 'https://player.videasy.net';
  } else if (hostMatchesAllow(host, 'vidzee.wtf')) {
    headers.Referer = `${VIDZEE_PLAYER}/`;
    headers.Origin = VIDZEE_PLAYER;
  }
  const contentType = reqHeaders['content-type'];
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
};

const readRequestBody = (req, limit) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

const serveExtract = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.writeHead(405, { allow: 'GET, POST' });
    res.end();
    return;
  }
  const reqUrl = new URL(req.url || '/', `http://${req.headers.host}`);
  const raw = reqUrl.searchParams.get('u') || '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  if (!isAllowedExtractHost(parsed.hostname)) {
    res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  let body;
  if (req.method === 'POST') {
    try {
      body = await readRequestBody(req, 1_000_000);
    } catch {
      res.writeHead(413, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false }));
      return;
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const upstream = await fetch(parsed.href, {
      method: req.method,
      headers: extractUpstreamHeaders(parsed.hostname, req.headers),
      body: req.method === 'POST' ? body : undefined,
      signal: controller.signal,
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    res.writeHead(upstream.status, {
      'content-type': contentType,
      'cache-control': 'no-store',
    });
    res.end(buf);
  } catch (err) {
    streamflixLog('extract: fail', err instanceof Error ? err.message : err);
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false }));
  } finally {
    clearTimeout(timer);
  }
};

const servePlayCreate = async (req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST' });
    res.end();
    return;
  }
  let raw;
  try {
    raw = JSON.parse((await readRequestBody(req, 8000)).toString('utf8') || '{}');
  } catch {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  let content;
  try {
    content = parsePartyContent({
      tmdbId: Number(raw.tmdbId),
      mediaType: raw.mediaType,
      title: raw.title,
      posterPath: raw.posterPath,
      season: raw.season != null ? Number(raw.season) : undefined,
      episode: raw.episode != null ? Number(raw.episode) : undefined,
      imdbId: raw.imdbId,
    });
  } catch {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  const session = createPlaybackSession(content);
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true, session: session.code }));
};

const servePlaySource = async (code, req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST' });
    res.end();
    return;
  }
  const room = rooms.get(String(code || '').toUpperCase());
  if (!room) {
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  let raw;
  try {
    raw = JSON.parse((await readRequestBody(req, 32_000)).toString('utf8') || '{}');
  } catch {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  const uri = String(raw.uri || '').slice(0, URI_MAX);
  const host = hostnameOf(uri);
  if (!/^https?:\/\//i.test(uri) || !host || isBlockedPrivateHost(host)) {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  const subtitles = Array.isArray(raw.subtitles)
    ? raw.subtitles
        .filter((t) => t && typeof t.file === 'string' && /^https?:\/\//i.test(t.file))
        .slice(0, 40)
        .map((t) => ({
          label: String(t.label || 'Unknown').slice(0, 80),
          file: String(t.file).slice(0, URI_MAX),
        }))
    : [];
  seedSourceHosts(room, { url: uri, subtitles });
  touch(room);
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true }));
};

const servePlaySubtitle = async (code, req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST' });
    res.end();
    return;
  }
  const room = rooms.get(String(code || '').toUpperCase());
  if (!room) {
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  let raw;
  try {
    raw = JSON.parse((await readRequestBody(req, 16_000)).toString('utf8') || '{}');
  } catch {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  const uri = String(raw.url || '').slice(0, URI_MAX);
  const host = hostnameOf(uri);
  if (!/^https?:\/\//i.test(uri) || !host || isBlockedPrivateHost(host)) {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  allowMediaHost(room, host);
  touch(room);
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true }));
};

const serveWyzieSearch = async (req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET' });
    res.end();
    return;
  }
  if (!WYZIE_KEY) {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, tracks: [] }));
    return;
  }
  const reqUrl = new URL(req.url || '/', `http://${req.headers.host}`);
  const tmdbId = Number(reqUrl.searchParams.get('tmdbId'));
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, tracks: [] }));
    return;
  }
  const season = Number(reqUrl.searchParams.get('season'));
  const episode = Number(reqUrl.searchParams.get('episode'));
  const format = reqUrl.searchParams.get('format') === 'vtt' ? 'vtt' : 'srt';
  const url = new URL(`${WYZIE_BASE}/search`);
  url.searchParams.set('id', String(tmdbId));
  url.searchParams.set('key', WYZIE_KEY);
  url.searchParams.set('format', format);
  if (Number.isFinite(season) && Number.isFinite(episode) && season > 0 && episode > 0) {
    url.searchParams.set('season', String(season));
    url.searchParams.set('episode', String(episode));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const upstream = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': MEDIA_UA },
      signal: controller.signal,
    });
    if (!upstream.ok) {
      res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, tracks: [] }));
      return;
    }
    const data = await upstream.json();
    const list = Array.isArray(data) ? data : data && data.url ? [data] : [];
    const tracks = [];
    const seen = new Set();
    for (const raw of list) {
      const file = typeof raw?.url === 'string' ? raw.url : '';
      if (!/^https?:\/\//i.test(file)) continue;
      const language = String(raw.language || '').slice(0, 16);
      const display = String(raw.display || raw.language || 'Unknown').slice(0, 80);
      const cc = Boolean(raw.isHearingImpaired);
      const key = `${language}-${display}-${cc ? 'cc' : 'n'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tracks.push({
        id: String(raw.id || `${language}-${tracks.length}`).slice(0, 80),
        url: file.slice(0, URI_MAX),
        display,
        language,
        isHearingImpaired: cc,
      });
      if (tracks.length >= WYZIE_MAX_TRACKS) break;
    }
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify({ ok: true, tracks }));
  } catch {
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, tracks: [] }));
  } finally {
    clearTimeout(timer);
  }
};

const listVidrock = async (content) => {
  const tmdbId = Number(content.tmdbId);
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) return [];
  const isTv =
    content.mediaType === 'tv' &&
    content.season != null &&
    content.episode != null;
  const apiUrl = isTv
    ? `https://vidrock.net/api/tv/${tmdbId}/${content.season}/${content.episode}`
    : `https://vidrock.net/api/movie/${tmdbId}`;
  streamflixLog('vidrock: GET', apiUrl);
  const res = await streamflixFetch(apiUrl);
  if (!res.ok) {
    streamflixLog('vidrock: http', res.status);
    return [];
  }
  const body = await res.json();
  if (!body || typeof body !== 'object') return [];
  const entries = Object.entries(body).sort(([aName, a], [bName, b]) => {
    const aEn = isEnglishSource(a) ? 1 : 0;
    const bEn = isEnglishSource(b) ? 1 : 0;
    if (aEn !== bEn) return bEn - aEn;
    if (String(aName).toLowerCase() === 'atlas') return 1;
    if (String(bName).toLowerCase() === 'atlas') return -1;
    return 0;
  });
  const sources = [];
  for (const [name, data] of entries) {
    const packed = typeof data?.url === 'string' ? data.url.trim() : '';
    if (!packed) continue;
    let url = decryptVidrockUrl(packed);
    if (!url) continue;
    let kind = streamflixKind(data.type, url);
    if (!isStreamUri(url) && !/\.m3u8(\?|#|$)/i.test(url)) {
      const mp4 = await pickAtlasMp4(url);
      if (mp4) {
        url = mp4;
        kind = streamflixKind(null, mp4);
      } else if (String(name).toLowerCase() === 'atlas') {
        continue;
      }
    }
    sources.push({
      id: `vidrock-${slugId(name)}`,
      name: `${name} (Vidrock)`,
      language: data.language || '',
      kind,
      url,
      subtitles: [],
      extractor: 'vidrock',
    });
    streamflixLog('vidrock: source', name, data.language, kind, shortStreamflixUrl(url));
  }
  return sources;
};

const VIDEASY_SERVERS = [
  { name: 'Neon', endpoint: 'mb-flix' },
  { name: 'Yoru', endpoint: 'cdn', movieOnly: true },
  { name: 'Cypher', endpoint: 'downloader2' },
  { name: 'Sage', endpoint: '1movies' },
  { name: 'Breach', endpoint: 'm4uhd' },
  { name: 'Vyse', endpoint: 'hdmovie' },
];

const listVideasy = (content) => {
  const tmdbId = Number(content.tmdbId);
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) return [];
  const title = encodeURIComponent(content.title || '');
  const year = '';
  const imdb = content.imdbId || '';
  return VIDEASY_SERVERS.filter(
    (s) => !(s.movieOnly && content.mediaType !== 'movie'),
  ).map((s) => {
    const url =
      content.mediaType === 'tv' &&
      content.season != null &&
      content.episode != null
        ? `${VIDEASY_API}/${s.endpoint}/sources-with-title?title=${title}&mediaType=tv&year=${year}&tmdbId=${tmdbId}&imdbId=${imdb}&episodeId=${content.episode}&seasonId=${content.season}`
        : `${VIDEASY_API}/${s.endpoint}/sources-with-title?title=${title}&mediaType=movie&year=${year}&tmdbId=${tmdbId}&imdbId=${imdb}`;
    return {
      id: `videasy-${slugId(s.name)}`,
      name: `${s.name} (Videasy)`,
      language: 'English',
      kind: s.name === 'Cypher' ? 'file' : 'hls',
      url: '',
      subtitles: [],
      extractor: 'videasy',
      extractUrl: url,
    };
  });
};

const extractVideasy = async (source) => {
  if (!source.extractUrl) return null;
  streamflixLog('videasy: GET', source.name);
  const encRes = await streamflixFetch(source.extractUrl, {
    headers: { Referer: 'https://player.videasy.net/', Origin: 'https://player.videasy.net' },
  });
  if (!encRes.ok) {
    streamflixLog('videasy: http', encRes.status);
    return null;
  }
  const encData = await encRes.text();
  const tmdbId = new URL(source.extractUrl).searchParams.get('tmdbId') || '';
  const decRes = await streamflixFetch(VIDEASY_DEC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: encData, id: tmdbId }),
  });
  if (!decRes.ok) {
    streamflixLog('videasy: dec http', decRes.status);
    return null;
  }
  const decJson = await decRes.json();
  const result =
    typeof decJson.result === 'string' ? JSON.parse(decJson.result) : decJson.result;
  const url = result?.sources?.[0]?.url;
  if (!url || !/^https?:\/\//i.test(url)) {
    streamflixLog('videasy: no source', source.name);
    return null;
  }
  const subtitles = (result.subtitles || [])
    .filter((t) => t.url)
    .map((t) => ({ label: t.lang || 'Unknown', file: t.url }));
  streamflixLog('videasy: ok', source.name, shortStreamflixUrl(url), 'subs', subtitles.length);
  return { ...source, url, subtitles };
};

const VIDZEE_SERVERS = [
  { name: 'Nflix', index: 0 },
  { name: 'Duke', index: 1 },
  { name: 'Glory', index: 2 },
  { name: 'Nazy', index: 3 },
  { name: 'Atlas', index: 4 },
  { name: 'Drag', index: 5 },
  { name: 'Achilles', index: 6 },
  { name: 'Viet', index: 7 },
  { name: 'Hindi', index: 9 },
  { name: 'Bengali', index: 10 },
  { name: 'Tamil', index: 11 },
  { name: 'Telugu', index: 12 },
  { name: 'Malayalam', index: 13 },
];

const listVidzee = (content) => {
  const tmdbId = Number(content.tmdbId);
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) return [];
  const base =
    content.mediaType === 'tv' &&
    content.season != null &&
    content.episode != null
      ? `${VIDZEE_PLAYER}/api/server?id=${tmdbId}&ss=${content.season}&ep=${content.episode}`
      : `${VIDZEE_PLAYER}/api/server?id=${tmdbId}`;
  return VIDZEE_SERVERS.map((s) => ({
    id: `vidzee-${slugId(s.name)}`,
    name: `${s.name} (Vidzee)`,
    language: ['Hindi', 'Bengali', 'Tamil', 'Telugu', 'Malayalam'].includes(s.name)
      ? s.name
      : 'English',
    kind: s.name === 'Duke' ? 'file' : 'hls',
    url: '',
    subtitles: [],
    extractor: 'vidzee',
    extractUrl: `${base}&sr=${s.index}`,
  }));
};

let vidzeeMasterKey = '';

const getVidzeeMasterKey = async () => {
  if (vidzeeMasterKey) return vidzeeMasterKey;
  try {
    const res = await streamflixFetch(`${VIDZEE_CORE}/api-key`, {
      headers: { Origin: VIDZEE_PLAYER, Referer: `${VIDZEE_PLAYER}/` },
    });
    if (!res.ok) return null;
    const data = Buffer.from((await res.text()).trim(), 'base64');
    if (data.length < 28) return null;
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const ciphertext = data.subarray(28);
    const key = crypto.createHash('sha256').update(VIDZEE_PASS).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    vidzeeMasterKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      'utf8',
    );
    return vidzeeMasterKey;
  } catch (err) {
    streamflixLog('vidzee: master key fail', err instanceof Error ? err.message : err);
    return null;
  }
};

const decryptVidzeeLink = (encLink, masterKey) => {
  try {
    const decoded = Buffer.from(String(encLink), 'base64').toString('utf8');
    const [ivB64, ctB64] = decoded.split(':');
    if (!ivB64 || !ctB64) return null;
    const iv = Buffer.from(ivB64, 'base64');
    const ciphertext = Buffer.from(ctB64, 'base64');
    const keyBytes = Buffer.alloc(32);
    Buffer.from(String(masterKey), 'utf8').copy(keyBytes);
    const decipher = crypto.createDecipheriv('aes-256-cbc', keyBytes, iv);
    const url = Buffer.concat([decipher.update(ciphertext), decipher.final()])
      .toString('utf8')
      .trim();
    return /^https?:\/\//i.test(url) ? url : null;
  } catch (err) {
    streamflixLog('vidzee: link decrypt fail', err instanceof Error ? err.message : err);
    return null;
  }
};

const extractVidzee = async (source) => {
  if (!source.extractUrl) return null;
  const masterKey = await getVidzeeMasterKey();
  if (!masterKey) return null;
  streamflixLog('vidzee: GET', source.name);
  const res = await streamflixFetch(source.extractUrl, {
    headers: { Origin: VIDZEE_PLAYER, Referer: `${VIDZEE_PLAYER}/` },
  });
  if (!res.ok) {
    streamflixLog('vidzee: http', res.status);
    return null;
  }
  const json = await res.json();
  const encrypted = json.url?.[0]?.link;
  if (!encrypted) return null;
  const url = decryptVidzeeLink(encrypted, masterKey);
  if (!url) return null;
  const subtitles = (json.tracks || [])
    .filter((t) => t.url)
    .map((t) => ({ label: t.lang || 'Unknown', file: t.url }));
  streamflixLog('vidzee: ok', source.name, shortStreamflixUrl(url), 'subs', subtitles.length);
  return { ...source, url, subtitles };
};

const listStreamflixSources = async (content) => {
  streamflixLog(
    'list:',
    content.mediaType,
    content.tmdbId,
    content.mediaType === 'tv' ? `${content.season}x${content.episode}` : 'movie',
  );
  let vidrock = [];
  try {
    vidrock = await listVidrock(content);
  } catch (err) {
    streamflixLog('vidrock: error', err instanceof Error ? err.message : err);
  }
  const sources = [...vidrock, ...listVideasy(content), ...listVidzee(content)];
  streamflixLog(
    'list: ok',
    sources.length,
    sources.map((s) => s.name).join(', ') || '(none)',
  );
  return sources;
};

const resolveStreamflixSource = async (source) => {
  if (source.url) return source;
  try {
    if (source.extractor === 'videasy') return await extractVideasy(source);
    if (source.extractor === 'vidzee') return await extractVidzee(source);
  } catch (err) {
    streamflixLog(
      'resolveSource: error',
      source.name,
      err instanceof Error ? err.message : err,
    );
  }
  return null;
};

const contentFromQuery = (reqUrl) => {
  const tmdbId = Number(reqUrl.searchParams.get('tmdbId'));
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) return null;
  const mediaType = reqUrl.searchParams.get('mediaType') === 'tv' ? 'tv' : 'movie';
  const season = Number(reqUrl.searchParams.get('season'));
  const episode = Number(reqUrl.searchParams.get('episode'));
  const imdbId = String(reqUrl.searchParams.get('imdbId') || '').trim() || null;
  return {
    tmdbId,
    mediaType,
    imdbId,
    ...(mediaType === 'tv' && Number.isFinite(season) && Number.isFinite(episode)
      ? { season, episode }
      : {}),
  };
};

const serveStreamflixForContent = async (content, wantedId, res, room) => {
  if (room) touch(room);
  const extra = room?.playbackOnly ? { session: room.code } : {};
  try {
    const listed = await listStreamflixSources(content);
    if (wantedId) {
      const stub = listed.find((s) => s.id === wantedId);
      if (!stub) {
        res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false }));
        return;
      }
      const resolved = await resolveStreamflixSource(stub);
      if (!resolved?.url) {
        res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false }));
        return;
      }
      if (room) seedSourceHosts(room, resolved);
      streamflixLog(
        'http: source',
        room?.code || 'solo',
        resolved.name,
        shortStreamflixUrl(resolved.url),
      );
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, source: publicSource(resolved), ...extra }));
      return;
    }
    const sources = listed.map(publicSource);
    if (room) {
      for (const source of sources) seedSourceHosts(room, source);
    }
    streamflixLog('http: 200', room?.code || 'solo', sources.length, 'sources');
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, sources, ...extra }));
  } catch (err) {
    streamflixLog('http: 502', err instanceof Error ? err.message : err);
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false }));
  }
};

const serveStreamflixByQuery = async (req, res) => {
  const reqUrl = new URL(req.url || '/', `http://${req.headers.host}`);
  const content = contentFromQuery(reqUrl);
  if (!content) {
    streamflixLog('http: no tmdb query');
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  const session = createPlaybackSession(content);
  await serveStreamflixForContent(content, reqUrl.searchParams.get('source'), res, session);
};

const serveStreamflix = async (code, req, res) => {
  const room = rooms.get(String(code || '').toUpperCase());
  if (!room?.content?.tmdbId) {
    streamflixLog('http: no room/tmdb', code);
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  touch(room);
  const reqUrl = new URL(req.url || '/', `http://${req.headers.host}`);
  await serveStreamflixForContent(
    room.content,
    reqUrl.searchParams.get('source'),
    res,
    room,
  );
};

const videasyCandidates = (content) => {
  const ids = [String(content.tmdbId)];
  if (content.imdbId) ids.push(String(content.imdbId));
  const urls = [];
  for (const id of ids) {
    if (content.mediaType === 'tv' && content.season != null && content.episode != null) {
      urls.push(`https://player.videasy.to/tv/${id}/${content.season}/${content.episode}`);
    } else {
      urls.push(`https://player.videasy.to/movie/${id}`);
    }
  }
  return urls;
};

const probeVideasyUrl = async (href) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(href, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': MEDIA_UA },
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

const serveVideasy = async (code, res) => {
  const room = rooms.get(String(code || '').toUpperCase());
  if (!room?.content) {
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  for (const href of videasyCandidates(room.content)) {
    if (await probeVideasyUrl(href)) {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, url: href }));
      return;
    }
  }
  res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: false }));
};

const serveSubtitle = async (code, req, res) => {
  const room = rooms.get(String(code || '').toUpperCase());
  if (room) touch(room);
  const reqUrl = new URL(req.url || '/', `http://${req.headers.host}`);
  const requested = reqUrl.searchParams.get('u');
  const url = requested || room?.subtitles?.url;
  if (!url) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('No subtitles');
    return;
  }
  if (requested) {
    const host = hostnameOf(requested);
    const published = Boolean(room?.subtitles?.url && room.subtitles.url === requested);
    const allowed =
      published ||
      isStreamflixMediaHost(room, host) ||
      Boolean(host && room?.mediaAllowedHosts?.has(host.toLowerCase()));
    if (!allowed) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Subtitle host not allowed');
      return;
    }
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
  if (isBlockedPrivateHost(parsed.hostname)) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Bad subtitle URL');
    return;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const subHost = parsed.hostname.toLowerCase();
    const streamflix = isStreamflixMediaHost(room, subHost);
    const upstreamHeaders = {
      Accept: 'text/plain, text/vtt, application/x-subrip, */*',
      'User-Agent': MEDIA_UA,
    };
    if (streamflix) {
      upstreamHeaders.Referer = 'https://vidrock.net/';
      upstreamHeaders.Origin = 'https://vidrock.net';
    } else if (room?.source?.referer) {
      upstreamHeaders.Referer = room.source.referer;
      if (room.source.origin) upstreamHeaders.Origin = room.source.origin;
    }
    const upstream = await fetch(url, {
      signal: controller.signal,
      headers: upstreamHeaders,
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

const isAllowedTmdbPath = (pathname) => {
  if (
    pathname === '/trending/movie/week' ||
    pathname === '/trending/tv/week' ||
    pathname === '/discover/movie' ||
    pathname === '/search/multi' ||
    pathname === '/genre/movie/list'
  ) {
    return true;
  }
  return (
    /^\/movie\/\d+$/.test(pathname) ||
    /^\/movie\/\d+\/(videos|credits|similar|images|external_ids|release_dates)$/.test(
      pathname,
    ) ||
    /^\/tv\/\d+$/.test(pathname) ||
    /^\/tv\/\d+\/(videos|credits|similar|images|external_ids|content_ratings)$/.test(
      pathname,
    ) ||
    /^\/tv\/\d+\/season\/\d+$/.test(pathname)
  );
};

const serveTmdb = async (req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status_message: 'Method not allowed' }));
    return;
  }
  if (!TMDB_API_KEY) {
    res.writeHead(503, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status_message: 'TMDB_API_KEY is not configured' }));
    return;
  }
  const reqUrl = new URL(req.url || '/', `http://${req.headers.host}`);
  const tmdbPath = reqUrl.pathname.replace(/^\/tmdb/, '') || '/';
  if (!isAllowedTmdbPath(tmdbPath)) {
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status_message: 'Not found' }));
    return;
  }
  const upstream = new URL(`${TMDB_BASE}${tmdbPath}`);
  for (const [key, value] of reqUrl.searchParams.entries()) {
    if (key === 'api_key') continue;
    upstream.searchParams.set(key, value);
  }
  upstream.searchParams.set('api_key', TMDB_API_KEY);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TMDB_TIMEOUT_MS);
    const upstreamRes = await fetch(upstream, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);
    const body = Buffer.from(await upstreamRes.arrayBuffer());
    res.writeHead(upstreamRes.status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60',
    });
    res.end(body);
  } catch {
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status_message: 'TMDB request failed' }));
  }
};

/** @type {{ at: number, payload: object } | null} */
let appReleaseCache = null;

const findApkAsset = (assets) => {
  const list = Array.isArray(assets) ? assets : [];
  const preferred = list.find(
    (a) =>
      typeof a?.name === 'string' &&
      a.name.endsWith('.apk') &&
      (a.name.includes('release') ||
        a.name.includes('universal') ||
        !a.name.includes('debug')),
  );
  return preferred ?? list.find((a) => typeof a?.name === 'string' && a.name.endsWith('.apk')) ?? null;
};

const serveApp = async (_req, res) => {
  const fallback = {
    ok: true,
    version: null,
    appVersion: APP_VERSION,
    androidApk: null,
    releaseUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
  };
  if (appReleaseCache && Date.now() - appReleaseCache.at < APP_RELEASE_CACHE_MS) {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60',
    });
    res.end(JSON.stringify({ ...appReleaseCache.payload, appVersion: APP_VERSION }));
    return;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const upstream = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      {
        signal: controller.signal,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Flick-Party',
        },
      },
    );
    clearTimeout(timer);
    if (!upstream.ok) {
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=60',
      });
      res.end(JSON.stringify(fallback));
      return;
    }
    const data = await upstream.json();
    const apk = findApkAsset(data.assets);
    const payload = {
      ok: true,
      version: String(data.tag_name || '').replace(/^v/, '') || null,
      appVersion: APP_VERSION,
      androidApk: apk?.browser_download_url || null,
      releaseUrl: data.html_url || fallback.releaseUrl,
    };
    appReleaseCache = { at: Date.now(), payload };
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60',
    });
    res.end(JSON.stringify(payload));
  } catch {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60',
    });
    res.end(JSON.stringify(fallback));
  }
};

const serveStatic = (req, res) => {
  const pathOnly = String(req.url || '/').split('?')[0];
  if (pathOnly === '/health') {
    let parties = 0;
    let playbackSessions = 0;
    for (const room of rooms.values()) {
      if (room.playbackOnly) playbackSessions += 1;
      else parties += 1;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        rooms: rooms.size,
        parties,
        playbackSessions,
        version: APP_VERSION,
      }),
    );
    return;
  }
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (url.pathname.startsWith('/tmdb/') || url.pathname === '/tmdb') {
    void serveTmdb(req, res);
    return;
  }

  if (url.pathname === '/rooms' && req.method === 'GET') {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify({ rooms: publicRoomList() }));
    return;
  }

  if ((url.pathname === '/app' || url.pathname === '/app/') && req.method === 'GET') {
    void serveApp(req, res);
    return;
  }

  const mediaMatch = url.pathname.match(/^\/media\/([A-Za-z0-9]+)\/?$/);
  if (mediaMatch && (req.method === 'GET' || req.method === 'HEAD')) {
    void serveMedia(mediaMatch[1], req, res);
    return;
  }

  if ((url.pathname === '/extract' || url.pathname === '/extract/') && (req.method === 'GET' || req.method === 'POST')) {
    void serveExtract(req, res);
    return;
  }

  if ((url.pathname === '/play' || url.pathname === '/play/') && req.method === 'POST') {
    void servePlayCreate(req, res);
    return;
  }

  const playSourceMatch = url.pathname.match(/^\/play\/([A-Za-z0-9]+)\/source\/?$/);
  if (playSourceMatch && req.method === 'POST') {
    void servePlaySource(playSourceMatch[1], req, res);
    return;
  }

  const playSubtitleMatch = url.pathname.match(/^\/play\/([A-Za-z0-9]+)\/subtitle\/?$/);
  if (playSubtitleMatch && req.method === 'POST') {
    void servePlaySubtitle(playSubtitleMatch[1], req, res);
    return;
  }

  if ((url.pathname === '/wyzie' || url.pathname === '/wyzie/') && req.method === 'GET') {
    void serveWyzieSearch(req, res);
    return;
  }

  if ((url.pathname === '/streamflix' || url.pathname === '/streamflix/') && req.method === 'GET') {
    void serveStreamflixByQuery(req, res);
    return;
  }

  const streamflixMatch = url.pathname.match(/^\/streamflix\/([A-Za-z0-9]+)\/?$/);
  if (streamflixMatch && req.method === 'GET') {
    void serveStreamflix(streamflixMatch[1], req, res);
    return;
  }

  const videasyMatch = url.pathname.match(/^\/videasy\/([A-Za-z0-9]+)\/?$/);
  if (videasyMatch && req.method === 'GET') {
    void serveVideasy(videasyMatch[1], res);
    return;
  }

  const subMatch = url.pathname.match(/^\/subtitle\/([A-Za-z0-9]+)\/?$/);
  if (subMatch && req.method === 'GET') {
    void serveSubtitle(subMatch[1], req, res);
    return;
  }

  const spaPath = url.pathname.replace(/\/+$/, '') || '/';
  const isPartyPage =
    spaPath === '/' ||
    spaPath === '/index.html' ||
    spaPath === '/search' ||
    spaPath === '/join' ||
    /^\/title\/(movie|tv)\/\d+$/.test(spaPath) ||
    /^\/watch\/movie\/\d+$/.test(spaPath) ||
    /^\/watch\/tv\/\d+\/\d+\/\d+$/.test(spaPath) ||
    /^\/p\/[A-Za-z0-9]+$/.test(spaPath);

  const filePath = isPartyPage
    ? path.join(PUBLIC_DIR, 'index.html')
    : path.join(PUBLIC_DIR, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (isPartyPage) {
        res.writeHead(503, { 'content-type': 'text/html; charset=utf-8' });
        res.end(
          '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Flick Watch Party</title></head><body style="font-family:sans-serif;background:#111;color:#eee;padding:2rem"><p>UI not built — run <code>npm run build</code> in party-server (Railway build command).</p></body></html>',
        );
        return;
      }
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
    lastReactionAt.delete(memberId);
    const room = memberRoom(memberId);
    if (!room) return;
    const leavingHost = isHost(room, memberId);
    room.members.delete(memberId);
    const rtcIds = room.rtcMemberIds ?? new Set();
    const wasInCall = rtcIds.delete(memberId);
    room.rtcMemberIds = rtcIds;
    if (room.members.size === 0) {
      destroyRoom(room.code, 'Room empty');
      return;
    }
    if (wasInCall) {
      broadcast(room, { type: 'rtc-peers', ids: [...rtcIds] });
    }
    if (leavingHost) {
      applyHostClock(room, { paused: true });
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
    const hostKey = crypto.randomBytes(16).toString('hex');
    const password = normalizePassword(msg.password);
    const passwordHash = password ? hashPassword(password) : null;
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
      hostKey,
      passwordHash,
      content: {
        tmdbId: content.tmdbId,
        mediaType: content.mediaType === 'tv' ? 'tv' : 'movie',
        title: String(content.title || 'Untitled').slice(0, 200),
        posterPath: content.posterPath ?? null,
        season: content.season,
        episode: content.episode,
        imdbId: content.imdbId ? String(content.imdbId).slice(0, 16) : null,
      },
      clock,
      source: null,
      embedUrl: null,
      subtitles: null,
      mediaAllowedHosts: new Set(),
      streamflixHosts: new Set(),
      browsing: false,
      rtcMemberIds: new Set(),
      members: new Map([[id, host]]),
      lastActive: Date.now(),
    };
    rooms.set(code, room);
    setMemberId(id);
    send(ws, { type: 'created', memberId: id, room: publicRoom(room), hostKey });
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
    const reclaim =
      typeof msg.hostKey === 'string' &&
      msg.hostKey.length > 0 &&
      msg.hostKey === room.hostKey;
    if (room.passwordHash && !reclaim) {
      const password = normalizePassword(msg.password);
      if (!password) throw new Error('Password required');
      if (!verifyPassword(password, room.passwordHash)) {
        throw new Error('Wrong password');
      }
    }
    if (reclaim) room.hostId = id;
    room.members.set(id, {
      id,
      displayName,
      kind,
      role: reclaim ? 'host' : 'guest',
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
    case 'browse':
    case 'content':
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
        room.browsing = false;
        clearRoomPlayback(room);
        touch(room);
        broadcast(room, { type: 'episode', season, episode });
        broadcast(room, { type: 'source', source: null, embedUrl: null });
        broadcast(room, { type: 'subtitles', subtitles: null });
        broadcast(room, { type: 'clock', clock: room.clock });
        broadcast(room, { type: 'state', room: publicRoom(room) });
      }
      if (msg.type === 'browse') {
        room.browsing = true;
        clearRoomPlayback(room);
        touch(room);
        broadcast(room, { type: 'browse' });
        broadcast(room, { type: 'source', source: null, embedUrl: null });
        broadcast(room, { type: 'subtitles', subtitles: null });
        broadcast(room, { type: 'clock', clock: room.clock });
        broadcast(room, { type: 'state', room: publicRoom(room) });
      }
      if (msg.type === 'content') {
        room.content = parsePartyContent(msg.content);
        room.browsing = false;
        clearRoomPlayback(room);
        touch(room);
        broadcast(room, { type: 'content', content: room.content });
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
      const sourceId =
        msg.sourceId != null ? String(msg.sourceId).slice(0, 80) : '';
      const looksHttp = /^https?:\/\//i.test(uri);
      const looksStream = /\.(m3u8|mp4|webm|mkv)(\?|#|$)/i.test(uri);
      // Streamflix Vidrock URLs are often extensionless; sourceId marks them.
      if (!looksHttp || (!looksStream && !sourceId)) {
        throw new Error('Source must be a stream URL (m3u8/mp4), not an embed page');
      }
      const kind = /\.m3u8(\?|#|$)/i.test(uri)
        ? 'hls'
        : msg.kind === 'file'
          ? 'file'
          : 'hls';
      const referer =
        msg.referer != null
          ? String(msg.referer).slice(0, URI_MAX)
          : room.source?.referer;
      const origin =
        msg.origin != null
          ? String(msg.origin).slice(0, URI_MAX)
          : room.source?.origin;
      room.source = {
        uri,
        kind,
        ...(referer ? { referer } : {}),
        ...(origin ? { origin } : {}),
        ...(sourceId ? { sourceId } : {}),
      };
      seedMediaHosts(room, uri);
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
            offsetSeconds: Number.isFinite(Number(msg.subtitles.offsetSeconds))
              ? Number(msg.subtitles.offsetSeconds)
              : 0,
          };
          const subHost = hostnameOf(url);
          if (subHost) allowMediaHost(room, subHost);
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
      if (!host) throw new Error('Host is away');
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
    case 'reaction': {
      const emoji = String(msg.emoji || '').trim();
      if (!PARTY_REACTIONS.has(emoji)) return;
      const now = Date.now();
      const prev = lastReactionAt.get(memberId) ?? 0;
      if (now - prev < REACTION_COOLDOWN_MS) return;
      lastReactionAt.set(memberId, now);
      touch(room);
      broadcast(
        room,
        {
          type: 'reaction',
          from: member.displayName,
          emoji,
          at: now,
        },
        memberId,
      );
      return;
    }
    case 'rtc-join': {
      if (!room.rtcMemberIds) room.rtcMemberIds = new Set();
      room.rtcMemberIds.add(memberId);
      touch(room);
      broadcast(room, { type: 'rtc-peers', ids: [...room.rtcMemberIds] });
      broadcast(room, { type: 'state', room: publicRoom(room) });
      return;
    }
    case 'rtc-leave': {
      if (!room.rtcMemberIds) room.rtcMemberIds = new Set();
      room.rtcMemberIds.delete(memberId);
      touch(room);
      broadcast(room, { type: 'rtc-peers', ids: [...room.rtcMemberIds] });
      broadcast(room, { type: 'state', room: publicRoom(room) });
      return;
    }
    case 'rtc-signal': {
      const to = String(msg.to || '');
      if (!to || to === memberId) return;
      const target = room.members.get(to);
      if (!target) return;
      const payload = msg.payload && typeof msg.payload === 'object' ? msg.payload : {};
      const kind = payload.type;
      if (kind !== 'offer' && kind !== 'answer' && kind !== 'ice') {
        throw new Error('Bad rtc signal');
      }
      const next = { type: kind };
      if (typeof payload.sdp === 'string') next.sdp = payload.sdp.slice(0, 16384);
      if (payload.candidate != null) next.candidate = String(payload.candidate).slice(0, 1024);
      if (payload.sdpMid != null) next.sdpMid = String(payload.sdpMid).slice(0, 32);
      if (payload.sdpMLineIndex != null) {
        const idx = Number(payload.sdpMLineIndex);
        if (Number.isFinite(idx)) next.sdpMLineIndex = idx;
      }
      send(target.ws, { type: 'rtc-signal', from: memberId, payload: next });
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

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[flick-party] listening on :${PORT}`);
});
