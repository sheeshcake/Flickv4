/**
 * Flick watch-party room server.
 * Syncs TMDB identity + a host playback clock. Web companion waterfall:
 * Streamflix (source list) → `/media` proxy → host embed URL.
 *
 * Protocol: keep in sync with `src/party/protocol.ts`.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

const PORT = Number(process.env.PORT) || 8787;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const MAX_MEMBERS = 8;
const IDLE_MS = 30 * 60 * 1000;
const CHAT_MAX = 200;
const REACTION_COOLDOWN_MS = 400;
const PARTY_REACTIONS = new Set(['👍', '❤️', '😂', '😮', '👏', '🎉', '🔥', '😢']);
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
/** @typedef {{ uri: string, kind: 'hls'|'file', referer?: string, origin?: string }} PartySource */
/** @typedef {{ url: string, language: string, display: string, offsetSeconds: number }} PartySubtitles */
/** @typedef {{ id: string, displayName: string, kind: 'player'|'companion', role: 'host'|'guest', buffering: boolean, ws: import('ws').WebSocket }} Member */
/** @typedef {{ code: string, hostId: string, hostKey: string, passwordHash: string|null, content: PartyContent, clock: PartyClock, source: PartySource|null, embedUrl: string|null, subtitles: PartySubtitles|null, browsing: boolean, mediaAllowedHosts: Set<string>, streamflixHosts: Set<string>, members: Map<string, Member>, lastActive: number }} Room */

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
  members: [...room.members.values()].map((m) => ({
    id: m.id,
    displayName: m.displayName,
    kind: m.kind,
    role: m.role,
    buffering: m.buffering,
  })),
});

const publicRoomList = () =>
  [...rooms.values()].map((room) => ({
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

const serveMedia = async (code, req, res) => {
  const room = rooms.get(String(code || '').toUpperCase());
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

    res.writeHead(upstream.status, outHeaders);
    if (req.method === 'HEAD' || !upstream.body) {
      res.end();
      return;
    }
    try {
      if (typeof Readable.fromWeb === 'function') {
        const nodeStream = Readable.fromWeb(upstream.body);
        nodeStream.on('error', () => res.destroy());
        nodeStream.pipe(res);
        return;
      }
    } catch {
      // fall through and buffer
    }
    res.end(Buffer.from(await upstream.arrayBuffer()));
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
    if (
      String(name).toLowerCase() === 'atlas' &&
      !isStreamUri(url) &&
      !/\.m3u8(\?|#|$)/i.test(url)
    ) {
      const mp4 = await pickAtlasMp4(url);
      if (!mp4) continue;
      url = mp4;
      kind = streamflixKind(null, mp4);
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

const serveStreamflix = async (code, req, res) => {
  const room = rooms.get(String(code || '').toUpperCase());
  if (!room?.content?.tmdbId) {
    streamflixLog('http: no room/tmdb', code);
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  try {
    const reqUrl = new URL(req.url || '/', `http://${req.headers.host}`);
    const wantedId = reqUrl.searchParams.get('source');
    const listed = await listStreamflixSources(room.content);
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
      seedSourceHosts(room, resolved);
      streamflixLog('http: source', room.code, resolved.name, shortStreamflixUrl(resolved.url));
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, source: publicSource(resolved) }));
      return;
    }
    const sources = listed.map(publicSource);
    for (const source of sources) seedSourceHosts(room, source);
    streamflixLog('http: 200', room.code, sources.length, 'sources');
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, sources }));
  } catch (err) {
    streamflixLog('http: 502', err instanceof Error ? err.message : err);
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false }));
  }
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
    const allowed =
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

  if (url.pathname === '/rooms' && req.method === 'GET') {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify({ rooms: publicRoomList() }));
    return;
  }

  const mediaMatch = url.pathname.match(/^\/media\/([A-Za-z0-9]+)\/?$/);
  if (mediaMatch && (req.method === 'GET' || req.method === 'HEAD')) {
    void serveMedia(mediaMatch[1], req, res);
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

  const isPartyPage =
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    /^\/p\/[A-Za-z0-9]+\/?$/.test(url.pathname);

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
    if (room.members.size === 0) {
      destroyRoom(room.code, 'Room empty');
      return;
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
      if (!/^https?:\/\//i.test(uri) || !/\.(m3u8|mp4|webm|mkv)(\?|#|$)/i.test(uri)) {
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
