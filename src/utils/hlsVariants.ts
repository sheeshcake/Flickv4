/**
 * HLS master-playlist parsing utilities.
 *
 * Quality selection stays on the master playlist. Android pins a rendition
 * with `selectedVideoTrack` (RESOLUTION / AUTO); iOS uses `maxBitRate`.
 * Swapping `source.uri` to a variant child playlist drops demuxed AUDIO
 * groups (`#EXT-X-MEDIA:TYPE=AUDIO`) — Auto has sound, 1080p does not.
 * Do not rewrite or locally host a filtered master (iOS cannot play
 * `file://` HLS).
 *
 * A master playlist looks like:
 *
 *   #EXTM3U
 *   #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",URI="audio.m3u8"
 *   #EXT-X-STREAM-INF:BANDWIDTH=4200000,RESOLUTION=1920x1080,AUDIO="aac"
 *   1080p/index.m3u8
 *   #EXT-X-STREAM-INF:BANDWIDTH=2100000,RESOLUTION=1280x720,AUDIO="aac"
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
  /** Raw `CODECS=` list from `#EXT-X-STREAM-INF`, if present. */
  codecs?: string;
}

/**
 * Lower is more likely to decode on Android MediaCodec without FFmpeg.
 * AVC first, then HEVC, then Dolby Vision / unknown.
 */
export const codecRank = (codecs?: string): number => {
  const c = (codecs ?? '').toLowerCase();
  if (c.includes('avc1') || c.includes('avc3')) return 0;
  if (c.includes('dvh1') || c.includes('dvhe') || c.includes('dvav')) return 2;
  if (c.includes('hev1') || c.includes('hvc1')) return 1;
  return 1;
};

/** Prefer AVC over HEVC/DV; same rank keeps the higher bandwidth. */
export const isPreferredVariant = (
  candidate: Variant,
  existing: Variant,
): boolean => {
  const rankA = codecRank(candidate.codecs);
  const rankB = codecRank(existing.codecs);
  if (rankA !== rankB) return rankA < rankB;
  return candidate.bandwidth > existing.bandwidth;
};

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

    const codecs = attr(line, 'CODECS');
    const label = height > 0 ? `${height}p` : `${Math.round(bandwidth / 1000)}kbps`;

    variants.push({
      uri: absoluteUri,
      width,
      height,
      bandwidth,
      label,
      codecs,
    });
  }

  // Dedupe by height: prefer AVC over HEVC/DV so Android offline playback
  // does not pick a 10-bit HDR rendition the OEM decoder cannot handle.
  const byHeight = new Map<number, Variant>();
  for (const v of variants) {
    const existing = byHeight.get(v.height);
    if (!existing || isPreferredVariant(v, existing)) {
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
  /** Last `#EXT-X-KEY` seen (compat). Prefer `keys` for downloads. */
  key?: HlsKey;
  /** Last `#EXT-X-MAP` seen (compat). Prefer `mapInits` for downloads. */
  mapInit?: string;
  /** Every encryption key in playlist order (key rotation). */
  keys: HlsKey[];
  /** Every fMP4 init URI in playlist order. */
  mapInits: string[];
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
  const keys: HlsKey[] = [];
  const mapInits: string[] = [];
  let key: HlsKey | undefined;
  let mapInit: string | undefined;
  let targetDuration = 0;
  let totalDuration = 0;

  if (!text.startsWith('#EXTM3U')) {
    return { segments, key, mapInit, keys, mapInits, targetDuration, totalDuration };
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
        if (!keys.some((k) => k.uri === key!.uri && k.method === key!.method)) {
          keys.push(key);
        }
      } else {
        key = undefined;
      }
      continue;
    }

    if (line.startsWith('#EXT-X-MAP:')) {
      const uriAttr = attr(line.slice(11), 'URI');
      if (uriAttr) {
        mapInit = resolveUri(uriAttr, playlistUri);
        if (!mapInits.includes(mapInit)) mapInits.push(mapInit);
      }
      continue;
    }

    if (line.startsWith('#')) continue;

    // Non-comment, non-empty line => segment URI.
    const absoluteUri = resolveUri(line, playlistUri);
    segments.push({ uri: absoluteUri, duration: pendingDuration });
    totalDuration += pendingDuration;
    pendingDuration = 0;
  }

  return { segments, key, mapInit, keys, mapInits, targetDuration, totalDuration };
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
    keys: [],
    mapInits: [],
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

