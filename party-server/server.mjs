/**
 * Flick watch-party room server.
 * Syncs TMDB identity + a host playback clock. Web companion waterfall:
 * original host URI → `/media` proxy → Moviebox → host embed URL.
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
/** @typedef {{ code: string, hostId: string, hostKey: string, passwordHash: string|null, content: PartyContent, clock: PartyClock, source: PartySource|null, embedUrl: string|null, subtitles: PartySubtitles|null, mediaAllowedHosts: Set<string>, members: Map<string, Member>, lastActive: number }} Room */

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
};

const allowMediaHost = (room, hostname) => {
  if (!hostname) return;
  if (!room.mediaAllowedHosts) room.mediaAllowedHosts = new Set();
  room.mediaAllowedHosts.add(hostname.toLowerCase());
};

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
  const rewriteAbs = (raw) => {
    const abs = resolveAgainst(playlistUrl, raw);
    if (!abs) return raw;
    const host = hostnameOf(abs);
    if (host) allowMediaHost(room, host);
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
  if (!room?.source?.uri || !room.source.referer) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('No stream');
    return;
  }
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
  if (isBlockedPrivateHost(host) || !room.mediaAllowedHosts?.has(host)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Host not allowed');
    return;
  }

  const playlistHint = looksLikePlaylistUrl(parsed);
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
      Referer: room.source.referer,
    };
    if (room.source.origin) upstreamHeaders.Origin = room.source.origin;
    if (req.headers.range) upstreamHeaders.Range = req.headers.range;

    const upstream = await fetch(parsed.href, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: upstreamHeaders,
      signal: controller.signal,
      redirect: 'follow',
    });
    const finalHost = hostnameOf(upstream.url);
    if (finalHost) allowMediaHost(room, finalHost);

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

const MOVIEBOX_API = 'https://h5-api.aoneroom.com/wefeed-h5api-bff';
const MOVIEBOX_STREAM = 'https://h5.aoneroom.com/wefeed-h5-bff';
const MOVIEBOX_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  Referer: 'https://moviebox.ph/',
  Origin: 'https://moviebox.ph',
  'X-Client-Info': '{"timezone":"Asia/Dhaka"}',
  'X-Request-Lang': 'en',
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

/** @type {{ token: string, at: number }} */
const movieboxAuth = { token: '', at: 0 };

const movieboxLog = (...args) => console.log('[Moviebox]', ...args);

const clientIpFromReq = (req) => {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  if (Array.isArray(fwd) && fwd[0]) {
    return String(fwd[0]).split(',')[0].trim();
  }
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim();
  return req.socket?.remoteAddress || '';
};

const geoHeaders = (clientIp) => {
  if (!clientIp) return {};
  return { 'X-Forwarded-For': clientIp, 'X-Real-IP': clientIp };
};

const shortMovieboxUrl = (url) => {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(url).slice(0, 120);
  }
};

