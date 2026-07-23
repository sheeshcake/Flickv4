/**
 * Helpers for building streaming-server embed URLs and deriving request
 * origins.
 *
 * By default servers follow the `${url}/${type}/${tmdbId}[/${season}/${episode}]`
 * pattern (e.g. VidFast: https://vidfast.pro/movie/123), but each server can
 * define its own `urlPattern` template using `{url}`, `{type}`, `{tmdbId}`,
 * `{slug}`, `{season}`, `{episode}` placeholders — e.g. `{url}/{type}?tmdb={tmdbId}`
 * for servers that use query params instead of path segments, or
 * `{url}/{type}/{tmdbId}-{slug}?streaming=true` for servers like corsflix
 * that bake a slugified title into the path (e.g.
 * `https://watch.corsflix.net/movies/1275779-disclosure-day?streaming=true`)
 * — and its own labels for the `{type}` placeholder (some servers expect
 * "series"/"movies" instead of "tv"/"movie").
 */

export interface EmbedUrlParams {
  type: 'movie' | 'tv';
  tmdbId: number;
  season?: number;
  episode?: number;
  /** Raw media title, used to fill in the `{slug}` placeholder, if present. */
  title?: string;
}

/** Minimal shape a server needs for URL building — satisfied by `PlaybackServer`. */
export interface ServerUrlConfig {
  url: string;
  /**
   * Custom template, e.g. `{url}/{type}/{tmdbId}` or `{url}/{type}?tmdb={tmdbId}`.
   * Falls back to `DEFAULT_URL_PATTERN` when unset/blank. Unlike the default
   * pattern, custom patterns do NOT get `{season}`/`{episode}` auto-appended
   * for TV shows — include those placeholders explicitly if the server
   * needs them.
   */
  urlPattern?: string;
  /** Value substituted for `{type}` when the item is a movie. Defaults to "movie". */
  movieTypeLabel?: string;
  /** Value substituted for `{type}` when the item is a TV show. Defaults to "tv". */
  tvTypeLabel?: string;
}

export const DEFAULT_URL_PATTERN = '{url}/{type}/{tmdbId}';

/** Strip a trailing slash so we can safely concatenate path segments. */
const trimTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

/**
 * Turn a title like "Disclosure Day" into a URL-safe slug like
 * "disclosure-day", matching the `{tmdbId}-{slug}` convention some servers
 * (e.g. corsflix) use in place of a bare id.
 */
export const slugify = (title: string): string =>
  title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Replace `{placeholder}` tokens in a template with the given values. */
const applyUrlTemplate = (
  pattern: string,
  vars: Record<string, string>,
): string =>
  pattern.replace(/\{(\w+)\}/g, (_match, key: string) => vars[key] ?? '');

const typeLabelFor = (server: ServerUrlConfig, type: 'movie' | 'tv'): string =>
  type === 'tv'
    ? server.tvTypeLabel?.trim() || 'tv'
    : server.movieTypeLabel?.trim() || 'movie';

/**
 * Build the embed URL a scraper WebView should load for the given media,
 * using the server's custom `urlPattern` (if any) or the default
 * `{url}/{type}/{tmdbId}` pattern.
 */
export const buildEmbedUrl = (
  server: ServerUrlConfig,
  { type, tmdbId, season, episode, title }: EmbedUrlParams,
): string => {
  const hasCustomPattern = !!server.urlPattern?.trim();
  const pattern = hasCustomPattern
    ? server.urlPattern!.trim()
    : DEFAULT_URL_PATTERN;

  let url = applyUrlTemplate(pattern, {
    url: trimTrailingSlash(server.url),
    type: typeLabelFor(server, type),
    tmdbId: String(tmdbId),
    slug: title ? slugify(title) : '',
    season: season != null ? String(season) : '',
    episode: episode != null ? String(episode) : '',
  });

  // Preserve the legacy behavior for the default pattern: TV requests get
  // `/${season}/${episode}` appended automatically. Custom patterns must
  // opt in via an explicit `{season}`/`{episode}` placeholder instead, since
  // we can't guess where a season/episode segment belongs in an arbitrary
  // template.
  if (!hasCustomPattern && type === 'tv' && season != null && episode != null) {
    url += `/${season}/${episode}`;
  }

  // `autoPlay=true` is only appended for the default pattern. Custom
  // patterns are written verbatim by the user (e.g. already including their
  // own query params like `?streaming=true`) — appending an extra param
  // they didn't ask for could break servers that validate the query string.
  if (hasCustomPattern) return url;

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}autoPlay=true`;
};

/**
 * Human-readable preview of what `buildEmbedUrl` will produce for a given
 * server config, using placeholder text instead of real IDs. Used to show a
 * live "resolves to ..." preview in Server Settings while editing a server.
 */
export const previewEmbedUrl = (
  server: ServerUrlConfig,
  type: 'movie' | 'tv',
): string => {
  const hasCustomPattern = !!server.urlPattern?.trim();
  const pattern = hasCustomPattern
    ? server.urlPattern!.trim()
    : DEFAULT_URL_PATTERN;

  let url = applyUrlTemplate(pattern, {
    url: server.url.trim() ? trimTrailingSlash(server.url.trim()) : '{url}',
    type: typeLabelFor(server, type),
    tmdbId: '{tmdbId}',
    slug: '{slug}',
    season: '{season}',
    episode: '{episode}',
  });

  if (!hasCustomPattern && type === 'tv') url += '/{season}/{episode}';
  return url;
};

/**
 * The origin (scheme + host [+ port]) of a server URL, used as the default
 * `Origin`/`Referer` when fetching the resolved stream. Many hosts 403 without
 * a matching origin. Falls back to the trimmed input if parsing fails.
 */
export const originOf = (url: string): string => {
  try {
    return new URL(url).origin;
  } catch {
    return trimTrailingSlash(url);
  }
};
