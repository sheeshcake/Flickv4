import axios from 'axios';
import { WyzieSearchParams, WyzieSubtitleData } from '../types';
import { WYZIE_SUBS_CONFIG } from '../utils/constants';

interface SubtitleApiItem {
  id?: string | number;
  url?: string;
  download_url?: string;
  format?: string;
  encoding?: string;
  isHearingImpaired?: boolean;
  hi?: boolean;
  flagUrl?: string;
  flag_url?: string;
  media?: string;
  display?: string;
  title?: string;
  language?: string;
  source?: number | string;
}

const normalizeSubtitle = (item: SubtitleApiItem, index: number): WyzieSubtitleData => ({
  id: String(item.id ?? `subtitle_${index}`),
  url: item.url ?? item.download_url ?? '',
  format: item.format ?? 'srt',
  encoding: item.encoding ?? 'utf-8',
  isHearingImpaired: Boolean(item.isHearingImpaired ?? item.hi ?? false),
  flagUrl: item.flagUrl ?? item.flag_url ?? '',
  media: item.media ?? '',
  display: item.display ?? item.title ?? `Subtitle ${index + 1}`,
  language: item.language ?? 'unknown',
  source: typeof item.source === 'number' ? item.source : 0,
});

export const searchSubtitles = async (
  params: WyzieSearchParams,
): Promise<WyzieSubtitleData[]> => {
  const id = params.imdb_id ?? params.tmdb_id;

  if (!id) {
    throw new Error('Subtitle search requires tmdb_id or imdb_id');
  }

  try {
    const response = await axios.get<SubtitleApiItem[]>(
      `${WYZIE_SUBS_CONFIG.BASE_URL}/search`,
      {
        timeout: WYZIE_SUBS_CONFIG.TIMEOUT,
        params: {
          id,
          season: params.season,
          episode: params.episode,
          language: params.language,
          encoding: params.encoding,
          format: params.format,
          hi: params.hi,
          source: params.source,
          ...(WYZIE_SUBS_CONFIG.API_KEY ? { key: WYZIE_SUBS_CONFIG.API_KEY } : {}),
        },
      },
    );

    const list = Array.isArray(response.data) ? response.data : [];
    return list
      .map((item, index) => normalizeSubtitle(item, index))
      .filter(item => Boolean(item.url));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        throw new Error(
          'Subtitle API key is required for sub.wyzie.io. Set WYZIE_SUBS_CONFIG.API_KEY in src/utils/constants.ts.',
        );
      }
      if (error.code === 'ECONNABORTED') {
        throw new Error('Subtitle request timed out. Please try again.');
      }
      throw new Error('Failed to fetch subtitles from sub.wyzie.io.');
    }

    throw new Error('Failed to fetch subtitles.');
  }
};
