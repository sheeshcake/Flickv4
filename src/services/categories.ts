import { TMDBService, type QueryParams } from '@/src/services/TMDBService';
import type { MediaItem, Movie, TVShow } from '@/src/types';

/**
 * A serializable description of a home-screen category, used to paginate the
 * same content on the "View More" screen. Regional kinds bake in `region`
 * so a later catalog-region change does not rewrite an open View More grid.
 */
export type CategoryQuery =
  | { kind: 'trendingMovies' }
  | { kind: 'trendingTv' }
  | { kind: 'trendingAll' }
  | { kind: 'upcomingMovies'; region?: string }
  | { kind: 'upcomingTv' }
  | { kind: 'onTheAirTv' }
  | { kind: 'topRatedMovies' }
  | { kind: 'topRatedTv' }
  | { kind: 'popularMovies'; region: string }
  | { kind: 'popularTv'; region: string }
  | { kind: 'genreMovie'; genreId: number; region: string }
  | { kind: 'genreTv'; genreId: number; region: string }
  | { kind: 'providerMovie'; providerId: number; region: string }
  | { kind: 'providerTv'; providerId: number; region: string }
  | { kind: 'providerMixed'; providerId: number; region: string }
  /**
   * Nightflix-style recipe: one query can fan out to both movie and TV
   * `/discover` calls with genre strings, vote-count bands and date cutoffs.
   * All fields are plain so the query survives React Navigation params.
   */
  | {
      kind: 'discover';
      media: 'movie' | 'tv' | 'mixed';
      movieGenres?: string;
      tvGenres?: string;
      sortBy: string;
      movieVoteCountGte?: number;
      tvVoteCountGte?: number;
      movieVoteCountLte?: number;
      tvVoteCountLte?: number;
      movieDateTo?: string;
      tvDateTo?: string;
      region?: string;
    };

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

const discoverParams = (
  query: Extract<CategoryQuery, { kind: 'discover' }>,
  page: number,
  media: 'movie' | 'tv',
): QueryParams => {
  const params: QueryParams = {
    page,
    sort_by: query.sortBy,
    include_adult: false,
    region: query.region,
    watch_region: query.region,
  };
  const genres = media === 'movie' ? query.movieGenres : query.tvGenres;
  if (genres) params.with_genres = genres;

  const gte =
    media === 'movie' ? query.movieVoteCountGte : query.tvVoteCountGte;
  const lte =
    media === 'movie' ? query.movieVoteCountLte : query.tvVoteCountLte;
  if (gte != null) params['vote_count.gte'] = gte;
  if (lte != null) params['vote_count.lte'] = lte;

  const dateTo =
    media === 'movie' ? query.movieDateTo : query.tvDateTo;
  if (dateTo) {
    const field =
      media === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte';
    params[field] = dateTo;
  }
  return params;
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
    case 'trendingAll': {
      const res = await TMDBService.getTrendingAll(page);
      return res.results.filter(
        (item) => item.media_type === 'movie' || item.media_type === 'tv',
      );
    }
    case 'upcomingMovies': {
      const res = await TMDBService.getUpcomingMovies(page, query.region);
      return tagMedia(res.results, 'movie');
    }
    case 'upcomingTv': {
      const res = await TMDBService.discoverUpcomingTV(page);
      return tagMedia(res.results, 'tv');
    }
    case 'onTheAirTv': {
      const res = await TMDBService.getOnTheAirTV(page);
      return tagMedia(res.results, 'tv');
    }
    case 'topRatedMovies': {
      const res = await TMDBService.getTopRatedMovies(page);
      return tagMedia(res.results, 'movie');
    }
    case 'topRatedTv': {
      const res = await TMDBService.getTopRatedTVShows(page);
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
    case 'discover': {
      if (query.media === 'mixed') {
        const jobs: Promise<MediaItem[]>[] = [];
        if (query.movieGenres || !query.tvGenres) {
          jobs.push(
            TMDBService.discoverMoviesAdvanced(
              discoverParams(query, page, 'movie'),
            ).then((res) => tagMedia(res.results, 'movie')),
          );
        }
        if (query.tvGenres || !query.movieGenres) {
          jobs.push(
            TMDBService.discoverTVAdvanced(
              discoverParams(query, page, 'tv'),
            ).then((res) => tagMedia(res.results, 'tv')),
          );
        }
        const lists = await Promise.all(jobs);
        return interleaveByPopularity(
          lists.find((list) => list.every((item) => item.media_type === 'movie')) ??
            [],
          lists.find((list) => list.every((item) => item.media_type === 'tv')) ??
            [],
        );
      }
      if (query.media === 'movie') {
        const res = await TMDBService.discoverMoviesAdvanced(
          discoverParams(query, page, 'movie'),
        );
        return tagMedia(res.results, 'movie');
      }
      const res = await TMDBService.discoverTVAdvanced(
        discoverParams(query, page, 'tv'),
      );
      return tagMedia(res.results, 'tv');
    }
    default:
      return [];
  }
};
