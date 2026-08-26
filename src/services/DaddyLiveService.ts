import AsyncStorage from '@react-native-async-storage/async-storage';
import { FLIXQUEST_CONFIG } from '@/src/config/env';

const TAG = '[LiveTV]';
// eslint-disable-next-line no-console
const log = (...args: unknown[]) => console.log(TAG, ...args);

const CATALOG_CACHE_KEY = 'flick.liveTv.catalog';
const FAVORITES_KEY = 'flick.liveTv.favorites';
const RECENTS_KEY = 'flick.liveTv.recents';
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_RECENTS = 20;

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
const SITE_REFERER = 'https://dlhd.st/';

const ALLOWED_HEADER_NAMES: Record<string, string> = {
  accept: 'Accept',
  origin: 'Origin',
  referer: 'Referer',
  'user-agent': 'User-Agent',
};

export interface LiveChannel {
  id: string;
  name: string;
  letter?: string;
  watchUrl?: string;
  playerUrl?: string;
  categories: string[];
  eventTitles: string[];
  nowPlaying?: string;
  nextUp?: string;
}

export interface LiveEpgChannel {
  id: string;
  name: string;
  watchUrl?: string;
}

export interface LiveEpgEvent {
  id?: string;
  time: string;
  title: string;
  startsAt?: string;
  channels: LiveEpgChannel[];
}

export interface LiveEpgCategory {
  name: string;
  slug?: string;
  events: LiveEpgEvent[];
}

export interface LiveEpgDay {
  date?: string;
  label: string;
  categories: LiveEpgCategory[];
}

export interface LiveEpg {
  timezone: string;
  days: LiveEpgDay[];
}

export interface LiveCatalog {
  channels: LiveChannel[];
  epg: LiveEpg;
  categories: string[];
  fetchedAt: number;
}

export interface LiveStream {
  url: string;
  headers: Record<string, string>;
  embedUrl: string;
  expiresAt?: string;
}

const apiRoot = (): string => {
  const trimmed = FLIXQUEST_CONFIG.url.replace(/\/+$/, '');
  if (!trimmed) throw new Error('Live TV is not configured');
  return trimmed.endsWith('/api/v2') ? trimmed : `${trimmed}/api/v2`;
};

export const friendlyLiveTvError = (error: unknown): string => {
  const unavailable = 'Live TV is temporarily unavailable. Please try again.';
  const raw = (error instanceof Error ? error.message : String(error)).trim();
  if (!raw) return unavailable;
  const lower = raw.toLowerCase();
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('aborted')) {
    return 'Live TV is taking too long to respond. Please try again.';
  }
  if (
    lower.includes('network') ||
    lower.includes('failed to fetch') ||
    lower.includes('network request failed')
  ) {
    return 'Couldn’t connect to Live TV. Check your internet connection and try again.';
  }
  if (
    lower.includes('json') ||
    lower.includes('invalid data') ||
    lower.includes('unexpected response')
  ) {
    return 'Live TV returned an invalid response. Please try again later.';
  }
  if (/https?:\/\/|uri[=:]|flixquest/i.test(raw) || raw.length > 140) {
    return unavailable;
  }
  return raw;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const strList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];

const parseChannel = (raw: unknown): LiveChannel | null => {
  const json = asRecord(raw);
  if (!json) return null;
  const id = String(json.id ?? '');
  const name = String(json.name ?? '');
  if (!id || !name) return null;
  return {
    id,
    name,
    letter: typeof json.letter === 'string' ? json.letter : undefined,
    watchUrl: typeof json.watchUrl === 'string' ? json.watchUrl : undefined,
    playerUrl: typeof json.playerUrl === 'string' ? json.playerUrl : undefined,
    categories: strList(json.categories),
    eventTitles: strList(json.eventTitles),
    nowPlaying: typeof json.nowPlaying === 'string' ? json.nowPlaying : undefined,
    nextUp: typeof json.nextUp === 'string' ? json.nextUp : undefined,
  };
};

const parseEpgChannel = (raw: unknown): LiveEpgChannel | null => {
  const json = asRecord(raw);
  if (!json) return null;
  const id = String(json.id ?? '');
  const name = String(json.name ?? '');
  if (!id || !name) return null;
  return {
    id,
    name,
    watchUrl: typeof json.watchUrl === 'string' ? json.watchUrl : undefined,
  };
};

const parseEvent = (raw: unknown): LiveEpgEvent | null => {
  const json = asRecord(raw);
  if (!json) return null;
  return {
    id: typeof json.id === 'string' ? json.id : undefined,
    time: String(json.time ?? ''),
    title: String(json.title ?? ''),
    startsAt: typeof json.startsAt === 'string' ? json.startsAt : undefined,
    channels: Array.isArray(json.channels)
      ? json.channels
          .map(parseEpgChannel)
          .filter((c): c is LiveEpgChannel => c != null)
      : [],
  };
};

