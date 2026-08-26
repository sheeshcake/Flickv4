import { FLIXQUEST_CONFIG } from '@/src/config/env';
import type { StreamflixSource, StreamflixSubtitle } from '@/src/services/StreamflixService';

const TAG = '[FlixQuest]';
// eslint-disable-next-line no-console
const log = (...args: unknown[]) => console.log(TAG, ...args);

const PROVIDERS_TIMEOUT_MS = 30000;
const STREAM_TIMEOUT_MS = 60000;

export const FLIXQUEST_SERVER_PREFIX = 'flixquest:';

export interface FlixQuestProvider {
  id: string;
  name: string;
  alias?: string;
  content?: string;
}

export interface FlixQuestStreamRequest {
  providerId: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  full?: boolean;
}

const apiRoot = (): string => {
  const trimmed = FLIXQUEST_CONFIG.url.replace(/\/+$/, '');
  if (!trimmed) throw new Error('Scraper API URL is not configured');
  return trimmed.endsWith('/api/v2') ? trimmed : `${trimmed}/api/v2`;
};

export const flixQuestServerId = (providerId: string): string =>
  `${FLIXQUEST_SERVER_PREFIX}${providerId}`;

export const isFlixQuestServer = (server: {
  resolver?: string;
  id?: string;
}): boolean =>
  server.resolver === 'flixquest' ||
  (server.id?.startsWith(FLIXQUEST_SERVER_PREFIX) ?? false);

export const friendlyScraperError = (error: unknown): string => {
  const raw = (error instanceof Error ? error.message : String(error)).trim();
  const lower = raw.toLowerCase();
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('aborted')) {
    return 'Scraper request timed out';
  }
  if (
    lower.includes('network') ||
    lower.includes('failed to fetch') ||
    lower.includes('network request failed')
  ) {
    return 'Couldn’t reach the scraper. Check your connection and try again.';
  }
  if (/https?:\/\/|uri[=:]|stack/i.test(raw) || raw.length > 140) {
    return 'No streams found for this title';
  }
  return raw || 'No streams found for this title';
};

const parseHeaders = (value: unknown): Record<string, string> | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const headers: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string' && raw.trim()) headers[key] = raw;
  }
  return Object.keys(headers).length ? headers : undefined;
};

const fetchJson = async (
  path: string,
  query?: Record<string, string>,
  timeoutMs = STREAM_TIMEOUT_MS,
): Promise<Record<string, unknown>> => {
  const url = new URL(`${apiRoot()}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  log('GET', url.toString());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    let body: Record<string, unknown> = {};
    try {
      const parsed: unknown = await res.json();
      if (parsed && typeof parsed === 'object') {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      body = {};
    }
    if (!res.ok) {
      throw new Error(messageFrom(body, res.status));
    }
    if (body.success === false) {
      throw new Error(messageFrom(body, res.status));
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
};

const messageFrom = (body: Record<string, unknown>, status: number): string => {
  const error = typeof body.error === 'string' ? body.error : '';
  if (error.trim()) return error;
  const details = typeof body.details === 'string' ? body.details : '';
  if (details.trim()) return details;
  const message = typeof body.message === 'string' ? body.message : '';
  if (message.trim()) return message;
  return `Scraper request failed (HTTP ${status})`;
};

const listProviders = async (): Promise<FlixQuestProvider[]> => {
  const body = await fetchJson('/providers', undefined, PROVIDERS_TIMEOUT_MS);
  const raw = body.providers;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (p): p is Record<string, unknown> =>
        !!p && typeof p === 'object' && (p as { enabled?: unknown }).enabled === true,
    )
    .map((p) => ({
      id: String(p.id ?? ''),
      name: String(p.name ?? 'Unknown provider'),
      alias: typeof p.alias === 'string' ? p.alias : undefined,
      content: typeof p.content === 'string' ? p.content : undefined,
    }))
    .filter((p) => p.id.length > 0);
};

const kindOf = (link: Record<string, unknown>, url: string): 'hls' | 'file' => {
  if (link.isM3U8 === true || link.isDASH === true) return 'hls';
  if (/\.m3u8(\?|#|$)/i.test(url) || /\.mpd(\?|#|$)/i.test(url)) return 'hls';
  return 'file';
};

const mapLink = (
  link: Record<string, unknown>,
  index: number,
  providerId: string,
): StreamflixSource | null => {
  const url = typeof link.url === 'string' ? link.url.trim() : '';
  if (!url) return null;
  const quality = typeof link.quality === 'string' ? link.quality : 'auto';
  const server = typeof link.server === 'string' ? link.server : '';
  const name = [server, quality].filter(Boolean).join(' · ') || quality;
  const headers = parseHeaders(link.headers) ?? {};
  const subtitles: StreamflixSubtitle[] = [];
  const seen = new Set<string>();
  if (Array.isArray(link.subtitles)) {
    for (const raw of link.subtitles) {
      if (!raw || typeof raw !== 'object') continue;
      const sub = raw as Record<string, unknown>;
      const file = typeof sub.file === 'string' ? sub.file : '';
      if (!file) continue;
      const label =
        (typeof sub.label === 'string' && sub.label) ||
        (typeof sub.lang === 'string' && sub.lang) ||
        'Unknown';
      const key = `${file}\0${label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      subtitles.push({ file, label });
    }
  }
  return {
    id: `${providerId}-${index}-${quality}`,
    name,
    kind: kindOf(link, url),
    uri: url,
    headers,
    subtitles,
    extractor: 'flixquest',
  };
};

const listSources = async (
  req: FlixQuestStreamRequest,
): Promise<StreamflixSource[]> => {
  const query: Record<string, string> = {
    tmdbId: String(req.tmdbId),
    provider: req.providerId,
  };
  if (req.full) query.full = 'true';
  const path = req.mediaType === 'tv' ? '/stream-tv' : '/stream-movie';
  if (req.mediaType === 'tv') {
    query.season = String(req.season ?? 1);
    query.episode = String(req.episode ?? 1);
  }
  log('stream', req.mediaType, req.tmdbId, req.providerId);
  const body = await fetchJson(path, query);
  const rawLinks = body.links;
  if (!Array.isArray(rawLinks)) return [];
  return rawLinks
    .map((link, index) =>
      link && typeof link === 'object'
        ? mapLink(link as Record<string, unknown>, index, req.providerId)
        : null,
    )
    .filter((s): s is StreamflixSource => s != null);
};

const resolve = async (
  req: FlixQuestStreamRequest,
): Promise<StreamflixSource | null> => {
  const sources = await listSources(req);
  return sources.find((s) => !!s.uri) ?? null;
};

export const FlixQuestService = {
  listProviders,
  listSources,
  resolve,
};
