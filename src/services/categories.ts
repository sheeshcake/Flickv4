import { TMDBService } from '@/src/services/TMDBService';
import type { MediaItem, Movie, TVShow } from '@/src/types';

/**
 * A serializable description of a home-screen category, used to paginate the
 * same content on the "View More" screen. Regional kinds bake in `region`
 * so a later catalog-region change does not rewrite an open View More grid.
 */
export type CategoryQuery =
  | { kind: 'trendingMovies' }
  | { kind: 'trendingTv' }
  | { kind: 'popularMovies'; region: string }
  | { kind: 'popularTv'; region: string }
  | { kind: 'genreMovie'; genreId: number; region: string }
  | { kind: 'genreTv'; genreId: number; region: string }
  | { kind: 'providerMovie'; providerId: number; region: string }
  | { kind: 'providerTv'; providerId: number; region: string }
  | { kind: 'providerMixed'; providerId: number; region: string };

export const tagMedia = <T extends Movie | TVShow>(
  items: T[],
  type: 'movie' | 'tv',
): MediaItem[] => items.map((i) => ({ ...i, media_type: type }));

const keyOf = (item: MediaItem) => `${item.media_type ?? ''}-${item.id}`;

/** Merge movie + TV pages, highest TMDB popularity first, no duplicate ids. */
export const interleaveByPopularity = (
  movies: MediaItem[],
  shows: MediaItem[],
): MediaItem[] => {
  const seen = new Set<string>();
  return [...movies, ...shows]
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .filter((item) => {
      const key = keyOf(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

/** Fetch a single page of results for a category, tagged with media_type. */
export const fetchCategoryPage = async (
  query: CategoryQuery,
  page: number,
): Promise<MediaItem[]> => {
  switch (query.kind) {
    case 'trendingMovies': {
      const res = await TMDBService.getTrendingMovies(page);
      return tagMedia(res.results, 'movie');
    }
    case 'trendingTv': {
      const res = await TMDBService.getTrendingTVShows(page);
      return tagMedia(res.results, 'tv');
    }
    case 'popularMovies': {
      const res = await TMDBService.getPopularMovies(page, query.region);
      return tagMedia(res.results, 'movie');
    }
    case 'popularTv': {
      const res = await TMDBService.getPopularTVShows(page, query.region);
      return tagMedia(res.results, 'tv');
    }
    case 'genreMovie': {
      const res = await TMDBService.discoverMoviesByGenre(
        query.genreId,
        page,
        query.region,
      );
      return tagMedia(res.results, 'movie');
    }
    case 'genreTv': {
      const res = await TMDBService.discoverTVByGenre(
        query.genreId,
        page,
        query.region,
      );
      return tagMedia(res.results, 'tv');
    }
    case 'providerMovie': {
      const res = await TMDBService.discoverByWatchProvider(
        'movie',
        query.providerId,
        page,
        query.region,
      );
      return tagMedia(res.results as Movie[], 'movie');
    }
    case 'providerTv': {
      const res = await TMDBService.discoverByWatchProvider(
        'tv',
        query.providerId,
        page,
        query.region,
      );
      return tagMedia(res.results as TVShow[], 'tv');
    }
    case 'providerMixed': {
      const [movies, shows] = await Promise.all([
        TMDBService.discoverByWatchProvider(
          'movie',
          query.providerId,
          page,
          query.region,
        ),
        TMDBService.discoverByWatchProvider(
          'tv',
          query.providerId,
          page,
          query.region,
        ),
      ]);
      return interleaveByPopularity(
        tagMedia(movies.results as Movie[], 'movie'),
        tagMedia(shows.results as TVShow[], 'tv'),
      );
    }
    default:
      return [];
  }
};
