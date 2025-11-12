// Core type definitions for the Netflix Clone App
import React from 'react';

export interface Movie {
  id: number;
  title: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
  release_date: string;
  vote_average: number;
  genre_ids: number[];
  adult: boolean;
  original_language: string;
  popularity: number;
}

export interface TVShow {
  id: number;
  name: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
  first_air_date: string;
  vote_average: number;
  genre_ids: number[];
  origin_country: string[];
  original_language: string;
  popularity: number;
}

export interface UserPreferences {
  likedMovies: number[];
  likedTVShows: number[];
  continueWatching: WatchProgress[];
  theme: 'light' | 'dark';
  autoplay: boolean;
  pictureInPicture: boolean;
  defaultSubtitleLanguage?: string;
  autoSelectSubtitles: boolean;
}

export interface WatchProgress {
  contentId: number;
  contentType: 'movie' | 'tv';
  progress: number; // percentage watched
  lastWatched: Date;
  duration: number;
  season?: number; // For TV shows
  episode?: number; // For TV shows
  selectedSubtitle?: SubtitleTrack | null;
}

export interface TMDBResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface VideoData {
  key: string;
  site: string;
  type: string;
  name: string;
}

export interface VideoResponse {
  id: number;
  results: VideoData[];
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
}

export interface CrewMember {
  id: number;
  name: string;
  job: string;
  profile_path: string | null;
}

export interface CastResponse {
  id: number;
  cast: CastMember[];
  crew: CrewMember[];
}

export enum ErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  API_ERROR = 'API_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  VIDEO_ERROR = 'VIDEO_ERROR',
}

export interface AppError {
  type: ErrorType;
  message: string;
  code?: string;
  retry?: () => void;
}

// Network state interface
export interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean;
  type: string;
}

// State Management Types for Context API
export interface AppState {
  user: {
    preferences: UserPreferences;
    likedContent: {movies: number[]; tvShows: number[]};
    continueWatching: WatchProgress[];
  };
  content: {
    trendingMovies: Movie[];
    trendingTVShows: TVShow[];
    searchResults: (Movie | TVShow)[];
    selectedContent: Movie | TVShow | null;
  };
  ui: {
    theme: 'light' | 'dark';
    loading: {[key: string]: boolean};
    networkState: NetworkState;
    offlineMode: boolean;
  };
}

export enum AppActionType {
  // User actions
  SET_USER_PREFERENCES = 'SET_USER_PREFERENCES',
  ADD_LIKED_CONTENT = 'ADD_LIKED_CONTENT',
  REMOVE_LIKED_CONTENT = 'REMOVE_LIKED_CONTENT',
  UPDATE_WATCH_PROGRESS = 'UPDATE_WATCH_PROGRESS',
  SET_DEFAULT_SUBTITLE_LANGUAGE = 'SET_DEFAULT_SUBTITLE_LANGUAGE',
  SET_AUTO_SELECT_SUBTITLES = 'SET_AUTO_SELECT_SUBTITLES',

  // Content actions
  SET_TRENDING_MOVIES = 'SET_TRENDING_MOVIES',
  SET_TRENDING_TV_SHOWS = 'SET_TRENDING_TV_SHOWS',
  SET_SEARCH_RESULTS = 'SET_SEARCH_RESULTS',
  SET_SELECTED_CONTENT = 'SET_SELECTED_CONTENT',

  // UI actions
  SET_THEME = 'SET_THEME',
  SET_LOADING = 'SET_LOADING',
  SET_NETWORK_STATE = 'SET_NETWORK_STATE',
  SET_OFFLINE_MODE = 'SET_OFFLINE_MODE',
}

export interface AppAction {
  type: AppActionType;
  payload?: any;
}

export interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

// Content type union for components that handle both movies and TV shows
export type Content = Movie | TVShow;

// Helper type to determine if content is a movie or TV show
export interface ContentWithType {
  content: Movie | TVShow;
  contentType: 'movie' | 'tv';
}

// Genre interface for TMDB API
export interface Genre {
  id: number;
  name: string;
}

// Detailed movie interface with additional fields from TMDB API
export interface MovieDetails extends Movie {
  genres: Genre[];
  runtime: number;
  budget: number;
  revenue: number;
  production_companies: ProductionCompany[];
  production_countries: ProductionCountry[];
  spoken_languages: SpokenLanguage[];
  status: string;
  tagline: string;
}