const parseEpg = (body: Record<string, unknown>): LiveEpg => {
  const daysRaw = Array.isArray(body.days) ? body.days : [];
  const days: LiveEpgDay[] = [];
  for (const dayRaw of daysRaw) {
    const day = asRecord(dayRaw);
    if (!day) continue;
    const categories: LiveEpgCategory[] = [];
    const catsRaw = Array.isArray(day.categories) ? day.categories : [];
    for (const catRaw of catsRaw) {
      const cat = asRecord(catRaw);
      if (!cat) continue;
      const events = (Array.isArray(cat.events) ? cat.events : [])
        .map(parseEvent)
        .filter((event): event is LiveEpgEvent => event != null);
      categories.push({
        name: String(cat.name ?? 'Other'),
        slug: typeof cat.slug === 'string' ? cat.slug : undefined,
        events,
      });
    }
    days.push({
      date: typeof day.date === 'string' ? day.date : undefined,
      label: String(day.label ?? ''),
      categories,
    });
  }
  return {
    timezone: typeof body.timezone === 'string' ? body.timezone : '',
    days,
  };
};

const getJson = async (
  path: string,
  query?: Record<string, string>,
  timeoutMs = 60000,
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
      throw new Error('The live TV service returned invalid data.');
    }
    if (!res.ok) {
      const message =
        (typeof body.message === 'string' && body.message) ||
        (typeof body.error === 'string' && body.error) ||
        `Live TV request failed (${res.status}).`;
      throw new Error(message);
    }
    if (body.success === false) {
      throw new Error(
        (typeof body.message === 'string' && body.message) ||
          'Live TV request failed.',
      );
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
};

const playbackHeaders = (
  headers: Record<string, string>,
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const name = ALLOWED_HEADER_NAMES[key.trim().toLowerCase()];
    const trimmed = value.trim();
    if (name && trimmed) result[name] = trimmed;
  }
  return result;
};

const parseStream = (body: Record<string, unknown>): LiveStream => {
  const stream = asRecord(body.stream) ?? body;
  const rawHeaders = asRecord(stream.headers) ?? {};
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (typeof value === 'string') headers[key] = value;
  }
  return {
    url: String(stream.url ?? ''),
    headers: playbackHeaders(headers),
    embedUrl: String(stream.embedUrl ?? ''),
    expiresAt: typeof stream.expiresAt === 'string' ? stream.expiresAt : undefined,
  };
};

const extractM3u8Urls = (html: string, pageUrl: string): string[] => {
  const candidates: string[] = [];
  const atobPattern = /atob\(\s*['"]([^'"]+)['"]\s*\)/gi;
  for (const match of html.matchAll(atobPattern)) {
    try {
      const decoded = globalThis.atob(match[1]).trim();
      if (decoded) candidates.push(decoded);
    } catch {
      /* ignore unrelated base64 */
    }
  }
  const unescaped = html
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/\\u0026/g, '&');
  const rawUrlPattern =
    /(?:https?:)?\/\/[^\s'"<>]+\.m3u8(?:\?[^\s'"<>]*)?/gi;
  for (const match of unescaped.matchAll(rawUrlPattern)) {
    candidates.push(match[0]);
  }
  const resolved: string[] = [];
  for (const candidate of candidates) {
    try {
      const absolute = new URL(candidate, pageUrl);
      if (absolute.protocol === 'http:' || absolute.protocol === 'https:') {
        resolved.push(absolute.href);
      }
    } catch {
      /* ignore */
    }
  }
  return [...new Set(resolved.filter((url) => url.includes('.m3u8')))];
};

const isPlayable = async (
  url: string,
  headers: Record<string, string>,
): Promise<boolean> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) return false;
    const body = await res.text();
    return body.trimStart().startsWith('#EXTM3U');
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const resolveFromEmbed = async (
  apiStream: LiveStream,
): Promise<LiveStream | null> => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(apiStream.embedUrl, {
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: SITE_REFERER,
        'User-Agent': BROWSER_UA,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    const candidates = extractM3u8Urls(html, apiStream.embedUrl);
    for (const url of candidates) {
      if (await isPlayable(url, apiStream.headers)) {
        return { ...apiStream, url };
      }
    }
  } catch {
    /* embed host may be unreachable */
  }
  return null;
};

