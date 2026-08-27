import { cbc, gcm } from '@noble/ciphers/aes.js';
import { bytesToUtf8, hexToBytes, utf8ToBytes } from '@noble/ciphers/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { isPartyStreamUri, partySourceKind } from '@/src/party/protocol';

const TAG = '[Streamflix]';
// eslint-disable-next-line no-console
const log = (...args: unknown[]) => console.log(TAG, ...args);

const shortUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.slice(0, 120);
  }
};

const MAIN_URL = 'https://vidrock.net';
const STREAM_KEY = hexToBytes(
  '7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f',
);
const REQUEST_TIMEOUT_MS = 15000;
const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';

const VIDEASY_API = 'https://api.videasy.net';
const VIDEASY_DEC = 'https://enc-dec.app/api/dec-videasy';
const VIDZEE_PLAYER = 'https://player.vidzee.wtf';
const VIDZEE_CORE = 'https://core.vidzee.wtf';
const VIDZEE_PASS = '4f2a9c7d1e8b3a6f0d5c2e9a7b1f4d8c';

export const STREAMFLIX_SERVER_ID = 'streamflix';

export const STREAMFLIX_PLAYBACK_HEADERS: Record<string, string> = {
  Referer: `${MAIN_URL}/`,
  Origin: MAIN_URL,
  'User-Agent': USER_AGENT,
};

export interface StreamflixResolveRequest {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  title?: string;
  year?: string;
  imdbId?: string | null;
}

export interface StreamflixSubtitle {
  label: string;
  file: string;
}

export interface StreamflixSource {
  id: string;
  name: string;
  language?: string;
  kind: 'hls' | 'file';
  uri: string;
  headers: Record<string, string>;
  subtitles: StreamflixSubtitle[];
  extractor: 'vidrock' | 'videasy' | 'vidzee' | 'flixquest';
  extractUrl?: string;
}

export interface StreamflixResolvedStream {
  uri: string;
  kind: 'file' | 'hls';
  id?: string;
  name?: string;
  headers?: Record<string, string>;
  subtitles?: StreamflixSubtitle[];
}

interface VidrockSource {
  url?: string | null;
  type?: string | null;
  language?: string | null;
  flag?: string | null;
}

interface AtlasQuality {
  resolution?: number;
  url?: string;
}

const base64ToBytes = (payload: string, urlSafe = false): Uint8Array => {
  const normalized = urlSafe
    ? payload.replace(/-/g, '+').replace(/_/g, '/')
    : payload;
  const padded =
    normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = globalThis.atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
};

const decryptVidrockUrl = (payload: string): string | null => {
  try {
    const packed = base64ToBytes(payload, true);
    if (packed.length < 28) return null;
    const nonce = packed.subarray(0, 12);
    const ciphertextAndTag = packed.subarray(12);
    const url = bytesToUtf8(gcm(STREAM_KEY, nonce).decrypt(ciphertextAndTag)).trim();
    return /^https?:\/\//i.test(url) ? url : null;
  } catch (error) {
    log('decrypt: fail', error instanceof Error ? error.message : error);
    return null;
  }
};

