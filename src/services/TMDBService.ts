import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {
  Movie,
  TVShow,
  TMDBResponse,
  VideoResponse,
  CastResponse,
  MovieDetails,
  TVShowDetails,
  Genre,
  ErrorType,
  AppError,
} from '../types';
import {TMDB_CONFIG} from '../utils/constants';
import {CacheService} from './CacheService';
import {NetworkUtils} from '../utils/networkUtils';

export class TMDBService {
  private api: AxiosInstance;
  private apiKey: string;
  private baseURL: string;

  constructor() {
    this.apiKey = TMDB_CONFIG.API_KEY;
    this.baseURL = TMDB_CONFIG.BASE_URL;

    // Create axios instance with base configuration
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      params: {
        api_key: this.apiKey,
      },
    });

    // Add response interceptor for error handling
    this.api.interceptors.response.use(
      (response: AxiosResponse) => response,
      error => {
        throw this.handleError(error);
      },
    );
  }

  /**
   * Handle API errors and transform them into AppError format
   */
  private handleError(error: any): AppError {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return {
        type: ErrorType.NETWORK_ERROR,
        message: 'Request timeout. Please check your internet connection.',
        code: 'TIMEOUT',
      };
    }

    if (!error.response) {
      return {
        type: ErrorType.NETWORK_ERROR,
        message: 'Network error. Please check your internet connection.',
        code: 'NETWORK_ERROR',
      };
    }

    const status = error.response.status;
    const statusText = error.response.statusText;

    switch (status) {
      case 401:
        return {
          type: ErrorType.API_ERROR,
          message: 'Invalid API key or unauthorized access.',
          code: 'UNAUTHORIZED',
        };
      case 404:
        return {
          type: ErrorType.API_ERROR,
          message: 'Content not found.',
          code: 'NOT_FOUND',
        };
      case 429:
        return {
          type: ErrorType.API_ERROR,
          message: 'Too many requests. Please try again later.',
          code: 'RATE_LIMITED',
        };
      case 500:
      case 502:
      case 503:
        return {
          type: ErrorType.API_ERROR,
          message: 'Server error. Please try again later.',
          code: 'SERVER_ERROR',
        };
      default:
        return {
          type: ErrorType.API_ERROR,
          message: `API Error: ${statusText}`,
          code: status.toString(),
        };
    }
  }

  /**
   * Get full image URL from TMDB path
   */
  getImageUrl(path: string, size: string = 'w500'): string {
    if (!path) {
      return '';
    }
    return `https://image.tmdb.org/t/p/${size}${path}`;
  }

  /**
   * Fetch trending movies with caching and offline support
   */
  async getTrendingMovies(
    timeWindow: 'day' | 'week' = 'week',
    page: number = 1,
  ): Promise<TMDBResponse<Movie>> {
    try {
      // Check if we're offline
      const isOffline = await NetworkUtils.isOffline();

      // Try to get cached data first
      const shouldUseCache = page === 1;
      const cachedData = shouldUseCache
        ? await CacheService.getCachedTrendingMovies(timeWindow)
        : null;

      if (isOffline) {
        if (cachedData) {
          return cachedData;
        }
        throw {
          type: ErrorType.NETWORK_ERROR,
          message: 'No internet connection and no cached data available.',
          code: 'OFFLINE_NO_CACHE',
        };
      }

      // If online, try to fetch fresh data
      try {
        const response = await this.api.get<TMDBResponse<Movie>>(
          `/trending/movie/${timeWindow}`,
          {
            params: {
              page,
            },
          },
        );

        // Cache the fresh data
        if (shouldUseCache) {
          await CacheService.cacheTrendingMovies(response.data, timeWindow);
        }

        return response.data;
      } catch (networkError) {
        // If network request fails but we have cached data, return it
        if (cachedData) {
          console.warn(
            'Network request failed, using cached data:',
            networkError,
          );
          return cachedData;
        }
        throw networkError;
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Fetch trending TV shows with caching and offline support
   */
  async getTrendingTVShows(
    timeWindow: 'day' | 'week' = 'week',
    page: number = 1,
  ): Promise<TMDBResponse<TVShow>> {
    try {
      // Check if we're offline
      const isOffline = await NetworkUtils.isOffline();

      // Try to get cached data first
      const shouldUseCache = page === 1;
      const cachedData = shouldUseCache
        ? await CacheService.getCachedTrendingTVShows(timeWindow)
        : null;

      if (isOffline) {
        if (cachedData) {
          return cachedData;
        }
        throw {
          type: ErrorType.NETWORK_ERROR,
          message: 'No internet connection and no cached data available.',
          code: 'OFFLINE_NO_CACHE',
        };
      }

      // If online, try to fetch fresh data
      try {
        const response = await this.api.get<TMDBResponse<TVShow>>(
          `/trending/tv/${timeWindow}`,
          {
            params: {
              page,
            },
          },
        );

        // Cache the fresh data
        if (shouldUseCache) {
          await CacheService.cacheTrendingTVShows(response.data, timeWindow);
        }

        return response.data;
      } catch (networkError) {
        // If network request fails but we have cached data, return it
        if (cachedData) {
          console.warn(
            'Network request failed, using cached data:',
            networkError,
          );
          return cachedData;
        }
        throw networkError;
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Search for movies and TV shows with caching and offline support
   */
  async searchMulti(
    query: string,
    page: number = 1,
  ): Promise<TMDBResponse<Movie | TVShow>> {
    try {
      if (!query.trim()) {
        throw {
          type: ErrorType.API_ERROR,
          message: 'Search query cannot be empty.',
          code: 'EMPTY_QUERY',
        };
      }

      // Check if we're offline
      const isOffline = await NetworkUtils.isOffline();

      // Try to get cached search results
      const cachedData = await CacheService.getCachedSearchResults(
        query.trim(),
        page,
      );

      if (isOffline) {
        if (cachedData) {
          return cachedData;
        }
        throw {
          type: ErrorType.NETWORK_ERROR,
          message:
            'No internet connection. Search requires an active connection.',
          code: 'OFFLINE_SEARCH',
        };
      }

      // If online, perform search
      try {
        const response = await this.api.get<TMDBResponse<Movie | TVShow>>(
          '/search/multi',
          {
            params: {
              query: query.trim(),
              page,
            },
          },
        );

        // Cache the search results
        await CacheService.cacheSearchResults(
          query.trim(),
          response.data,
          page,
        );

        return response.data;
      } catch (networkError) {
        // If network request fails but we have cached data, return it
        if (cachedData) {
          console.warn(
            'Search request failed, using cached results:',
            networkError,
          );
          return cachedData;
        }
        throw networkError;
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Search movies only
   */
  async searchMovies(
    query: string,
    page: number = 1,
  ): Promise<TMDBResponse<Movie>> {
    try {
      if (!query.trim()) {
        throw {
          type: ErrorType.API_ERROR,
          message: 'Search query cannot be empty.',
          code: 'EMPTY_QUERY',
        };
      }

      const response = await this.api.get<TMDBResponse<Movie>>(
        '/search/movie',
        {
          params: {
            query: query.trim(),
            page,
          },
        },
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Search TV shows only
   */
  async searchTVShows(
    query: string,
    page: number = 1,
  ): Promise<TMDBResponse<TVShow>> {
    try {
      if (!query.trim()) {
        throw {
          type: ErrorType.API_ERROR,
          message: 'Search query cannot be empty.',
          code: 'EMPTY_QUERY',
        };
      }

      const response = await this.api.get<TMDBResponse<TVShow>>('/search/tv', {
        params: {
          query: query.trim(),
          page,
        },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get movie details by ID
   */
  async getMovieDetails(id: number): Promise<MovieDetails> {
    try {
      const response = await this.api.get<MovieDetails>(`/movie/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get TV show details by ID
   */
  async getTVShowDetails(id: number): Promise<TVShowDetails> {
    try {
      const response = await this.api.get<TVShowDetails>(`/tv/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get movie videos (trailers, teasers, etc.)
   */
  async getMovieVideos(id: number): Promise<VideoResponse> {
    try {
      const response = await this.api.get<VideoResponse>(`/movie/${id}/videos`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get TV show videos (trailers, teasers, etc.)
   */
  async getTVShowVideos(id: number): Promise<VideoResponse> {
    try {
      const response = await this.api.get<VideoResponse>(`/tv/${id}/videos`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get similar movies
   */
  async getSimilarMovies(
    id: number,
    page: number = 1,
  ): Promise<TMDBResponse<Movie>> {
    try {
      const response = await this.api.get<TMDBResponse<Movie>>(
        `/movie/${id}/similar`,
        {
          params: {page},
        },
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get similar TV shows
   */
  async getSimilarTVShows(
    id: number,
    page: number = 1,
  ): Promise<TMDBResponse<TVShow>> {
    try {
      const response = await this.api.get<TMDBResponse<TVShow>>(
        `/tv/${id}/similar`,
        {
          params: {page},
        },
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get movie cast and crew
   */
  async getMovieCredits(id: number): Promise<CastResponse> {
    try {
      const response = await this.api.get<CastResponse>(`/movie/${id}/credits`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get TV show cast and crew
   */
  async getTVShowCredits(id: number): Promise<CastResponse> {
    try {
      const response = await this.api.get<CastResponse>(`/tv/${id}/credits`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get popular movies with caching and offline support
   */
  async getPopularMovies(page: number = 1): Promise<TMDBResponse<Movie>> {
    try {
      // Check if we're offline
      const isOffline = await NetworkUtils.isOffline();

      // Try to get cached data first
      const cachedData = await CacheService.getCachedPopularMovies(page);

      if (isOffline) {
        if (cachedData) {
          return cachedData;
        }
        throw {
          type: ErrorType.NETWORK_ERROR,
          message: 'No internet connection and no cached data available.',
          code: 'OFFLINE_NO_CACHE',
        };
      }

      // If online, try to fetch fresh data
      try {
        const response = await this.api.get<TMDBResponse<Movie>>(
          '/movie/popular',
          {
            params: {page},
          },
        );

        // Cache the fresh data
        await CacheService.cachePopularMovies(response.data, page);

        return response.data;
      } catch (networkError) {
        // If network request fails but we have cached data, return it
        if (cachedData) {
          console.warn(
            'Network request failed, using cached data:',
            networkError,
          );
          return cachedData;
        }
        throw networkError;
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get popular TV shows with caching and offline support
   */
  async getPopularTVShows(page: number = 1): Promise<TMDBResponse<TVShow>> {
    try {
      // Check if we're offline
      const isOffline = await NetworkUtils.isOffline();

      // Try to get cached data first
      const cachedData = await CacheService.getCachedPopularTVShows(page);

      if (isOffline) {
        if (cachedData) {
          return cachedData;
        }
        throw {
          type: ErrorType.NETWORK_ERROR,
          message: 'No internet connection and no cached data available.',
          code: 'OFFLINE_NO_CACHE',
        };
      }

      // If online, try to fetch fresh data
      try {
        const response = await this.api.get<TMDBResponse<TVShow>>(
          '/tv/popular',
          {
            params: {page},
          },
        );

        // Cache the fresh data
        await CacheService.cachePopularTVShows(response.data, page);

        return response.data;
      } catch (networkError) {
        // If network request fails but we have cached data, return it
        if (cachedData) {
          console.warn(
            'Network request failed, using cached data:',
            networkError,
          );
          return cachedData;
        }
        throw networkError;
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get top rated movies
   */
  async getTopRatedMovies(page: number = 1): Promise<TMDBResponse<Movie>> {
    try {
      const response = await this.api.get<TMDBResponse<Movie>>(
        '/movie/top_rated',
        {
          params: {page},
        },
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get top rated TV shows
   */
  async getTopRatedTVShows(page: number = 1): Promise<TMDBResponse<TVShow>> {
    try {
      const response = await this.api.get<TMDBResponse<TVShow>>(
        '/tv/top_rated',
        {
          params: {page},
        },
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get now playing movies
   */
  async getNowPlayingMovies(page: number = 1): Promise<TMDBResponse<Movie>> {
    try {
      const response = await this.api.get<TMDBResponse<Movie>>(
        '/movie/now_playing',
        {
          params: {page},
        },
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get upcoming movies
   */
  async getUpcomingMovies(page: number = 1): Promise<TMDBResponse<Movie>> {
    try {
      const response = await this.api.get<TMDBResponse<Movie>>(
        '/movie/upcoming',
        {
          params: {page},
        },
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get TV shows airing today
   */
  async getTVShowsAiringToday(page: number = 1): Promise<TMDBResponse<TVShow>> {
    try {
      const response = await this.api.get<TMDBResponse<TVShow>>(
        '/tv/airing_today',
        {
          params: {page},
        },
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get TV shows on the air
   */
  async getTVShowsOnTheAir(page: number = 1): Promise<TMDBResponse<TVShow>> {
    try {
      const response = await this.api.get<TMDBResponse<TVShow>>(
        '/tv/on_the_air',
        {
          params: {page},
        },
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get season details for a TV show
   */
  async getSeasonDetails(tvId: number, seasonNumber: number): Promise<any> {
    try {
      const response = await this.api.get(
        `/tv/${tvId}/season/${seasonNumber}`,
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get episode details for a specific season
   */
  async getEpisodeDetails(
    tvId: number,
    seasonNumber: number,
    episodeNumber: number,
  ): Promise<any> {
    try {
      const response = await this.api.get(
        `/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}`,
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Discover movies by genre
   */
  async discoverMoviesByGenre(
    genreId: number,
    page: number = 1,
  ): Promise<TMDBResponse<Movie>> {
    try {
      const response = await this.api.get<TMDBResponse<Movie>>('/discover/movie', {
        params: {
          with_genres: genreId,
          page,
          sort_by: 'popularity.desc',
        },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Discover TV shows by genre
   */
  async discoverTVShowsByGenre(
    genreId: number,
    page: number = 1,
  ): Promise<TMDBResponse<TVShow>> {
    try {
      const response = await this.api.get<TMDBResponse<TVShow>>('/discover/tv', {
        params: {
          with_genres: genreId,
          page,
          sort_by: 'popularity.desc',
        },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get movie genres
   */
  async getMovieGenres(): Promise<{genres: Genre[]}> {
    try {
      const response = await this.api.get<{genres: Genre[]}>('/genre/movie/list');
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get TV show genres
   */
  async getTVGenres(): Promise<{genres: Genre[]}> {
    try {
      const response = await this.api.get<{genres: Genre[]}>('/genre/tv/list');
      return response.data;
    } catch (error) {
      throw error;
    }
  }
}