const movieboxFetch = async (url, init = {}, timeoutMs = 15000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const getMovieboxToken = async (clientIp = '') => {
  if (movieboxAuth.token && Date.now() - movieboxAuth.at < 25 * 60 * 1000) {
    movieboxLog('token: cached');
    return movieboxAuth.token;
  }
  movieboxLog('token: fetching guest JWT');
  const resp = await movieboxFetch(`${MOVIEBOX_API}/home?host=moviebox.ph`, {
    headers: { ...MOVIEBOX_HEADERS, ...geoHeaders(clientIp) },
  });
  const xUser = resp.headers.get('x-user');
  if (xUser) {
    try {
      movieboxAuth.token = JSON.parse(xUser).token || '';
    } catch {
      movieboxAuth.token = '';
    }
  }
  movieboxAuth.at = Date.now();
  movieboxLog(movieboxAuth.token ? 'token: acquired' : 'token: missing');
  return movieboxAuth.token;
};

const normalizeTitle = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\bs\d+(?:\s*-\s*s\d+)?\b/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const parseSeasonTag = (title) => {
  const range = String(title).match(/\bS(\d+)\s*-\s*S(\d+)\b/i);
  if (range) {
    return { from: Number(range[1]), to: Number(range[2]), exact: null };
  }
  const exact = String(title).match(/\bS(\d+)\b/i);
  if (exact) {
    const n = Number(exact[1]);
    return { from: n, to: n, exact: n };
  }
  return { from: null, to: null, exact: null };
};

const scoreMovieboxItem = (item, content) => {
  const want = normalizeTitle(content.title);
  const got = normalizeTitle(item.title);
  if (!want || !got) return 0;
  let score = 0;
  if (got === want) score += 100;
  else if (got.includes(want) || want.includes(got)) score += 70;
  else {
    const wantTokens = new Set(want.split(' ').filter(Boolean));
    const gotTokens = got.split(' ').filter(Boolean);
    const overlap = gotTokens.filter((t) => wantTokens.has(t)).length;
    if (overlap === 0) return 0;
    score += (overlap / Math.max(wantTokens.size, gotTokens.length)) * 50;
  }
  const isTv = content.mediaType === 'tv';
  if (isTv && item.subjectType === 2) score += 20;
  if (!isTv && item.subjectType === 1) score += 20;
  const title = String(item.title || '');
  if (/\[english\]/i.test(title)) score += 15;
  if (/\[(hindi|tagalog|tamil|telugu|spanish|french)\]/i.test(title)) score -= 25;
  if (isTv && content.season != null) {
    const tag = parseSeasonTag(title);
    if (tag.exact === content.season) score += 40;
    else if (
      tag.from != null &&
      content.season >= tag.from &&
      content.season <= tag.to
    ) {
      score += 25;
    }
  }
  return score;
};

const movieboxPlayParams = (item, content) => {
  if (content.mediaType !== 'tv') return { se: 0, ep: 0 };
  const episode = Number(content.episode) || 1;
  const season = Number(content.season) || 1;
  const tag = parseSeasonTag(item.title);
  if (tag.exact != null) return { se: 1, ep: episode };
  return { se: season, ep: episode };
};

const pickMovieboxStream = (data) => {
  const streams = (data?.streams || []).filter((s) => s?.url);
  streams.sort(
    (a, b) => Number(b.resolutions || 0) - Number(a.resolutions || 0),
  );
  if (streams[0]) {
    const url = String(streams[0].url);
    const format = String(streams[0].format || '');
    const kind =
      /\.m3u8(\?|#|$)/i.test(url) || /m3u8|hls/i.test(format) ? 'hls' : 'file';
    return { url, kind };
  }
  const hls = (data?.hls || []).find((h) => h?.url || h?.src);
  if (hls) return { url: String(hls.url || hls.src), kind: 'hls' };
  return null;
};

const searchMoviebox = async (content, clientIp = '') => {
  const token = await getMovieboxToken(clientIp);
  const headers = {
    ...MOVIEBOX_HEADERS,
    ...geoHeaders(clientIp),
    Authorization: token ? `Bearer ${token}` : '',
  };
  let best = null;
  let bestScore = 0;
  for (let page = 1; page <= 3; page++) {
    movieboxLog('search: page', page, `"${content.title}"`);
    const resp = await movieboxFetch(`${MOVIEBOX_API}/subject/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        keyword: content.title,
        page,
        perPage: 20,
      }),
    });
    if (!resp.ok) {
      movieboxLog('search: page', page, 'failed', resp.status);
      break;
    }
    const json = await resp.json();
    const items = json?.data?.items || json?.data?.list || [];
    movieboxLog('search: page', page, 'hits', items.length);
    if (!items.length) break;
    for (const raw of items) {
      const item = raw?.subject && raw.subject.title ? raw.subject : raw;
      if (!item?.subjectId || !item?.detailPath) continue;
      const score = scoreMovieboxItem(item, content);
      if (score > bestScore) {
        best = item;
        bestScore = score;
        movieboxLog('search: best so far', item.title, `score=${Math.round(score)}`);
      }
    }
    if (bestScore >= 120) break;
  }
  if (bestScore >= 70 && best) {
    movieboxLog(
      'search: matched',
      best.title,
      `score=${Math.round(bestScore)}`,
      best.detailPath,
    );
    return best;
  }
  movieboxLog(
    'search: no match',
    `"${content.title}"`,
    `bestScore=${Math.round(bestScore)}`,
  );
  return null;
};

const playMoviebox = async (item, content, clientIp = '') => {
  const { se, ep } = movieboxPlayParams(item, content);
  movieboxLog('play:', item.title, `se=${se}`, `ep=${ep}`, item.detailPath);
  const playUrl =
    `${MOVIEBOX_STREAM}/web/subject/play?subjectId=${encodeURIComponent(item.subjectId)}` +
    `&se=${se}&ep=${ep}&detailPath=${encodeURIComponent(item.detailPath)}`;
  const playerUrl =
    `https://netfilm.world/spa/videoPlayPage/movies/${item.detailPath}` +
    `?id=${item.subjectId}&type=/movie/detail&detailSe=${se}&detailEp=${ep}&lang=en`;
  const resp = await movieboxFetch(playUrl, {
    headers: {
      'User-Agent': MOVIEBOX_HEADERS['User-Agent'],
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      Origin: 'https://h5.aoneroom.com',
      Referer: `https://h5.aoneroom.com/spa/videoPlayPage/movies/${item.detailPath}?id=${item.subjectId}&type=/movie/detail&detailSe=${se}&detailEp=${ep}&lang=en`,
      ...geoHeaders(clientIp),
    },
  });
  if (!resp.ok) {
    movieboxLog('play: failed', resp.status);
    return { playerUrl, stream: null };
  }
  const json = await resp.json();
  const stream = pickMovieboxStream(json?.data);
  if (stream) {
    const resolutions = (json?.data?.streams || [])
      .map((s) => s.resolutions)
      .filter(Boolean);
    movieboxLog(
      'play: stream',
      stream.kind,
      resolutions.length ? `qualities=${resolutions.join(',')}` : '',
      shortMovieboxUrl(stream.url),
    );
  } else {
    movieboxLog('play: no stream on subject', item.subjectId);
  }
  return { playerUrl, stream };
};

const resolveMoviebox = async (content, clientIp = '') => {
  movieboxLog(
    'resolve:',
    content.mediaType,
    `"${content.title}"`,
    content.mediaType === 'tv'
      ? `S${content.season ?? '?'}E${content.episode ?? '?'}`
      : '',
    clientIp ? `ip=${clientIp}` : '',
  );
  const item = await searchMoviebox(content, clientIp);
  if (!item) {
    movieboxLog('resolve: no match');
    return null;
  }
  const { playerUrl, stream } = await playMoviebox(item, content, clientIp);
  movieboxLog(stream?.url ? 'resolve: ok' : 'resolve: player page only');
  return {
    url: stream?.url || null,
    kind: stream?.kind || 'file',
    playerUrl,
  };
};

const serveMoviebox = async (code, req, res) => {
  const room = rooms.get(String(code || '').toUpperCase());
  if (!room?.content?.title) {
    movieboxLog('http: no room/title', code);
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  const clientIp = clientIpFromReq(req);
  try {
    const resolved = await resolveMoviebox(room.content, clientIp);
    if (!resolved?.url && !resolved?.playerUrl) {
      movieboxLog('http: 404', room.code, room.content.title);
      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    movieboxLog(
      'http: 200',
      room.code,
      resolved.url ? 'file' : 'iframe',
      resolved.kind,
    );
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, ...resolved }));
  } catch (err) {
    movieboxLog('http: 502', err instanceof Error ? err.message : err);
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

  const movieboxMatch = url.pathname.match(/^\/moviebox\/([A-Za-z0-9]+)\/?$/);
  if (movieboxMatch && req.method === 'GET') {
    void serveMoviebox(movieboxMatch[1], req, res);
    return;
  }

  const videasyMatch = url.pathname.match(/^\/videasy\/([A-Za-z0-9]+)\/?$/);
  if (videasyMatch && req.method === 'GET') {
    void serveVideasy(videasyMatch[1], res);
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
        room.mediaAllowedHosts = new Set();
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