const kindOf = (type: string | null | undefined, url: string): 'hls' | 'file' => {
  if (String(type).toLowerCase() === 'hls' || /\.m3u8(\?|#|$)/i.test(url)) {
    return 'hls';
  }
  return partySourceKind(url);
};

const isEnglish = (language?: string | null, flag?: string | null): boolean => {
  const lang = String(language || '').toLowerCase();
  const fl = String(flag || '').toLowerCase();
  return lang === 'english' || fl === 'us';
};

const streamflixFetch = async (
  url: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        ...init.headers,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const pickAtlasMp4 = async (listUrl: string): Promise<string | null> => {
  try {
    log('atlas: fetch', shortUrl(listUrl));
    const res = await streamflixFetch(listUrl, {
      headers: { Referer: `${MAIN_URL}/`, Origin: MAIN_URL },
    });
    if (!res.ok) {
      log('atlas: http', res.status);
      return null;
    }
    const qualities = (await res.json()) as AtlasQuality[];
    if (!Array.isArray(qualities)) return null;
    const highest = qualities
      .filter((q) => typeof q.url === 'string' && q.url)
      .sort((a, b) => (b.resolution ?? 0) - (a.resolution ?? 0))[0];
    if (!highest?.url || !/^https?:\/\//i.test(highest.url)) return null;
    log('atlas: pick', highest.resolution, shortUrl(highest.url));
    return highest.url;
  } catch (error) {
    log('atlas: error', error instanceof Error ? error.message : error);
    return null;
  }
};

const slugId = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const listVidrock = async (
  req: StreamflixResolveRequest,
): Promise<StreamflixSource[]> => {
  const tmdbId = Number(req.tmdbId);
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) return [];
  const isTv =
    req.mediaType === 'tv' && req.season != null && req.episode != null;
  const apiUrl = isTv
    ? `${MAIN_URL}/api/tv/${tmdbId}/${req.season}/${req.episode}`
    : `${MAIN_URL}/api/movie/${tmdbId}`;
  log('vidrock: GET', apiUrl);
  const res = await streamflixFetch(apiUrl, {
    headers: { Referer: `${MAIN_URL}/`, Origin: MAIN_URL },
  });
  if (!res.ok) {
    log('vidrock: http', res.status);
    return [];
  }
  const body = (await res.json()) as Record<string, VidrockSource>;
  if (!body || typeof body !== 'object') return [];

  const entries = Object.entries(body).sort(([aName, a], [bName, b]) => {
    const aEn = isEnglish(a.language, a.flag) ? 1 : 0;
    const bEn = isEnglish(b.language, b.flag) ? 1 : 0;
    if (aEn !== bEn) return bEn - aEn;
    if (aName.toLowerCase() === 'atlas') return 1;
    if (bName.toLowerCase() === 'atlas') return -1;
    return 0;
  });

  const sources: StreamflixSource[] = [];
  for (const [name, data] of entries) {
    const packed = typeof data?.url === 'string' ? data.url.trim() : '';
    if (!packed) continue;
    let url = decryptVidrockUrl(packed);
    if (!url) continue;
    let kind = kindOf(data.type, url);
    if (!isPartyStreamUri(url) && !/\.m3u8(\?|#|$)/i.test(url)) {
      const mp4 = await pickAtlasMp4(url);
      if (mp4) {
        url = mp4;
        kind = partySourceKind(mp4);
      } else if (name.toLowerCase() === 'atlas') {
        continue;
      }
    }
    const language = data.language || undefined;
    sources.push({
      id: `vidrock-${slugId(name)}`,
      name: `${name} (Vidrock)`,
      language,
      kind,
      uri: url,
      headers: { ...STREAMFLIX_PLAYBACK_HEADERS },
      subtitles: [],
      extractor: 'vidrock',
    });
    log('vidrock: source', name, language, kind, shortUrl(url));
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
] as const;

const listVideasy = (req: StreamflixResolveRequest): StreamflixSource[] => {
  const tmdbId = Number(req.tmdbId);
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) return [];
  const title = encodeURIComponent(req.title || '');
  const year = req.year || '';
  const imdb = req.imdbId || '';
  return VIDEASY_SERVERS.filter(
    (s) => !('movieOnly' in s && s.movieOnly && req.mediaType !== 'movie'),
  ).map((s) => {
    const url =
      req.mediaType === 'tv' && req.season != null && req.episode != null
        ? `${VIDEASY_API}/${s.endpoint}/sources-with-title?title=${title}&mediaType=tv&year=${year}&tmdbId=${tmdbId}&imdbId=${imdb}&episodeId=${req.episode}&seasonId=${req.season}`
        : `${VIDEASY_API}/${s.endpoint}/sources-with-title?title=${title}&mediaType=movie&year=${year}&tmdbId=${tmdbId}&imdbId=${imdb}`;
    return {
      id: `videasy-${slugId(s.name)}`,
      name: `${s.name} (Videasy)`,
      language: 'English',
      kind: s.name === 'Cypher' ? 'file' : 'hls',
      uri: '',
      headers: {
        Referer: 'https://player.videasy.net/',
        Origin: 'https://player.videasy.net',
      },
      subtitles: [],
      extractor: 'videasy' as const,
      extractUrl: url,
    };
  });
};

const extractVideasy = async (
  source: StreamflixSource,
): Promise<StreamflixSource | null> => {
  if (!source.extractUrl) return null;
  log('videasy: GET', source.name);
  const encRes = await streamflixFetch(source.extractUrl);
  if (!encRes.ok) {
    log('videasy: http', encRes.status);
    return null;
  }
  const encData = await encRes.text();
  const tmdbId =
    new URL(source.extractUrl).searchParams.get('tmdbId') || '';
  const decRes = await streamflixFetch(VIDEASY_DEC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: encData, id: tmdbId }),
  });
  if (!decRes.ok) {
    log('videasy: dec http', decRes.status);
    return null;
  }
  const decJson = (await decRes.json()) as { result?: string | object };
  const result =
    typeof decJson.result === 'string'
      ? (JSON.parse(decJson.result) as {
          sources?: { url?: string }[];
          subtitles?: { lang?: string; url?: string }[];
        })
      : (decJson.result as {
          sources?: { url?: string }[];
          subtitles?: { lang?: string; url?: string }[];
        });
  const url = result?.sources?.[0]?.url;
  if (!url || !/^https?:\/\//i.test(url)) {
    log('videasy: no source', source.name);
    return null;
  }
  const subtitles = (result.subtitles ?? [])
    .filter((t) => t.url)
    .map((t) => ({ label: t.lang || 'Unknown', file: t.url as string }));
  log('videasy: ok', source.name, shortUrl(url), 'subs', subtitles.length);
  return {
    ...source,
    uri: url,
    kind: source.kind,
    subtitles,
  };
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
] as const;

