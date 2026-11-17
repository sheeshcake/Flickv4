/**
 * Centralized runtime configuration.
 * Values are read from `EXPO_PUBLIC_*` variables so secrets live in `.env`,
 * never hardcoded in source. See `.env.example` for the required keys.
 */

const required = (value: string | undefined, name: string): string => {
  if (!value) {
    console.warn(`[env] Missing ${name}. Add it to your .env file.`);
    return '';
  }
  return value;
};

export const TMDB_CONFIG = {
  BASE_URL: required(process.env.EXPO_PUBLIC_TMDB_BASE_URL, 'EXPO_PUBLIC_TMDB_BASE_URL'),
  IMAGE_BASE_URL: required(
    process.env.EXPO_PUBLIC_TMDB_IMAGE_BASE_URL,
    'EXPO_PUBLIC_TMDB_IMAGE_BASE_URL',
  ),
  API_KEY: required(process.env.EXPO_PUBLIC_TMDB_API_KEY, 'EXPO_PUBLIC_TMDB_API_KEY'),
} as const;

export const WYZIE_SUBS_CONFIG = {
  BASE_URL: required(process.env.EXPO_PUBLIC_WYZIE_BASE_URL, 'EXPO_PUBLIC_WYZIE_BASE_URL'),
  API_KEY: required(process.env.EXPO_PUBLIC_WYZIE_API_KEY, 'EXPO_PUBLIC_WYZIE_API_KEY'),
  TIMEOUT: 10000,
} as const;

// Public sample clip (not a secret). Falls back to the W3C-hosted Sintel
// trailer — a small, fast, HTTPS MP4 that loads reliably across platforms —
// if the env var isn't provided, so the player always has a valid source.
export const SAMPLE_VIDEO_URL =
  process.env.EXPO_PUBLIC_SAMPLE_VIDEO_URL ||
  'https://media.w3.org/2010/05/sintel/trailer.mp4';

/** FlixQuest scraper API (VOD providers + DLHD live TV). Empty = feature off. */
export const FLIXQUEST_CONFIG = {
  url: process.env.EXPO_PUBLIC_FLIXQUEST_API_URL?.trim() || '',
  enabled: Boolean(process.env.EXPO_PUBLIC_FLIXQUEST_API_URL?.trim()),
} as const;

/** Remote M3U playlist merged into Live TV as the PH category. */
const DEFAULT_LIVE_TV_M3U_URL =
  'https://raw.githubusercontent.com/Harleythetech/IPHTV/main/ph.m3u';

export const LIVE_TV_M3U_CONFIG = {
  url: process.env.EXPO_PUBLIC_LIVE_TV_M3U_URL?.trim() || DEFAULT_LIVE_TV_M3U_URL,
  enabled: true,
} as const;

/** Live tab is shown when FlixQuest DLHD and/or the PH M3U playlist is on. */
export const LIVE_TV_CONFIG = {
  enabled: FLIXQUEST_CONFIG.enabled || LIVE_TV_M3U_CONFIG.enabled,
} as const;
