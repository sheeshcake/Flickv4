import { WYZIE_SUBS_CONFIG } from '@/src/config/env';

export interface WyzieSubtitle {
  id: string;
  url: string;
  flagUrl?: string;
  format: string;
  encoding?: string;
  display: string;
  language: string;
  media?: string;
  isHearingImpaired?: boolean;
  source?: string;
  fileName?: string;
}

export class WyzieError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WyzieError';
  }
}

/** Browser-like UA so Cloudflare (vdrk) does not 403 RN/okhttp fetches. */
export const SUBTITLE_FETCH_HEADERS: Record<string, string> = {
  Accept: 'text/vtt, text/plain, application/x-subrip, application/json, */*',
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
};

interface SearchParams {
  tmdbId: number;
  season?: number;
  episode?: number;
  language?: string;
  format?: string;
}

/**
 * Wyzie Subs client using native fetch.
 * Docs: https://docs.wyzie.io/subs/usage/direct
 */
class WyzieServiceImpl {
  private readonly baseUrl = WYZIE_SUBS_CONFIG.BASE_URL;
  private readonly apiKey = WYZIE_SUBS_CONFIG.API_KEY;

  async searchSubtitles({
    tmdbId,
    season,
    episode,
    language,
    format = 'srt',
  }: SearchParams): Promise<WyzieSubtitle[]> {
    if (!this.apiKey) {
      throw new WyzieError('Missing Wyzie API key.');
    }

    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set('id', String(tmdbId));
    url.searchParams.set('key', this.apiKey);
    // Omit `language` to receive tracks across all languages.
    if (language) {
      url.searchParams.set('language', language);
    }
    url.searchParams.set('format', format);
    if (season != null && episode != null) {
      url.searchParams.set('season', String(season));
      url.searchParams.set('episode', String(episode));
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      WYZIE_SUBS_CONFIG.TIMEOUT,
    );

    try {
      const response = await fetch(url.toString(), {
        headers: { ...SUBTITLE_FETCH_HEADERS, Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new WyzieError(`Wyzie request failed (${response.status})`);
      }
      const data = (await response.json()) as WyzieSubtitle[] | WyzieSubtitle;
      if (Array.isArray(data)) return data;
      if (data && typeof data === 'object' && 'url' in data) return [data];
      return [];
    } catch (err) {
      if (err instanceof WyzieError) throw err;
      throw new WyzieError('Failed to fetch subtitles.');
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchSubtitleText(url: string): Promise<string> {
    const response = await fetch(url, { headers: SUBTITLE_FETCH_HEADERS });
    if (!response.ok) {
      throw new WyzieError(`Failed to download subtitle (${response.status})`);
    }
    const text = await response.text();
    const trimmed = text.replace(/^\uFEFF/, '').trim();
    if (/^<!DOCTYPE html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
      throw new WyzieError('Subtitle download returned HTML instead of cues.');
    }
    return text;
  }
}

export const WyzieService = new WyzieServiceImpl();
