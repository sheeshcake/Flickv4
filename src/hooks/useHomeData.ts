import { useCallback, useEffect, useState } from 'react';
import { TMDBService } from '@/src/services/TMDBService';
import type { CategoryQuery } from '@/src/services/categories';
import type { MediaItem, Movie, TVShow } from '@/src/types';
import { GENRE_IDS, getGenreName } from '@/src/utils/genres';

export interface HomeRow {
  title: string;
  data: MediaItem[];
  /** Category descriptor enabling a paginated "View More" screen. */
  query: CategoryQuery;
}

interface HomeData {
  hero: MediaItem[];
  rows: HomeRow[];
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  refresh: () => void;
}

const tag = <T extends Movie | TVShow>(
  items: T[],
  type: 'movie' | 'tv',
): MediaItem[] => items.map((i) => ({ ...i, media_type: type }));

export const useHomeData = (): HomeData => {
  const [hero, setHero] = useState<MediaItem[]>([]);
  const [rows, setRows] = useState<HomeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [movies, tv, action, comedy, sciFi] = await Promise.all([
        TMDBService.getTrendingMovies(),
        TMDBService.getTrendingTVShows(),
        TMDBService.discoverMoviesByGenre(GENRE_IDS.action),
        TMDBService.discoverMoviesByGenre(GENRE_IDS.comedy),
        TMDBService.discoverMoviesByGenre(GENRE_IDS.sciFi),
      ]);

      const trendingMovies = tag(movies.results, 'movie');
      setHero(trendingMovies.slice(0, 5));
      setRows([
        {
          title: 'Trending Movies',
          data: trendingMovies,
          query: { kind: 'trendingMovies' },
        },
        {
          title: 'Trending TV Shows',
          data: tag(tv.results, 'tv'),
          query: { kind: 'trendingTv' },
        },
        {
          title: getGenreName(GENRE_IDS.action),
          data: tag(action.results, 'movie'),
          query: { kind: 'genreMovie', genreId: GENRE_IDS.action },
        },
        {
          title: getGenreName(GENRE_IDS.comedy),
          data: tag(comedy.results, 'movie'),
          query: { kind: 'genreMovie', genreId: GENRE_IDS.comedy },
        },
        {
          title: getGenreName(GENRE_IDS.sciFi),
          data: tag(sciFi.results, 'movie'),
          query: { kind: 'genreMovie', genreId: GENRE_IDS.sciFi },
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load content.');
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  return { hero, rows, loading, error, refreshing, refresh };
};