const listVidzee = (req: StreamflixResolveRequest): StreamflixSource[] => {
  const tmdbId = Number(req.tmdbId);
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) return [];
  const base =
    req.mediaType === 'tv' && req.season != null && req.episode != null
      ? `${VIDZEE_PLAYER}/api/server?id=${tmdbId}&ss=${req.season}&ep=${req.episode}`
      : `${VIDZEE_PLAYER}/api/server?id=${tmdbId}`;
  return VIDZEE_SERVERS.map((s) => ({
    id: `vidzee-${slugId(s.name)}`,
    name: `${s.name} (Vidzee)`,
    language: ['Hindi', 'Bengali', 'Tamil', 'Telugu', 'Malayalam'].includes(
      s.name,
    )
      ? s.name
      : 'English',
    kind: s.name === 'Duke' ? 'file' : 'hls',
    uri: '',
    headers: {
      Referer: VIDZEE_PLAYER,
      Origin: VIDZEE_PLAYER,
      'User-Agent': USER_AGENT,
    },
    subtitles: [],
    extractor: 'vidzee' as const,
    extractUrl: `${base}&sr=${s.index}`,
  }));
};

let vidzeeMasterKey = '';

const getVidzeeMasterKey = async (): Promise<string | null> => {
  if (vidzeeMasterKey) return vidzeeMasterKey;
  try {
    const res = await streamflixFetch(`${VIDZEE_CORE}/api-key`, {
      headers: { Origin: VIDZEE_PLAYER, Referer: `${VIDZEE_PLAYER}/` },
    });
    if (!res.ok) return null;
    const b64 = (await res.text()).trim();
    const data = base64ToBytes(b64);
    if (data.length < 28) return null;
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const ciphertext = data.subarray(28);
    const key = sha256(utf8ToBytes(VIDZEE_PASS));
    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext);
    combined.set(tag, ciphertext.length);
    vidzeeMasterKey = bytesToUtf8(gcm(key, iv).decrypt(combined));
    return vidzeeMasterKey;
  } catch (error) {
    log('vidzee: master key fail', error instanceof Error ? error.message : error);
    return null;
  }
};