const isRemoteHttpUri = (uri: string): boolean =>
  /^https?:\/\//i.test(uri.trim());

export interface RewriteMediaPlaylistResult {
  playlist: string;
  leftoverRemoteUris: string[];
}

/**
 * Rewrite a media playlist's remote URIs to **relative** local paths
 * (`segments/00000.ts`) so a loopback HTTP server (iOS) and file:// HLS
 * (Android) can both resolve them next to `local.m3u8`.
 *
 * Quoted and unquoted `URI=` attributes on `#EXT-X-KEY` / `#EXT-X-MAP`
 * are rewritten. Any remote URL that is not in `uriMap` is recorded in
 * `leftoverRemoteUris` so the downloader can fail the job instead of
 * marking a still-online playlist as complete.
 *
 * Appends `#EXT-X-ENDLIST` when missing so AVPlayer treats the file as VOD
 * rather than waiting on a live window.
 *
 * @param text        Original playlist text.
 * @param playlistUri Absolute URI the playlist was fetched from.
 * @param uriMap      Map from absolute remote URI -> relative local path
 *                    (e.g. `"segments/00000.ts"`).
 */
export const rewriteMediaPlaylist = (
  text: string,
  playlistUri: string,
  uriMap: Map<string, string>,
): RewriteMediaPlaylistResult => {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  const leftoverRemoteUris: string[] = [];
  let hasEndList = false;

  const rememberLeftover = (uri: string) => {
    if (isRemoteHttpUri(uri) && !leftoverRemoteUris.includes(uri)) {
      leftoverRemoteUris.push(uri);
    }
  };

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed === '#EXT-X-ENDLIST') hasEndList = true;

    if (trimmed.startsWith('#EXT-X-KEY:') || trimmed.startsWith('#EXT-X-MAP:')) {
      const rewritten = raw.replace(
        /URI=("([^"]*)"|([^,"\s]+))/i,
        (_m, _all: string, quoted?: string, unquoted?: string) => {
          const original = quoted ?? unquoted ?? '';
          const abs = resolveUri(original, playlistUri);
          const local = uriMap.get(abs);
          if (local) return `URI="${local}"`;
          rememberLeftover(abs);
          rememberLeftover(original);
          return `URI="${original}"`;
        },
      );
      out.push(rewritten);
      continue;
    }

    if (!trimmed || trimmed.startsWith('#')) {
      out.push(raw);
      continue;
    }

    const abs = resolveUri(trimmed, playlistUri);
    const local = uriMap.get(abs);
    if (local) {
      out.push(local);
    } else {
      rememberLeftover(abs);
      rememberLeftover(trimmed);
      out.push(raw);
    }
  }

  if (!hasEndList) out.push('#EXT-X-ENDLIST');

  return { playlist: out.join('\n'), leftoverRemoteUris };
};

/**
 * Rewrite relative HLS paths (`segments/00000.ts`, `URI="segments/key-0.bin"`)
 * to absolute `file://` URIs next to `playlistFileUri`. ExoPlayer's
 * FileDataSource + AES-128 is unreliable with relative paths. Already-absolute
 * `file:` / `http:` URIs are left alone.
 */
export const toAbsoluteFilePlaylist = (
  text: string,
  playlistFileUri: string,
): string => {
  const dir = playlistFileUri.replace(/\/[^/]*$/, '');
  const abs = (rel: string): string => {
    const trimmed = rel.trim();
    if (/^(file|https?):/i.test(trimmed)) return trimmed;
    const cleaned = trimmed.replace(/^\.\//, '');
    return `${dir}/${cleaned}`;
  };

  return text
    .split(/\r?\n/)
    .map((raw) => {
      const trimmed = raw.trim();
      if (trimmed.startsWith('#EXT-X-KEY:') || trimmed.startsWith('#EXT-X-MAP:')) {
        return raw.replace(
          /URI=("([^"]*)"|([^,"\s]+))/i,
          (_m, _all: string, quoted?: string, unquoted?: string) => {
            const original = quoted ?? unquoted ?? '';
            return `URI="${abs(original)}"`;
          },
        );
      }
      if (!trimmed || trimmed.startsWith('#')) return raw;
      return abs(trimmed);
    })
    .join('\n');
};

