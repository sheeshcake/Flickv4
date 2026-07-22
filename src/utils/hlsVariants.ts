/**
 * HLS master-playlist parsing utilities.
 *
 * `expo-video` exposes `videoTrack` as read-only, so we drive the "select
 * a resolution" feature by parsing the master `.m3u8`, listing its variants,
 * and swapping `VideoSource.uri` to a variant's child playlist via
 * `player.replaceAsync(...)`.
 *
 * A master playlist looks like:
 *
 *   #EXTM3U
 *   #EXT-X-STREAM-INF:BANDWIDTH=4200000,RESOLUTION=1920x1080,FRAME-RATE=24
 *   1080p/index.m3u8
 *   #EXT-X-STREAM-INF:BANDWIDTH=2100000,RESOLUTION=1280x720
 *   720p/index.m3u8
 *   ...
 *
 * A media playlist (single-quality) will not contain any `#EXT-X-STREAM-INF`
 * lines, in which case there is nothing to pick between and callers should
 * hide the quality control.
 */

export interface Variant {
  /** Absolute URI of the child playlist for this variant. */
  uri: string;
  /** Native pixel width. */
  width: number;
  /** Native pixel height. */
  height: number;
  /** Peak bandwidth in bits-per-second (from `BANDWIDTH=`). 0 if unknown. */
  bandwidth: number;
  /** Human-readable label, e.g. `"1080p"`, `"720p"`, `"480p"`. */
  label: string;
}

/** Extract a key/value from a `#EXT-X-STREAM-INF` attribute list. */
const attr = (line: string, key: string): string | undefined => {
  // Attributes look like KEY=VALUE where VALUE is either a quoted string or an
  // unquoted token (including WxH resolutions with `x` separator).
  const re = new RegExp(`${key}=("[^"]*"|[^,]+)`, 'i');
  const match = re.exec(line);
  if (!match) return undefined;
  return match[1].replace(/^"|"$/g, '');
};

/**
 * Parse the text of an HLS master playlist into a normalized `Variant[]`.
 *
 * Returns an empty array if the text does not contain any variant streams
 * (e.g. it is already a media playlist), so callers can treat "no variants"
 * as "hide the picker".
 */
export const parseMasterPlaylist = (
  text: string,
  masterUri: string,
): Variant[] => {
  if (!text.startsWith('#EXTM3U')) return [];
  if (!text.includes('#EXT-X-STREAM-INF')) return [];

  const lines = text.split(/\r?\n/);
  const variants: Variant[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('#EXT-X-STREAM-INF')) continue;

    // The URI is the next non-comment, non-empty line.
    let uriLine: string | undefined;
    for (let j = i + 1; j < lines.length; j++) {
      const candidate = lines[j].trim();
      if (!candidate) continue;
      if (candidate.startsWith('#')) continue;
      uriLine = candidate;
      break;
    }
    if (!uriLine) continue;

    const resolution = attr(line, 'RESOLUTION');
    const bandwidth = Number(attr(line, 'BANDWIDTH') ?? '0') || 0;
    let width = 0;
    let height = 0;
    if (resolution) {
      const [w, h] = resolution.toLowerCase().split('x');
      width = Number(w) || 0;
      height = Number(h) || 0;
    }

    let absoluteUri = uriLine;
    try {
      absoluteUri = new URL(uriLine, masterUri).toString();
    } catch {
      // If the master URI isn't parseable (rare), fall back to the raw string.
    }

    const label = height > 0 ? `${height}p` : `${Math.round(bandwidth / 1000)}kbps`;

    variants.push({ uri: absoluteUri, width, height, bandwidth, label });
  }

  // Dedupe by height (keep the highest bandwidth per resolution) and sort
  // tallest -> shortest so the picker reads top-down like YouTube's menu.
  const byHeight = new Map<number, Variant>();
  for (const v of variants) {
    const existing = byHeight.get(v.height);
    if (!existing || v.bandwidth > existing.bandwidth) {
      byHeight.set(v.height, v);
    }
  }

  return Array.from(byHeight.values()).sort((a, b) => b.height - a.height);
};

/**
 * Wall-clock timeout for playlist fetches. React Native's `fetch` has no
 * default timeout, so we belt-and-brace with an `AbortController`.  Without
 * this, a hung CDN would leave a download job stuck at 100% forever waiting
 * on the rewrite step to complete.
 */
const PLAYLIST_FETCH_TIMEOUT_MS = 30_000;

