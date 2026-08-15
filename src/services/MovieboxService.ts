import { originOf } from '@/src/utils/streamUrl';

const TAG = '[Moviebox]';
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

const API_BASE = 'https://h5-api.aoneroom.com/wefeed-h5api-bff';
const STREAM_BASE = 'https://h5.aoneroom.com/wefeed-h5-bff';
const REQUEST_TIMEOUT_MS = 15000;
const TOKEN_TTL_MS = 25 * 60 * 1000;

const API_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  Referer: 'https://moviebox.ph/',
  Origin: 'https://moviebox.ph',
  'X-Client-Info': '{"timezone":"Asia/Dhaka"}',
  'X-Request-Lang': 'en',
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

export const MOVIEBOX_SERVER_ID = 'moviebox';

/** CDN only accepts these — native video can set them, the web companion cannot. */
export const MOVIEBOX_PLAYBACK_HEADERS: Record<string, string> = {
  Referer: 'https://moviebox.ph/',
  Origin: 'https://moviebox.ph',
};

export type ServerResolver = 'webview' | 'moviebox';

export interface MovieboxResolveRequest {
  title: string;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  /** When known (e.g. a proxy), forwarded to aoneroom. On-device fetch already uses the phone IP. */
  clientIp?: string;
}

export interface MovieboxResolvedStream {
  uri: string;
  kind: 'file' | 'hls';
}

interface MovieboxItem {
  subjectId: string;
  detailPath: string;
  title: string;
  subjectType?: number;
}

interface SeasonTag {
  from: number | null;
  to: number | null;
  exact: number | null;
}

let cachedToken = '';
let cachedTokenAt = 0;

const geoHeaders = (clientIp?: string): Record<string, string> => {
  if (!clientIp) return {};
  return { 'X-Forwarded-For': clientIp, 'X-Real-IP': clientIp };
};

