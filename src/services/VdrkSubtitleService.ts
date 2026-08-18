import { languageFromLabel } from '@/src/constants/languages';
import {
  SUBTITLE_FETCH_HEADERS,
  type WyzieSubtitle,
} from '@/src/services/WyzieService';

const BASE_URL = 'https://sub.vdrk.site/v1';
const TIMEOUT_MS = 10000;

interface VdrkTrack {
  label?: string;
  file?: string;
}

interface SearchParams {
  tmdbId: number;
  season?: number;
  episode?: number;
}

const isHearingImpaired = (label: string): boolean =>
  /(?:^|[\s(])hi(?:\d+)?(?:\s|$)/i.test(label) && !/hindi/i.test(label);

/** API returns paths like `English Hi.vtt` — encode so RN fetch / ExoPlayer can load them. */
const encodeSubtitleUrl = (raw: string): string => {
  try {
    const parsed = new URL(raw);
    parsed.pathname = parsed.pathname
      .split('/')
      .map((seg) => encodeURIComponent(decodeURIComponent(seg)))
      .join('/');
    return parsed.toString();
  } catch {
    return raw;
  }
};

/**
 * Vidrock subtitle catalog. No API key. Returns VTT files.
 * TV:  /v1/tv/{tmdbId}/{season}/{episode}
 * Movie: /v1/movie/{tmdbId}
 */
class VdrkSubtitleServiceImpl {
  async searchSubtitles({
    tmdbId,
    season,
    episode,
  }: SearchParams): Promise<WyzieSubtitle[]> {
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) return [];
    const isTv = season != null && episode != null;
    const path = isTv
      ? `tv/${tmdbId}/${season}/${episode}`
      : `movie/${tmdbId}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${BASE_URL}/${path}`, {
        headers: { ...SUBTITLE_FETCH_HEADERS, Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) return [];
      const data = (await response.json()) as VdrkTrack[] | VdrkTrack;
      const list = Array.isArray(data) ? data : data?.file ? [data] : [];
      return list.flatMap((raw, index) => {
        const file =
          typeof raw.file === 'string' ? encodeSubtitleUrl(raw.file) : '';
        if (!/^https?:\/\//i.test(file)) return [];
        const label = String(raw.label || 'Unknown');
        const language = languageFromLabel(label);
        const cc = isHearingImpaired(label);
        return [
          {
            id: `vdrk:${language}:${label}:${index}`,
            url: file,
            format: 'vtt',
            display: label,
            language,
            isHearingImpaired: cc,
            source: 'vdrk',
          } satisfies WyzieSubtitle,
        ];
      });
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }
}

export const VdrkSubtitleService = new VdrkSubtitleServiceImpl();