const fetchWithTimeout = async (
  uri: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
  timeoutMs: number = PLAYLIST_FETCH_TIMEOUT_MS,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(uri, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Fetch the given master playlist URI and return the parsed variant list.
 * Returns an empty array on network errors, non-2xx responses, or if the
 * payload is not a master playlist.
 */
export const fetchHlsVariants = async (
  masterUri: string,
  headers?: Record<string, string>,
): Promise<Variant[]> => {
  try {
    const res = await fetchWithTimeout(masterUri, { headers });
    if (!res.ok) return [];
    const text = await res.text();
    return parseMasterPlaylist(text, masterUri);
  } catch {
    return [];
  }
};

// -----------------------------------------------------------------------------
// Media playlist (single variant) parsing — used by the downloader to walk
// every `#EXTINF` segment and any `#EXT-X-KEY` / `#EXT-X-MAP` sidecars, then
// rewrite the URIs so we can play the whole thing back from local disk.
// -----------------------------------------------------------------------------

export interface HlsSegment {
  /** Absolute URI of the segment. */
  uri: string;
  /** Duration in seconds (from `#EXTINF`). 0 if unknown. */
  duration: number;
}

export interface HlsKey {
  /** Encryption method (typically `AES-128`). */
  method: string;
  /** Absolute URI of the key file. */
  uri: string;
  /** Optional IV as a hex string starting with `0x…`. */
  iv?: string;
}

export interface MediaPlaylist {
  segments: HlsSegment[];
  key?: HlsKey;
  /** Absolute URI of a `#EXT-X-MAP:URI="…"` init segment, if present (fMP4). */
  mapInit?: string;
  targetDuration: number;
  totalDuration: number;
}

/**
 * `MediaPlaylist` plus the raw text the parser was given. The downloader
 * needs the original text to rewrite URIs into local paths after every
 * segment lands on disk, and we cache it here so it never has to refetch
 * the playlist (which can hang if the CDN goes cold — the root cause of
 * downloads getting stuck at 100%).
 */
export interface FetchedMediaPlaylist extends MediaPlaylist {
  rawText: string;
}

const resolveUri = (raw: string, baseUri: string): string => {
  try {
    return new URL(raw, baseUri).toString();
  } catch {
    return raw;
  }
};

/**
 * Parse a single-variant media playlist. Absolute URIs are returned for every
 * segment / key / init reference so the downloader doesn't need the original
 * base again. Returns an empty playlist on any parse issue.
 */
export const parseMediaPlaylist = (
  text: string,
  playlistUri: string,
): MediaPlaylist => {
  const segments: HlsSegment[] = [];
  let key: HlsKey | undefined;
  let mapInit: string | undefined;
  let targetDuration = 0;
  let totalDuration = 0;

  if (!text.startsWith('#EXTM3U')) {
    return { segments, key, mapInit, targetDuration, totalDuration };
  }

  const lines = text.split(/\r?\n/);
  let pendingDuration = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXT-X-TARGETDURATION')) {
      const raw = line.split(':')[1];
      targetDuration = Number(raw) || targetDuration;
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      const raw = line.slice(8).split(',')[0];
      pendingDuration = Number(raw) || 0;
      continue;
    }

    if (line.startsWith('#EXT-X-KEY:')) {
      const attrs = line.slice(11);
      const method = attr(attrs, 'METHOD') ?? 'NONE';
      const uriAttr = attr(attrs, 'URI');
      if (method !== 'NONE' && uriAttr) {
        key = {
          method,
          uri: resolveUri(uriAttr, playlistUri),
          iv: attr(attrs, 'IV'),
        };
      } else {
        key = undefined;
      }
      continue;
    }

    if (line.startsWith('#EXT-X-MAP:')) {
      const uriAttr = attr(line.slice(11), 'URI');
      if (uriAttr) mapInit = resolveUri(uriAttr, playlistUri);
      continue;
    }

    if (line.startsWith('#')) continue;

    // Non-comment, non-empty line => segment URI.
    const absoluteUri = resolveUri(line, playlistUri);
    segments.push({ uri: absoluteUri, duration: pendingDuration });
    totalDuration += pendingDuration;
    pendingDuration = 0;
  }

  return { segments, key, mapInit, targetDuration, totalDuration };
};

/**
 * Fetch a media playlist URI, parse it, and return the parsed data plus the
 * raw text.  The raw text lets callers (specifically `DownloadService`)
 * rewrite the playlist to local paths without a second network round trip.
 *
 * Returns an empty playlist on any network / parse error so callers can
 * treat "no segments" as "abort job".
 */