const movieboxFetch = async (
  url: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const getToken = async (clientIp?: string): Promise<string> => {
  if (cachedToken && Date.now() - cachedTokenAt < TOKEN_TTL_MS) {
    log('token: cached');
    return cachedToken;
  }
  log('token: fetching guest JWT');
  const resp = await movieboxFetch(`${API_BASE}/home?host=moviebox.ph`, {
    headers: { ...API_HEADERS, ...geoHeaders(clientIp) },
  });
  const xUser = resp.headers.get('x-user');
  if (xUser) {
    try {
      cachedToken = (JSON.parse(xUser) as { token?: string }).token ?? '';
    } catch {
      cachedToken = '';
    }
  }
  cachedTokenAt = Date.now();
  log(cachedToken ? 'token: acquired' : 'token: missing');
  return cachedToken;
};

const normalizeTitle = (value: string): string =>
  String(value || '')
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\bs\d+(?:\s*-\s*s\d+)?\b/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const parseSeasonTag = (title: string): SeasonTag => {
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

const scoreItem = (item: MovieboxItem, req: MovieboxResolveRequest): number => {
  const want = normalizeTitle(req.title);
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
  const isTv = req.mediaType === 'tv';
  if (isTv && item.subjectType === 2) score += 20;
  if (!isTv && item.subjectType === 1) score += 20;
  if (/\[english\]/i.test(item.title)) score += 15;
  if (/\[(hindi|tagalog|tamil|telugu|spanish|french)\]/i.test(item.title)) {
    score -= 25;
  }
  if (isTv && req.season != null) {
    const tag = parseSeasonTag(item.title);
    if (tag.exact === req.season) score += 40;
    else if (
      tag.from != null &&
      req.season >= tag.from &&
      req.season <= tag.to
    ) {
      score += 25;
    }
  }
  return score;
};

const playParams = (
  item: MovieboxItem,
  req: MovieboxResolveRequest,
): { se: number; ep: number } => {
  if (req.mediaType !== 'tv') return { se: 0, ep: 0 };
  const episode = Number(req.episode) || 1;
  const season = Number(req.season) || 1;
  const tag = parseSeasonTag(item.title);
  if (tag.exact != null) return { se: 1, ep: episode };
  return { se: season, ep: episode };
};

const pickStream = (
  data: {
    streams?: { url?: string; resolutions?: number | string; format?: string }[];
    hls?: { url?: string; src?: string }[];
  } | null,
): MovieboxResolvedStream | null => {
  const streams = (data?.streams ?? []).filter((s) => s?.url);
  streams.sort(
    (a, b) => Number(b.resolutions || 0) - Number(a.resolutions || 0),
  );
  if (streams[0]?.url) {
    const uri = String(streams[0].url);
    const format = String(streams[0].format || '');
    const kind: MovieboxResolvedStream['kind'] =
      /\.m3u8(\?|#|$)/i.test(uri) || /m3u8|hls/i.test(format) ? 'hls' : 'file';
    return { uri, kind };
  }
  const hls = (data?.hls ?? []).find((h) => h?.url || h?.src);
  if (hls) return { uri: String(hls.url || hls.src), kind: 'hls' };
  return null;
};

const asItem = (raw: unknown): MovieboxItem | null => {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const nested =
    record.subject && typeof record.subject === 'object'
      ? (record.subject as Record<string, unknown>)
      : null;
  const src =
    nested && typeof nested.title === 'string' ? nested : record;
  const subjectId = src.subjectId != null ? String(src.subjectId) : '';
  const detailPath = typeof src.detailPath === 'string' ? src.detailPath : '';
  const title = typeof src.title === 'string' ? src.title : '';
  if (!subjectId || !detailPath || !title) return null;
  return {
    subjectId,
    detailPath,
    title,
    subjectType: typeof src.subjectType === 'number' ? src.subjectType : undefined,
  };
};

const search = async (req: MovieboxResolveRequest): Promise<MovieboxItem | null> => {
  const token = await getToken(req.clientIp);
  const headers = {
    ...API_HEADERS,
    ...geoHeaders(req.clientIp),
    Authorization: token ? `Bearer ${token}` : '',
  };
  let best: MovieboxItem | null = null;
  let bestScore = 0;
  for (let page = 1; page <= 3; page++) {
    log('search: page', page, `"${req.title}"`);
    const resp = await movieboxFetch(`${API_BASE}/subject/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        keyword: req.title,
        page,
        perPage: 20,
      }),
    });
    if (!resp.ok) {
      log('search: page', page, 'failed', resp.status);
      break;
    }
    const json = (await resp.json()) as {
      data?: { items?: unknown[]; list?: unknown[] };
    };
    const items = json.data?.items ?? json.data?.list ?? [];
    log('search: page', page, 'hits', items.length);
    if (!items.length) break;
    for (const raw of items) {
      const item = asItem(raw);
      if (!item) continue;
      const score = scoreItem(item, req);
      if (score > bestScore) {
        best = item;
        bestScore = score;
        log('search: best so far', item.title, `score=${Math.round(score)}`);
      }
    }
    if (bestScore >= 120) break;
  }
  if (bestScore >= 70 && best) {
    log('search: matched', best.title, `score=${Math.round(bestScore)}`, best.detailPath);
    return best;
  }
  log('search: no match', `"${req.title}"`, `bestScore=${Math.round(bestScore)}`);
  return null;
};

const play = async (
  item: MovieboxItem,
  req: MovieboxResolveRequest,
): Promise<MovieboxResolvedStream | null> => {
  const { se, ep } = playParams(item, req);
  log('play:', item.title, `se=${se}`, `ep=${ep}`, item.detailPath);
  const playUrl =
    `${STREAM_BASE}/web/subject/play?subjectId=${encodeURIComponent(item.subjectId)}` +
    `&se=${se}&ep=${ep}&detailPath=${encodeURIComponent(item.detailPath)}`;
  const resp = await movieboxFetch(playUrl, {
    headers: {
      'User-Agent': API_HEADERS['User-Agent'],
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      Origin: 'https://h5.aoneroom.com',
      Referer: `https://h5.aoneroom.com/spa/videoPlayPage/movies/${item.detailPath}?id=${item.subjectId}&type=/movie/detail&detailSe=${se}&detailEp=${ep}&lang=en`,
      ...geoHeaders(req.clientIp),
    },
  });
  if (!resp.ok) {
    log('play: failed', resp.status);
    return null;
  }
  const json = (await resp.json()) as { data?: Parameters<typeof pickStream>[0] };
  const stream = pickStream(json.data ?? null);
  if (stream) {
    const resolutions = (json.data?.streams ?? [])
      .map((s) => s.resolutions)
      .filter(Boolean);
    log(
      'play: stream',
      stream.kind,
      resolutions.length ? `qualities=${resolutions.join(',')}` : '',
      shortUrl(stream.uri),
    );
  } else {
    log('play: no stream on subject', item.subjectId);
  }
  return stream;
};

const resolve = async (
  req: MovieboxResolveRequest,
): Promise<MovieboxResolvedStream | null> => {
  const title = req.title.trim();
  if (!title) {
    log('resolve: empty title');
    return null;
  }
  log(
    'resolve:',
    req.mediaType,
    `"${title}"`,
    req.mediaType === 'tv' ? `S${req.season ?? '?'}E${req.episode ?? '?'}` : '',
    req.clientIp ? `ip=${req.clientIp}` : '',
  );
  try {
    const item = await search(req);
    if (!item) return null;
    const stream = await play(item, req);
    log(stream ? 'resolve: ok' : 'resolve: no playable stream');
    return stream;
  } catch (error) {
    log('resolve: error', error instanceof Error ? error.message : error);
    throw error;
  }
};

export const isMovieboxServer = (server: {
  resolver?: string;
  id?: string;
}): boolean =>
  server.resolver === 'moviebox' || server.id === MOVIEBOX_SERVER_ID;

export const playbackHeadersFor = (server: {
  resolver?: string;
  url: string;
}): Record<string, string> =>
  isMovieboxServer(server)
    ? { ...MOVIEBOX_PLAYBACK_HEADERS }
    : {
        Referer: `${server.url}/`,
        Origin: originOf(server.url),
      };

export const MovieboxService = {
  resolve,
};
