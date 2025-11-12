import AsyncStorage from '@react-native-async-storage/async-storage';
import {Movie, TVShow, TMDBResponse} from '../types';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxAge?: number; // Maximum age in milliseconds
}

/**
 * CacheService handles caching of API responses for offline support
 */
export class CacheService {
  private static readonly CACHE_PREFIX = '@netflix_clone:cache:';
  private static readonly DEFAULT_TTL = 1000 * 60 * 60; // 1 hour
  // private static readonly MAX_CACHE_SIZE = 50; // Maximum number of cached entries per type

  // Cache keys for different content types
  private static readonly CACHE_KEYS = {
    TRENDING_MOVIES: 'trending_movies',
    TRENDING_TV_SHOWS: 'trending_tv_shows',
    POPULAR_MOVIES: 'popular_movies',
    POPULAR_TV_SHOWS: 'popular_tv_shows',
    SEARCH_RESULTS: 'search_results',
    MOVIE_DETAILS: 'movie_details',
    TV_SHOW_DETAILS: 'tv_show_details',
    MOVIE_VIDEOS: 'movie_videos',
    TV_SHOW_VIDEOS: 'tv_show_videos',
    SIMILAR_MOVIES: 'similar_movies',
    SIMILAR_TV_SHOWS: 'similar_tv_shows',
  } as const;

  /**
   * Store data in cache with expiration
   */
  static async set<T>(
    key: string,
    data: T,
    options: CacheOptions = {},
  ): Promise<void> {
    try {
      const ttl = options.ttl || this.DEFAULT_TTL;
      const now = Date.now();

      const cacheEntry: CacheEntry<T> = {
        data,
        timestamp: now,
        expiresAt: now + ttl,
      };

      const cacheKey = this.getCacheKey(key);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
    } catch (error) {
      console.warn('Failed to cache data:', error);
      // Don't throw error for cache failures to avoid breaking app functionality
    }
  }

  /**
   * Retrieve data from cache
   */
  static async get<T>(key: string): Promise<T | null> {
    try {
      const cacheKey = this.getCacheKey(key);
      const cachedData = await AsyncStorage.getItem(cacheKey);

      if (!cachedData) {
        return null;
      }

      const cacheEntry: CacheEntry<T> = JSON.parse(cachedData);
      const now = Date.now();

      // Check if cache entry has expired
      if (now > cacheEntry.expiresAt) {
        // Remove expired entry
        await this.remove(key);
        return null;
      }

      return cacheEntry.data;
    } catch (error) {
      console.warn('Failed to retrieve cached data:', error);
      return null;
    }
  }