const decryptVidzeeLink = (encLink: string, masterKey: string): string | null => {
  try {
    const decoded = bytesToUtf8(base64ToBytes(encLink));
    const [ivB64, ctB64] = decoded.split(':');
    if (!ivB64 || !ctB64) return null;
    const iv = base64ToBytes(ivB64);
    const ciphertext = base64ToBytes(ctB64);
    const keyBytes = utf8ToBytes(masterKey);
    const paddedKey = new Uint8Array(32);
    paddedKey.set(keyBytes.subarray(0, 32));
    const url = bytesToUtf8(cbc(paddedKey, iv).decrypt(ciphertext)).trim();
    return /^https?:\/\//i.test(url) ? url : null;
  } catch (error) {
    log('vidzee: link decrypt fail', error instanceof Error ? error.message : error);
    return null;
  }
};

const extractVidzee = async (
  source: StreamflixSource,
): Promise<StreamflixSource | null> => {
  if (!source.extractUrl) return null;
  const masterKey = await getVidzeeMasterKey();
  if (!masterKey) return null;
  log('vidzee: GET', source.name);
  const res = await streamflixFetch(source.extractUrl, {
    headers: { Origin: VIDZEE_PLAYER, Referer: `${VIDZEE_PLAYER}/` },
  });
  if (!res.ok) {
    log('vidzee: http', res.status);
    return null;
  }
  const json = (await res.json()) as {
    url?: { link?: string }[];
    tracks?: { url?: string; lang?: string }[];
  };
  const encrypted = json.url?.[0]?.link;
  if (!encrypted) return null;
  const url = decryptVidzeeLink(encrypted, masterKey);
  if (!url) return null;
  const subtitles = (json.tracks ?? [])
    .filter((t) => t.url)
    .map((t) => ({ label: t.lang || 'Unknown', file: t.url as string }));
  log('vidzee: ok', source.name, shortUrl(url), 'subs', subtitles.length);
  return { ...source, uri: url, subtitles };
};

const listSources = async (
  req: StreamflixResolveRequest,
): Promise<StreamflixSource[]> => {
  log(
    'list:',
    req.mediaType,
    req.tmdbId,
    req.mediaType === 'tv' ? `${req.season}x${req.episode}` : 'movie',
  );
  let vidrock: StreamflixSource[] = [];
  try {
    vidrock = await listVidrock(req);
  } catch (error) {
    log('vidrock: error', error instanceof Error ? error.message : error);
  }
  const videasy = listVideasy(req);
  const vidzee = listVidzee(req);
  const sources = [...vidrock, ...videasy, ...vidzee];
  log(
    'list: ok',
    sources.length,
    sources.map((s) => s.name).join(', ') || '(none)',
  );
  return sources;
};

const resolveSource = async (
  source: StreamflixSource,
): Promise<StreamflixSource | null> => {
  if (source.uri) return source;
  try {
    if (source.extractor === 'videasy') return await extractVideasy(source);
    if (source.extractor === 'vidzee') return await extractVidzee(source);
  } catch (error) {
    log('resolveSource: error', source.name, error instanceof Error ? error.message : error);
  }
  return null;
};

const resolve = async (
  req: StreamflixResolveRequest,
): Promise<StreamflixResolvedStream | null> => {
  const sources = await listSources(req);
  for (const source of sources) {
    const resolved = await resolveSource(source);
    if (resolved?.uri) {
      return {
        uri: resolved.uri,
        kind: resolved.kind,
        id: resolved.id,
        name: resolved.name,
        headers: resolved.headers,
        subtitles: resolved.subtitles,
      };
    }
  }
  return null;
};

export const isStreamflixServer = (server: {
  resolver?: string;
  id?: string;
}): boolean =>
  server.resolver === 'streamflix' || server.id === STREAMFLIX_SERVER_ID;

export const StreamflixService = {
  listSources,
  resolveSource,
  resolve,
};