export const fetchMediaPlaylist = async (
  playlistUri: string,
  headers?: Record<string, string>,
): Promise<FetchedMediaPlaylist> => {
  const empty: FetchedMediaPlaylist = {
    segments: [],
    targetDuration: 0,
    totalDuration: 0,
    rawText: '',
  };
  try {
    const res = await fetchWithTimeout(playlistUri, { headers });
    if (!res.ok) return empty;
    const text = await res.text();
    return { ...parseMediaPlaylist(text, playlistUri), rawText: text };
  } catch {
    return empty;
  }
};

/**
 * HEAD-probe every URL in `uris` (in parallel, with a small concurrency cap)
 * and sum up the `Content-Length` headers. Returns `undefined` if we couldn't
 * derive a total (e.g. the server refuses HEAD, or omits `Content-Length` on
 * more than a couple of segments).
 *
 * The caller is responsible for concatenating all segment / key / init URIs
 * into `uris` — this helper doesn't know anything about HLS.
 */
export const probeTotalContentLength = async (
  uris: string[],
  headers?: Record<string, string>,
  concurrency = 8,
): Promise<number | undefined> => {
  if (uris.length === 0) return 0;

  let total = 0;
  let unknown = 0;
  let cursor = 0;

  const runner = async () => {
    while (cursor < uris.length) {
      const my = cursor++;
      const uri = uris[my];
      try {
        // `HEAD` is what we actually want, but some CDNs 405 it. Fall back
        // to a byte-range GET (0-0) which reveals `Content-Range` and never
        // downloads more than a byte.
        let len = await tryHead(uri, headers);
        if (len == null) len = await tryRangeProbe(uri, headers);
        if (len == null || Number.isNaN(len)) {
          unknown++;
        } else {
          total += len;
        }
      } catch {
        unknown++;
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(concurrency, uris.length) },
    () => runner(),
  );
  await Promise.all(workers);

  // If more than a small fraction of probes fail, bail out — a partial total
  // is worse than showing nothing.
  if (unknown > Math.max(2, Math.floor(uris.length * 0.1))) {
    return undefined;
  }
  return total;
};

const tryHead = async (
  uri: string,
  headers?: Record<string, string>,
): Promise<number | null> => {
  const res = await fetch(uri, { method: 'HEAD', headers });
  if (!res.ok) return null;
  const raw = res.headers.get('content-length');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const tryRangeProbe = async (
  uri: string,
  headers?: Record<string, string>,
): Promise<number | null> => {
  const res = await fetch(uri, {
    method: 'GET',
    headers: { ...(headers ?? {}), Range: 'bytes=0-0' },
  });
  // 206 responses expose `Content-Range: bytes 0-0/12345`.
  const cr = res.headers.get('content-range');
  if (cr) {
    const total = cr.split('/').pop();
    if (total && total !== '*') {
      const n = Number(total);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  // 200 responses with the whole body — best-effort, most CDNs skip this.
  const cl = res.headers.get('content-length');
  if (cl && res.status === 200) {
    const n = Number(cl);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
};

/**
 * Rewrite a media playlist's remote URIs to local relative paths so the file
 * can be played from disk.
 *
 * @param text        Original playlist text.
 * @param playlistUri Absolute URI the playlist was fetched from.
 * @param uriMap      Map from absolute remote URI -> local relative path
 *                    (e.g. `"segments/0000.ts"`).
 */
export const rewriteMediaPlaylist = (
  text: string,
  playlistUri: string,
  uriMap: Map<string, string>,
): string => {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];

  for (const raw of lines) {
    const line = raw;
    const trimmed = line.trim();

    if (trimmed.startsWith('#EXT-X-KEY:') || trimmed.startsWith('#EXT-X-MAP:')) {
      const rewritten = line.replace(
        /URI="([^"]+)"/,
        (_m, uri: string) => {
          const abs = resolveUri(uri, playlistUri);
          const local = uriMap.get(abs);
          return `URI="${local ?? uri}"`;
        },
      );
      out.push(rewritten);
      continue;
    }

    if (!trimmed || trimmed.startsWith('#')) {
      out.push(line);
      continue;
    }

    const abs = resolveUri(trimmed, playlistUri);
    const local = uriMap.get(abs);
    out.push(local ?? line);
  }

  return out.join('\n');
};
