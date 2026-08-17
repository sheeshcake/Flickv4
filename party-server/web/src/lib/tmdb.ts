const REQUEST_TIMEOUT_MS = 15000;

export interface Genre {
  id: number;
  name: string;
}

export interface Movie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  vote_average?: number;
  genre_ids?: number[];
  media_type?: 'movie';
}

export interface TVShow {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date?: string;
  vote_average?: number;
  genre_ids?: number[];
  media_type?: 'tv';
}

export type MediaItem = Movie | TVShow;

export interface MovieDetails extends Movie {
  runtime?: number;
  genres?: Genre[];
  tagline?: string;
  status?: string;
}

export interface TVShowDetails extends TVShow {
  genres?: Genre[];
  tagline?: string;
  status?: string;
  number_of_seasons?: number;
  seasons?: Season[];
  created_by?: { id: number; name: string }[];
}

export interface Season {
  id: number;
  season_number: number;
  name: string;
  episode_count?: number;
  poster_path: string | null;
}

export interface Episode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  air_date?: string;
}

export interface SeasonDetails extends Season {
  episodes: Episode[];
}

export interface CastMember {
  id: number;
  name: string;
  character?: string;
  profile_path: string | null;
}

export interface TmdbPage<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export const GENRE_IDS = {
  action: 28,
  comedy: 35,
  sciFi: 878,
} as const;

export const GENRE_NAMES: Record<number, string> = {
  28: 'Action',
  35: 'Comedy',
  878: 'Science Fiction',
};

export const isMovie = (item: MediaItem): item is Movie =>
  item.media_type === 'movie' || 'title' in item;

export const getTitle = (item: MediaItem): string =>
  isMovie(item) ? item.title : item.name;

export const getReleaseDate = (item: MediaItem): string | undefined =>
  isMovie(item) ? item.release_date : item.first_air_date;

export const tmdbImage = (
  path: string | null | undefined,
  size: 'w185' | 'w300' | 'w500' | 'w780' | 'w1280' | 'original' = 'w500',
): string | null => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

class TmdbError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'TmdbError';
  }
}

const request = async <T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<T> => {
  const url = new URL(`/tmdb${path}`, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new TmdbError('Request timed out.');
    }
    throw new TmdbError('Network request failed.');
  } finally {
    window.clearTimeout(timer);
  }
  if (!response.ok) {
    throw new TmdbError(`TMDB request failed (${response.status})`, response.status);
  }
  return (await response.json()) as T;
};

const tag = <T extends Movie | TVShow>(items: T[], type: 'movie' | 'tv'): MediaItem[] =>
  items.map((item) => ({ ...item, media_type: type }));

export const tmdb = {
  trendingMovies: (page = 1) =>
    request<TmdbPage<Movie>>('/trending/movie/week', { page }),
  trendingTv: (page = 1) => request<TmdbPage<TVShow>>('/trending/tv/week', { page }),
  discoverMoviesByGenre: (genreId: number, page = 1) =>
    request<TmdbPage<Movie>>('/discover/movie', {
      with_genres: genreId,
      sort_by: 'popularity.desc',
      page,
    }),
  searchMulti: async (query: string, page = 1) => {
    const data = await request<TmdbPage<MediaItem>>('/search/multi', {
      query,
      page,
      include_adult: false,
    });
    return {
      ...data,
      results: data.results.filter(
        (item) => item.media_type === 'movie' || item.media_type === 'tv',
      ),
    };
  },
  movieDetails: (id: number) => request<MovieDetails>(`/movie/${id}`),
  tvDetails: (id: number) => request<TVShowDetails>(`/tv/${id}`),
  movieCredits: (id: number) =>
    request<{ cast: CastMember[] }>(`/movie/${id}/credits`),
  tvCredits: (id: number) => request<{ cast: CastMember[] }>(`/tv/${id}/credits`),
  similarMovies: (id: number) => request<TmdbPage<Movie>>(`/movie/${id}/similar`),
  similarTv: (id: number) => request<TmdbPage<TVShow>>(`/tv/${id}/similar`),
  seasonDetails: (tvId: number, season: number) =>
    request<SeasonDetails>(`/tv/${tvId}/season/${season}`),
  movieExternalIds: (id: number) =>
    request<{ imdb_id: string | null }>(`/movie/${id}/external_ids`),
  tvExternalIds: (id: number) =>
    request<{ imdb_id: string | null }>(`/tv/${id}/external_ids`),
};

export const taggedTrendingMovies = async (page = 1) =>
  tag((await tmdb.trendingMovies(page)).results, 'movie');

export const taggedTrendingTv = async (page = 1) =>
  tag((await tmdb.trendingTv(page)).results, 'tv');

export const taggedGenreMovies = async (genreId: number, page = 1) =>
  tag((await tmdb.discoverMoviesByGenre(genreId, page)).results, 'movie');

const PRODUCTION_STATUSES = new Set([
  'planned',
  'in production',
  'post production',
  'rumored',
]);

export const comingSoonLabel = (
  releaseDate?: string,
  status?: string,
): string | null => {
  const unreleased = Boolean(
    status && PRODUCTION_STATUSES.has(status.trim().toLowerCase()),
  );
  let future = false;
  if (releaseDate) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(releaseDate);
    if (match) {
      const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      future = date.getTime() > today.getTime();
    }
  }
  if (!future && !unreleased) return null;
  if (releaseDate) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(releaseDate);
    if (match) {
      const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
      return `Coming ${months[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
    }
  }
  return 'Coming Soon';
};
