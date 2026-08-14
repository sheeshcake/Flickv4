import { TMDBService } from '@/src/services/TMDBService';
import type { MediaItem } from '@/src/types';
import type { PartyContent } from '@/src/party/protocol';

export const mediaItemFromPartyContent = async (
  content: PartyContent,
): Promise<MediaItem> => {
  if (content.mediaType === 'tv') {
    const details = await TMDBService.getTVShowDetails(content.tmdbId);
    return { ...details, media_type: 'tv' };
  }
  const details = await TMDBService.getMovieDetails(content.tmdbId);
  return { ...details, media_type: 'movie' };
};

export const partyContentFromItem = (
  item: MediaItem,
  season?: number,
  episode?: number,
): PartyContent => ({
  tmdbId: item.id,
  mediaType: item.media_type === 'tv' ? 'tv' : 'movie',
  title: 'title' in item ? item.title : item.name,
  posterPath: item.poster_path,
  season,
  episode,
});
