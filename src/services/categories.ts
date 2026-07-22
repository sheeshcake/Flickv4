import { TMDBService } from '@/src/services/TMDBService';
import type { MediaItem, Movie, TVShow } from '@/src/types';

/**
 * A serializable description of a home-screen category, used to paginate the
 * same content on the "View More" screen.
 */
export type CategoryQuery =
  | { kind: 'trendingMovies' }
  | { kind: 'trendingTv' }
  | { kind: 'genreMovie'; genreId: number };

const tag = <T extends Movie | TVShow>(
  items: T[],
  type: 'movie' | 'tv',
): MediaItem[] => items.map((i) => ({ ...i, media_type: type }));

/** Fetch a single page of results for a category, tagged with media_type. */
export const fetchCategoryPage = async (
  query: CategoryQuery,
  page: number,
): Promise<MediaItem[]> => {
  switch (query.kind) {
    case 'trendingMovies': {
      const res = await TMDBService.getTrendingMovies(page);
      return tag(res.results, 'movie');
    }
    case 'trendingTv': {
      const res = await TMDBService.getTrendingTVShows(page);
      return tag(res.results, 'tv');
    }
    case 'genreMovie': {
      const res = await TMDBService.discoverMoviesByGenre(query.genreId, page);
      return tag(res.results, 'movie');
    }
    default:
      return [];
  }
};
