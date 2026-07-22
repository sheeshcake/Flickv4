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

export interface Genre {
  id: number;
  name: string;
}

export interface CastMember {
  id: number;
  name: string;
  character?: string;
  profile_path: string | null;
}

export interface CreditsResponse {
  cast: CastMember[];
  crew?: CrewMember[];
}

export interface CrewMember {
  id: number;
  name: string;
  job?: string;
  department?: string;
  profile_path?: string | null;
}

export interface Creator {
  id: number;
  name: string;
  profile_path?: string | null;
}

export interface VideoResult {
  id: string;
  key: string;
  name: string;
  site: string; // "YouTube"
  type: string; // "Trailer" | "Teaser" | ...
  official: boolean;
}

export interface VideoResponse {
  results: VideoResult[];
}

export interface MovieDetails extends Movie {
  runtime?: number;
  genres?: Genre[];
  tagline?: string;
  status?: string;
}

export interface Episode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  runtime?: number;
  air_date?: string;
}

export interface Season {
  id: number;
  season_number: number;
  name: string;
  episode_count?: number;
  poster_path: string | null;
}

export interface SeasonDetails extends Season {
  episodes: Episode[];
}

export interface TVShowDetails extends TVShow {
  genres?: Genre[];
  tagline?: string;
  status?: string;
  number_of_seasons?: number;
  seasons?: Season[];
  created_by?: Creator[];
  type?: string;
}

export interface ReleaseDatesResponse {
  id: number;
  results: {
    iso_3166_1: string;
    release_dates: { certification: string; type: number }[];
  }[];
}

export interface ContentRatingsResponse {
  id: number;
  results: { iso_3166_1: string; rating: string }[];
}

export interface TmdbImage {
  file_path: string;
  width: number;
  height: number;
  iso_639_1: string | null;
  vote_average?: number;
  vote_count?: number;
}

export interface MediaImagesResponse {
  id: number;
  backdrops: TmdbImage[];
  posters: TmdbImage[];
  logos: TmdbImage[];
}

export interface TMDBResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export const isMovie = (item: MediaItem | null | undefined): item is Movie =>
  !!item && 'title' in item;

export const getTitle = (item: MediaItem): string =>
  isMovie(item) ? item.title : item.name;

export const getReleaseDate = (item: MediaItem): string | undefined =>
  isMovie(item) ? item.release_date : item.first_air_date;
