/**
 * Helpers for building streaming-server embed URLs and deriving request
 * origins.
 *
 * By default movies follow the `{url}/{type}/{tmdbId}` pattern and TV shows
 * follow `{url}/{type}/{tmdbId}/{season}/{episode}` (e.g. VidFast:
 * https://vidfast.pro/movie/123 or https://vidfast.pro/tv/123/1/2), but each
 * server can define its own pattern *per type* using `{url}`, `{type}`,
 * `{tmdbId}`, `{imdbId}`, `{slug}`, `{season}`, `{episode}` placeholders —
 * e.g. `{url}/{type}?tmdb={tmdbId}` for servers that use query params
 * instead of path segments, or `{url}/{type}/{tmdbId}-{slug}?streaming=true`
 * for servers like corsflix that bake a slugified title into the path (e.g.
 * `https://watch.corsflix.net/movies/1275779-disclosure-day?streaming=true`)
 * — and its own labels for the `{type}` placeholder (some servers expect
 * "series"/"movies" instead of "tv"/"movie").
 */

export interface EmbedUrlParams {
  type: 'movie' | 'tv';
  tmdbId: number;
  /** IMDb id (e.g. "tt1375666"), for servers whose pattern uses `{imdbId}`
   * instead of/alongside `{tmdbId}`. Omitted/`null` fills in as `''`. */
  imdbId?: string | null;
  season?: number;
  episode?: number;
  /** Raw media title, used to fill in the `{slug}` placeholder, if present. */
  title?: string;
}

/** Minimal shape a server needs for URL building — satisfied by `PlaybackServer`. */
export interface ServerUrlConfig {
  url: string;
  /**
   * Custom template for movies, e.g. `{url}/{type}/{tmdbId}`. Falls back to
   * `DEFAULT_MOVIE_URL_PATTERN` when unset/blank.
   */
  movieUrlPattern?: string;
  /**
   * Custom template for TV shows, e.g.
   * `{url}/{type}/{tmdbId}/{season}/{episode}`. Falls back to
   * `DEFAULT_TV_URL_PATTERN` when unset/blank — unlike the movie default,
   * the TV default already includes the season/episode segments, so a
   * custom TV pattern must include its own `{season}`/`{episode}`
   * placeholders if it needs them.
   */
  tvUrlPattern?: string;
  /** Value substituted for `{type}` when the item is a movie. Defaults to "movie". */
  movieTypeLabel?: string;
  /** Value substituted for `{type}` when the item is a TV show. Defaults to "tv". */
  tvTypeLabel?: string;
}

export const DEFAULT_MOVIE_URL_PATTERN = '{url}/{type}/{tmdbId}';
export const DEFAULT_TV_URL_PATTERN = '{url}/{type}/{tmdbId}/{season}/{episode}';

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

/** Resolve the pattern to use for a given type: that type's custom
 * override (if set), otherwise the app default for that type. Also reports
 * whether a custom pattern was actually used, since that changes whether
 * `autoplay=true` gets appended (see `buildEmbedUrl`). */
const patternFor = (
  server: ServerUrlConfig,
  type: 'movie' | 'tv',
): { pattern: string; isCustom: boolean } => {
  const custom = (
    type === 'tv' ? server.tvUrlPattern : server.movieUrlPattern
  )?.trim();
  if (custom) return { pattern: custom, isCustom: true };
  return {
    pattern: type === 'tv' ? DEFAULT_TV_URL_PATTERN : DEFAULT_MOVIE_URL_PATTERN,
    isCustom: false,
  };
};

/**
 * Build the embed URL a scraper WebView should load for the given media,
 * using the server's custom pattern for that type (if any) or the app
 * default for that type.
 */
export const buildEmbedUrl = (
  server: ServerUrlConfig,
  { type, tmdbId, imdbId, season, episode, title }: EmbedUrlParams,
): string => {
  const { pattern, isCustom } = patternFor(server, type);

  const url = applyUrlTemplate(pattern, {
    url: trimTrailingSlash(server.url),
    type: typeLabelFor(server, type),
    tmdbId: String(tmdbId),
    imdbId: imdbId ?? '',
    slug: title ? slugify(title) : '',
    season: season != null ? String(season) : '',
    episode: episode != null ? String(episode) : '',
  });

  // `autoplay=true` is only appended for the app's own default pattern.
  // Custom patterns are written verbatim by the user (e.g. already
  // including their own query params like `?streaming=true`) — appending
  // an extra param they didn't ask for could break servers that validate
  // the query string. Lowercase `autoplay` (not `autoPlay`) — most embed
  // players (VidSrc's nxsha inner player, Videasy, VidFast) read
  // `searchParams.get("autoplay") === "true"` case-sensitively.
  if (isCustom) return url;

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}autoplay=true`;
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
  const { pattern } = patternFor(server, type);

  return applyUrlTemplate(pattern, {
    url: server.url.trim() ? trimTrailingSlash(server.url.trim()) : '{url}',
    type: typeLabelFor(server, type),
    tmdbId: '{tmdbId}',
    imdbId: '{imdbId}',
    slug: '{slug}',
    season: '{season}',
    episode: '{episode}',
  });
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