const mergeCatalog = (
  channels: LiveChannel[],
  epg: LiveEpg,
): LiveCatalog => {
  const categoriesByChannel = new Map<string, Set<string>>();
  const eventsByChannel = new Map<string, Set<string>>();
  const nowPlayingByChannel = new Map<string, string>();
  const nowPlayingStart = new Map<string, number>();
  const nextUpByChannel = new Map<string, string>();
  const nextUpStart = new Map<string, number>();
  const categories = new Set<string>();
  const now = Date.now();

  for (const day of epg.days) {
    for (const category of day.categories) {
      categories.add(category.name);
      for (const event of category.events) {
        const startsAt = event.startsAt ? Date.parse(event.startsAt) : NaN;
        for (const channel of event.channels) {
          if (!categoriesByChannel.has(channel.id)) {
            categoriesByChannel.set(channel.id, new Set());
          }
          categoriesByChannel.get(channel.id)!.add(category.name);
          if (!eventsByChannel.has(channel.id)) {
            eventsByChannel.set(channel.id, new Set());
          }
          eventsByChannel.get(channel.id)!.add(event.title);
          if (!Number.isFinite(startsAt)) continue;
          if (startsAt <= now) {
            const prev = nowPlayingStart.get(channel.id);
            if (prev == null || startsAt > prev) {
              nowPlayingStart.set(channel.id, startsAt);
              nowPlayingByChannel.set(channel.id, event.title);
            }
          } else {
            const prev = nextUpStart.get(channel.id);
            if (prev == null || startsAt < prev) {
              nextUpStart.set(channel.id, startsAt);
              nextUpByChannel.set(channel.id, event.title);
            }
          }
        }
      }
    }
  }

  const merged = channels.map((channel) => {
    const extraCats = categoriesByChannel.get(channel.id);
    const extraEvents = eventsByChannel.get(channel.id);
    const cats = extraCats
      ? [...new Set([...channel.categories, ...extraCats])]
      : channel.categories;
    cats.forEach((c) => categories.add(c));
    return {
      ...channel,
      categories: cats,
      eventTitles: extraEvents
        ? [...new Set([...channel.eventTitles, ...extraEvents])]
        : channel.eventTitles,
      nowPlaying: nowPlayingByChannel.get(channel.id) ?? channel.nowPlaying,
      nextUp: nextUpByChannel.get(channel.id) ?? channel.nextUp,
    };
  });

  return {
    channels: merged,
    epg,
    categories: [...categories].sort((a, b) => a.localeCompare(b)),
    fetchedAt: Date.now(),
  };
};

const readCachedCatalog = async (): Promise<LiveCatalog | null> => {
  try {
    const raw = await AsyncStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LiveCatalog;
    if (!parsed?.channels?.length) return null;
    if (Date.now() - (parsed.fetchedAt ?? 0) > CATALOG_TTL_MS) return parsed;
    return parsed;
  } catch {
    return null;
  }
};

const getCatalog = async (opts?: {
  refresh?: boolean;
}): Promise<LiveCatalog> => {
  if (!opts?.refresh) {
    const cached = await readCachedCatalog();
    if (cached && Date.now() - cached.fetchedAt <= CATALOG_TTL_MS) {
      return cached;
    }
  }
  try {
    const [channelsBody, epgBody] = await Promise.all([
      getJson('/dlhd/channels', opts?.refresh ? { refresh: 'true' } : undefined),
      getJson('/dlhd/epg', opts?.refresh ? { refresh: 'true' } : undefined),
    ]);
    const channels = (Array.isArray(channelsBody.channels)
      ? channelsBody.channels
      : []
    )
      .map(parseChannel)
      .filter((c): c is LiveChannel => c != null);
    const epg = parseEpg(epgBody);
    const catalog = mergeCatalog(channels, epg);
    AsyncStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(catalog)).catch(
      () => {},
    );
    return catalog;
  } catch (error) {
    const cached = await readCachedCatalog();
    if (cached?.channels.length) return cached;
    throw error;
  }
};

const getStream = async (channelId: string): Promise<LiveStream> => {
  const body = await getJson(
    `/dlhd/channels/${encodeURIComponent(channelId)}/stream`,
  );
  const apiStream = parseStream(body);
  if (apiStream.embedUrl) {
    const deviceStream = await resolveFromEmbed(apiStream);
    if (deviceStream) return deviceStream;
  }
  if (!apiStream.url) {
    throw new Error('The channel returned no playable stream.');
  }
  return apiStream;
};

const getFavorites = async (): Promise<string[]> => {
  try {
    const raw = await AsyncStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

const setFavorites = async (ids: string[]): Promise<void> => {
  await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
};

const toggleFavorite = async (channelId: string): Promise<string[]> => {
  const current = await getFavorites();
  const next = current.includes(channelId)
    ? current.filter((id) => id !== channelId)
    : [...current, channelId];
  await setFavorites(next);
  return next;
};

const getRecents = async (): Promise<string[]> => {
  try {
    const raw = await AsyncStorage.getItem(RECENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

const pushRecent = async (channelId: string): Promise<string[]> => {
  const current = await getRecents();
  const next = [
    channelId,
    ...current.filter((id) => id !== channelId),
  ].slice(0, MAX_RECENTS);
  await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  return next;
};

export const formatEventTime = (event: LiveEpgEvent): string => {
  if (event.startsAt) {
    const local = new Date(event.startsAt);
    if (!Number.isNaN(local.getTime())) {
      return local.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      });
    }
  }
  return event.time.trim();
};

export const DaddyLiveService = {
  getCatalog,
  getStream,
  getFavorites,
  toggleFavorite,
  getRecents,
  pushRecent,
  readCachedCatalog,
};