  /**
   * Remove specific cache entry
   */
  static async remove(key: string): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(key);
      await AsyncStorage.removeItem(cacheKey);
    } catch (error) {
      console.warn('Failed to remove cached data:', error);
    }
  }

  /**
   * Check if cache entry exists and is valid
   */
  static async has(key: string): Promise<boolean> {
    try {
      const cacheKey = this.getCacheKey(key);
      const cachedData = await AsyncStorage.getItem(cacheKey);

      if (!cachedData) {
        return false;
      }

      const cacheEntry: CacheEntry<any> = JSON.parse(cachedData);
      const now = Date.now();

      return now <= cacheEntry.expiresAt;
    } catch (error) {
      console.warn('Failed to check cache:', error);
      return false;
    }
  }

  /**
   * Clear all cache entries
   */
  static async clearAll(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => key.startsWith(this.CACHE_PREFIX));

      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
      }
    } catch (error) {
      console.warn('Failed to clear cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  static async getStats(): Promise<{
    totalEntries: number;
    totalSize: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  }> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => key.startsWith(this.CACHE_PREFIX));

      let totalSize = 0;
      let oldestEntry: number | null = null;
      let newestEntry: number | null = null;

      for (const key of cacheKeys) {
        const data = await AsyncStorage.getItem(key);
        if (data) {
          totalSize += data.length;

          try {
            const cacheEntry: CacheEntry<any> = JSON.parse(data);
            if (oldestEntry === null || cacheEntry.timestamp < oldestEntry) {
              oldestEntry = cacheEntry.timestamp;
            }
            if (newestEntry === null || cacheEntry.timestamp > newestEntry) {
              newestEntry = cacheEntry.timestamp;
            }
          } catch (parseError) {
            // Skip invalid cache entries
          }
        }
      }

      return {
        totalEntries: cacheKeys.length,
        totalSize,
        oldestEntry,
        newestEntry,
      };
    } catch (error) {
      console.warn('Failed to get cache stats:', error);
      return {
        totalEntries: 0,
        totalSize: 0,
        oldestEntry: null,
        newestEntry: null,
      };
    }
  }

  /**
   * Clean up expired cache entries
   */
  static async cleanup(): Promise<number> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => key.startsWith(this.CACHE_PREFIX));
      const now = Date.now();
      let removedCount = 0;

      for (const key of cacheKeys) {
        try {
          const data = await AsyncStorage.getItem(key);
          if (data) {
            const cacheEntry: CacheEntry<any> = JSON.parse(data);
            if (now > cacheEntry.expiresAt) {
              await AsyncStorage.removeItem(key);
              removedCount++;
            }
          }
        } catch (error) {
          // Remove invalid cache entries
          await AsyncStorage.removeItem(key);
          removedCount++;
        }
      }

      return removedCount;
    } catch (error) {
      console.warn('Failed to cleanup cache:', error);
      return 0;
    }
  }

  // Specific cache methods for different content types

  /**
   * Cache trending movies
   */
  static async cacheTrendingMovies(
    data: TMDBResponse<Movie>,
    timeWindow: 'day' | 'week' = 'week',
  ): Promise<void> {
    const key = `${this.CACHE_KEYS.TRENDING_MOVIES}_${timeWindow}`;
    await this.set(key, data, {ttl: 1000 * 60 * 30}); // 30 minutes
  }

  /**
   * Get cached trending movies
   */
  static async getCachedTrendingMovies(
    timeWindow: 'day' | 'week' = 'week',
  ): Promise<TMDBResponse<Movie> | null> {
    const key = `${this.CACHE_KEYS.TRENDING_MOVIES}_${timeWindow}`;
    return await this.get<TMDBResponse<Movie>>(key);
  }

  /**
   * Cache trending TV shows
   */
  static async cacheTrendingTVShows(
    data: TMDBResponse<TVShow>,
    timeWindow: 'day' | 'week' = 'week',
  ): Promise<void> {
    const key = `${this.CACHE_KEYS.TRENDING_TV_SHOWS}_${timeWindow}`;
    await this.set(key, data, {ttl: 1000 * 60 * 30}); // 30 minutes
  }

  /**
   * Get cached trending TV shows
   */
  static async getCachedTrendingTVShows(
    timeWindow: 'day' | 'week' = 'week',
  ): Promise<TMDBResponse<TVShow> | null> {
    const key = `${this.CACHE_KEYS.TRENDING_TV_SHOWS}_${timeWindow}`;
    return await this.get<TMDBResponse<TVShow>>(key);
  }

  /**
   * Cache popular movies
   */
  static async cachePopularMovies(
    data: TMDBResponse<Movie>,
    page: number = 1,
  ): Promise<void> {
    const key = `${this.CACHE_KEYS.POPULAR_MOVIES}_${page}`;
    await this.set(key, data, {ttl: 1000 * 60 * 60}); // 1 hour
  }

  /**
   * Get cached popular movies
   */
  static async getCachedPopularMovies(
    page: number = 1,
  ): Promise<TMDBResponse<Movie> | null> {
    const key = `${this.CACHE_KEYS.POPULAR_MOVIES}_${page}`;
    return await this.get<TMDBResponse<Movie>>(key);
  }

  /**
   * Cache popular TV shows
   */
  static async cachePopularTVShows(
    data: TMDBResponse<TVShow>,
    page: number = 1,
  ): Promise<void> {
    const key = `${this.CACHE_KEYS.POPULAR_TV_SHOWS}_${page}`;
    await this.set(key, data, {ttl: 1000 * 60 * 60}); // 1 hour
  }

  /**
   * Get cached popular TV shows
   */
  static async getCachedPopularTVShows(
    page: number = 1,
  ): Promise<TMDBResponse<TVShow> | null> {
    const key = `${this.CACHE_KEYS.POPULAR_TV_SHOWS}_${page}`;
    return await this.get<TMDBResponse<TVShow>>(key);
  }

  /**
   * Cache search results
   */
  static async cacheSearchResults(
    query: string,
    data: TMDBResponse<Movie | TVShow>,
    page: number = 1,
  ): Promise<void> {
    const key = `${
      this.CACHE_KEYS.SEARCH_RESULTS
    }_${query.toLowerCase()}_${page}`;
    await this.set(key, data, {ttl: 1000 * 60 * 15}); // 15 minutes
  }

  /**
   * Get cached search results
   */
  static async getCachedSearchResults(
    query: string,
    page: number = 1,
  ): Promise<TMDBResponse<Movie | TVShow> | null> {
    const key = `${
      this.CACHE_KEYS.SEARCH_RESULTS
    }_${query.toLowerCase()}_${page}`;
    return await this.get<TMDBResponse<Movie | TVShow>>(key);
  }

  /**
   * Generate cache key with prefix
   */
  private static getCacheKey(key: string): string {
    return `${this.CACHE_PREFIX}${key}`;
  }
}
