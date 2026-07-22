/**
 * Helpers for building streaming-server embed URLs and deriving request
 * origins. Servers follow the `${url}/${type}/${tmdbId}[/${season}/${episode}]`
 * pattern (e.g. VidFast: https://vidfast.pro/movie/123).
 */

export interface EmbedUrlParams {
  type: 'movie' | 'tv';
  tmdbId: number;
  season?: number;
  episode?: number;
}

/** Strip a trailing slash so we can safely concatenate path segments. */
const trimTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

/**
 * Build the embed URL a scraper WebView should load for the given media.
 * TV shows append `/${season}/${episode}` when both are provided.
 */
export const buildEmbedUrl = (
  baseUrl: string,
  { type, tmdbId, season, episode }: EmbedUrlParams,
): string => {
  let url = `${trimTrailingSlash(baseUrl)}/${type}/${tmdbId}`;
  if (type === 'tv' && season != null && episode != null) {
    url += `/${season}/${episode}`;
  }
  return `${url}?autoPlay=true`;
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