// Detailed TV show interface with additional fields from TMDB API
export interface TVShowDetails extends TVShow {
  genres: Genre[];
  episode_run_time: number[];
  number_of_episodes: number;
  number_of_seasons: number;
  production_companies: ProductionCompany[];
  production_countries: ProductionCountry[];
  spoken_languages: SpokenLanguage[];
  status: string;
  tagline: string;
  created_by: CreatedBy[];
  networks: Network[];
}

export interface ProductionCompany {
  id: number;
  logo_path: string | null;
  name: string;
  origin_country: string;
}

export interface ProductionCountry {
  iso_3166_1: string;
  name: string;
}

export interface SpokenLanguage {
  english_name: string;
  iso_639_1: string;
  name: string;
}

export interface CreatedBy {
  id: number;
  credit_id: string;
  name: string;
  gender: number;
  profile_path: string | null;
}

export interface Network {
  id: number;
  logo_path: string | null;
  name: string;
  origin_country: string;
}

export interface Season {
  _id: string;
  air_date: string;
  episodes: Episode[];
  name: string;
  overview: string;
  id: number;
  poster_path: string | null;
  season_number: number;
  vote_average: number;
  episode_count: number;
}

export interface Episode {
  id: number;
  name: string;
  overview: string;
  vote_average: number;
  vote_count: number;
  air_date: string;
  episode_number: number;
  production_code: string;
  runtime: number;
  season_number: number;
  show_id: number;
  still_path: string | null;
  crew: CrewMember[];
  guest_stars: GuestStar[];
}

export interface CrewMember {
  id: number;
  credit_id: string;
  name: string;
  department: string;
  job: string;
  profile_path: string | null;
}

export interface GuestStar {
  id: number;
  name: string;
  credit_id: string;
  character: string;
  order: number;
  profile_path: string | null;
}

// Subtitle-related interfaces
export interface SubtitleTrack {
  id: string;
  title: string;
  language: string;
  url: string;
  format: string;
  encoding?: string;
  isHearingImpaired?: boolean;
  flagUrl?: string;
  source?: 'wyzie' | 'custom';
  originalUrl?: string; // Store original URL before conversion
  isConverted?: boolean; // Track if subtitle has been converted to VTT
  vttContent?: string; // Store converted VTT content for data URLs
}

export interface SubtitleSelection {
  selectedTrack?: SubtitleTrack;
  availableTracks: SubtitleTrack[];
}

// Wyzie library types (from wyzie-lib)
export interface WyzieSubtitleData {
  id: string;
  url: string;
  format: string;
  encoding: string;
  isHearingImpaired: boolean;
  flagUrl: string;
  media: string;
  display: string;
  language: string;
  source: number;
}

export interface WyzieSearchParams {
  tmdb_id?: number;
  imdb_id?: string;
  language?: string | string[];
  encoding?: string | string[];
  format?: string | string[];
  hi?: boolean;
  source?: string;
  season?: number;
  episode?: number;
}

// Download-related interfaces
export enum DownloadStatus {
  PENDING = 'pending',
  DOWNLOADING = 'downloading',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum DownloadQuality {
  LOW = '480p',
  MEDIUM = '720p',
  HIGH = '1080p',
  ULTRA = '4K',
}

export interface DownloadItem {
  id: string;
  contentId: number;
  contentType: 'movie' | 'tv';
  title: string;
  overview?: string;
  posterPath?: string;
  backdropPath?: string;
  releaseDate?: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  videoUrl: string;
  quality: DownloadQuality;
  status: DownloadStatus;
  progress: number; // 0-100
  downloadSpeed?: number; // bytes per second
  totalSize?: number; // bytes
  downloadedSize?: number; // bytes
  estimatedTimeRemaining?: number; // seconds
  filePath?: string;
  thumbnailPath?: string;
  subtitlePaths?: string[]; // Array of subtitle file paths
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface DownloadProgress {
  downloadId: string;
  progress: number;
  downloadSpeed: number;
  totalSize: number;
  downloadedSize: number;
  estimatedTimeRemaining: number;
}

export interface DownloadNotification {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'progress';
  progress?: number;
  timestamp: Date;
}
