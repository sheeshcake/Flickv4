import {useState, useCallback, useMemo, useRef, useEffect} from 'react';
import {TMDBService} from '../services/TMDBService';
import {Movie, TVShow, AppError} from '../types';

interface GenreContentState {
  movies: Movie[];
  tvShows: TVShow[];
  loading: boolean;
  error: AppError | null;
  page: number;
  hasMoreMovies: boolean;
  hasMoreTVShows: boolean;
}

interface UseGenreContentReturn {
  contentByGenre: Record<number, GenreContentState>;
  loadGenreContent: (
    genreId: number,
    genreName: string,
    options?: {reset?: boolean},
  ) => Promise<void>;
  isLoadingGenre: (genreId: number) => boolean;
  getGenreError: (genreId: number) => AppError | null;
  canLoadMoreGenre: (genreId: number) => boolean;
}

const createInitialGenreState = (): GenreContentState => ({
  movies: [],
  tvShows: [],
  loading: false,
  error: null,
  page: 0,
  hasMoreMovies: true,
  hasMoreTVShows: true,
});

const mergeUniqueById = <T extends {id: number}>(
  existing: T[],
  incoming: T[],
): T[] => {
  const merged = new Map<number, T>();
  existing.forEach(item => merged.set(item.id, item));
  incoming.forEach(item => merged.set(item.id, item));
  return Array.from(merged.values());
};

export const useGenreContent = (): UseGenreContentReturn => {
  const [contentByGenre, setContentByGenre] = useState<Record<number, GenreContentState>>({});
  const contentByGenreRef = useRef(contentByGenre);

  useEffect(() => {
    contentByGenreRef.current = contentByGenre;
  }, [contentByGenre]);

  const tmdbService = useMemo(() => new TMDBService(), []);

  const loadGenreContent = useCallback(
    async (genreId: number, genreName: string, options: {reset?: boolean} = {}) => {
      const currentState = contentByGenreRef.current[genreId];

      if (currentState?.loading) {
        return;
      }

      if (!options.reset && currentState && !currentState.hasMoreMovies && !currentState.hasMoreTVShows) {
        return;
      }

      const nextPage = options.reset || !currentState ? 1 : (currentState.page || 0) + 1;

      setContentByGenre(prev => ({
        ...prev,
        [genreId]: {
          ...(options.reset ? createInitialGenreState() : currentState || createInitialGenreState()),
          movies: options.reset ? [] : currentState?.movies || [],
          tvShows: options.reset ? [] : currentState?.tvShows || [],
          loading: true,
          error: null,
        },
      }));

      try {
        const [moviesResponse, tvShowsResponse] = await Promise.all([
          tmdbService.discoverMoviesByGenre(genreId, nextPage),
          tmdbService.discoverTVShowsByGenre(genreId, nextPage),
        ]);

        const mergedMovies = mergeUniqueById(
          options.reset ? [] : currentState?.movies || [],
          moviesResponse.results || [],
        );
        const mergedTVShows = mergeUniqueById(
          options.reset ? [] : currentState?.tvShows || [],
          tvShowsResponse.results || [],
        );

        const hasMoreMovies = moviesResponse.page < moviesResponse.total_pages;
        const hasMoreTVShows = tvShowsResponse.page < tvShowsResponse.total_pages;

        setContentByGenre(prev => ({
          ...prev,
          [genreId]: {
            movies: mergedMovies,
            tvShows: mergedTVShows,
            loading: false,
            error: null,
            page: nextPage,
            hasMoreMovies,
            hasMoreTVShows,
          },
        }));
      } catch (error) {
        console.error(`Failed to load content for genre ${genreName}:`, error);
        setContentByGenre(prev => ({
          ...prev,
          [genreId]: {
            ...(currentState || createInitialGenreState()),
            loading: false,
            error: error as AppError,
          },
        }));
      }
    },
    [tmdbService],
  );

  const isLoadingGenre = useCallback((genreId: number): boolean => {
    return contentByGenre[genreId]?.loading || false;
  }, [contentByGenre]);

  const getGenreError = useCallback((genreId: number): AppError | null => {
    return contentByGenre[genreId]?.error || null;
  }, [contentByGenre]);

  const canLoadMoreGenre = useCallback((genreId: number): boolean => {
    const genreState = contentByGenre[genreId];
    if (!genreState) {
      return true;
    }
    return genreState.hasMoreMovies || genreState.hasMoreTVShows;
  }, [contentByGenre]);

  return {
    contentByGenre,
    loadGenreContent,
    isLoadingGenre,
    getGenreError,
    canLoadMoreGenre,
  };
};