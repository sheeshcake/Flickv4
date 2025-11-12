import AsyncStorage from '@react-native-async-storage/async-storage';
import {UserPreferences, WatchProgress, ErrorType, AppError} from '../types';

/**
 * StorageService handles all local storage operations for user preferences,
 * liked content, and continue watching data using AsyncStorage
 */
export class StorageService {
  // Storage keys for different data types
  private static readonly STORAGE_KEYS = {
    USER_PREFERENCES: '@netflix_clone:user_preferences',
    LIKED_MOVIES: '@netflix_clone:liked_movies',
    LIKED_TV_SHOWS: '@netflix_clone:liked_tv_shows',
    CONTINUE_WATCHING: '@netflix_clone:continue_watching',
    THEME: '@netflix_clone:theme',
  } as const;

  // Default user preferences
  private static readonly DEFAULT_PREFERENCES: UserPreferences = {
    likedMovies: [],
    likedTVShows: [],
    continueWatching: [],
    theme: 'dark',
    autoplay: true,
    pictureInPicture: true,
    defaultSubtitleLanguage: undefined,
    autoSelectSubtitles: false,
  };

  /**
   * Save complete user preferences to storage
   */
  static async saveUserPreferences(
    preferences: UserPreferences,
  ): Promise<void> {
    try {
      const preferencesJson = JSON.stringify(preferences);
      await AsyncStorage.setItem(
        this.STORAGE_KEYS.USER_PREFERENCES,
        preferencesJson,
      );
    } catch (error) {
      throw this.createStorageError('Failed to save user preferences', error);
    }
  }

  /**
   * Retrieve user preferences from storage
   */
  static async getUserPreferences(): Promise<UserPreferences> {
    try {
      const preferencesJson = await AsyncStorage.getItem(
        this.STORAGE_KEYS.USER_PREFERENCES,
      );

      if (preferencesJson) {
        const preferences = JSON.parse(preferencesJson);
        // Ensure all required fields exist with defaults
        return {
          ...this.DEFAULT_PREFERENCES,
          ...preferences,
          // Parse Date objects in continue watching
          continueWatching:
            preferences.continueWatching?.map((item: any) => ({
              ...item,
              lastWatched: new Date(item.lastWatched),
            })) || [],
        };
      }

      return this.DEFAULT_PREFERENCES;
    } catch (error) {
      console.warn('Failed to load user preferences, using defaults:', error);
      return this.DEFAULT_PREFERENCES;
    }
  }

  /**
   * Add content to liked list (movies or TV shows)
   */
  static async addLikedContent(
    id: number,
    type: 'movie' | 'tv',
  ): Promise<void> {
    try {
      const storageKey =
        type === 'movie'
          ? this.STORAGE_KEYS.LIKED_MOVIES
          : this.STORAGE_KEYS.LIKED_TV_SHOWS;

      const existingLiked = await this.getLikedContentByType(type);

      // Avoid duplicates
      if (!existingLiked.includes(id)) {
        const updatedLiked = [...existingLiked, id];
        await AsyncStorage.setItem(storageKey, JSON.stringify(updatedLiked));
      }
    } catch (error) {
      throw this.createStorageError(`Failed to add liked ${type}`, error);
    }
  }

  /**
   * Remove content from liked list
   */
  static async removeLikedContent(
    id: number,
    type: 'movie' | 'tv',
  ): Promise<void> {
    try {
      const storageKey =
        type === 'movie'
          ? this.STORAGE_KEYS.LIKED_MOVIES
          : this.STORAGE_KEYS.LIKED_TV_SHOWS;

      const existingLiked = await this.getLikedContentByType(type);
      const updatedLiked = existingLiked.filter(likedId => likedId !== id);

      await AsyncStorage.setItem(storageKey, JSON.stringify(updatedLiked));
    } catch (error) {
      throw this.createStorageError(`Failed to remove liked ${type}`, error);
    }
  }

  /**
   * Get all liked content (movies and TV shows)
   */
  static async getLikedContent(): Promise<{
    movies: number[];
    tvShows: number[];
  }> {
    try {
      const [movies, tvShows] = await Promise.all([
        this.getLikedContentByType('movie'),
        this.getLikedContentByType('tv'),
      ]);

      return {movies, tvShows};
    } catch (error) {
      console.warn('Failed to load liked content:', error);
      return {movies: [], tvShows: []};
    }
  }

  /**
   * Get liked content by type (internal helper)
   */
  private static async getLikedContentByType(
    type: 'movie' | 'tv',
  ): Promise<number[]> {
    try {
      const storageKey =
        type === 'movie'
          ? this.STORAGE_KEYS.LIKED_MOVIES
          : this.STORAGE_KEYS.LIKED_TV_SHOWS;

      const likedJson = await AsyncStorage.getItem(storageKey);
      return likedJson ? JSON.parse(likedJson) : [];
    } catch (error) {
      console.warn(`Failed to load liked ${type}s:`, error);
      return [];
    }
  }

  /**
   * Update watch progress for continue watching functionality
   */
  static async updateWatchProgress(progress: WatchProgress): Promise<void> {
    try {
      const existingProgress = await this.getWatchProgress();

      // Find existing progress for this content or add new entry
      const existingIndex = existingProgress.findIndex(
        item =>
          item.contentId === progress.contentId &&
          item.contentType === progress.contentType,
      );

      let updatedProgress: WatchProgress[];

      if (existingIndex >= 0) {
        // Update existing progress
        updatedProgress = [...existingProgress];
        updatedProgress[existingIndex] = progress;
      } else {
        // Add new progress entry
        updatedProgress = [...existingProgress, progress];
      }

      // Sort by last watched date (most recent first)
      updatedProgress.sort(
        (a, b) =>
          new Date(b.lastWatched).getTime() - new Date(a.lastWatched).getTime(),
      );

      // Limit to 20 most recent items to prevent storage bloat
      if (updatedProgress.length > 20) {
        updatedProgress = updatedProgress.slice(0, 20);
      }

      await AsyncStorage.setItem(
        this.STORAGE_KEYS.CONTINUE_WATCHING,
        JSON.stringify(updatedProgress),
      );

      // Keep stored user preferences in sync with continue watching updates
      const preferencesJson = await AsyncStorage.getItem(
        this.STORAGE_KEYS.USER_PREFERENCES,
      );

      if (preferencesJson) {
        const storedPreferences = JSON.parse(preferencesJson);
        const mergedPreferences = {
          ...this.DEFAULT_PREFERENCES,
          ...storedPreferences,
          continueWatching: updatedProgress,
        };

        await AsyncStorage.setItem(
          this.STORAGE_KEYS.USER_PREFERENCES,
          JSON.stringify(mergedPreferences),
        );
      }
    } catch (error) {
      throw this.createStorageError('Failed to update watch progress', error);
    }
  }

  /**
   * Get all continue watching progress data
   */
  static async getWatchProgress(): Promise<WatchProgress[]> {
    try {
      const progressJson = await AsyncStorage.getItem(
        this.STORAGE_KEYS.CONTINUE_WATCHING,
      );

      if (progressJson) {
        const progress = JSON.parse(progressJson);
        // Parse Date objects
        return progress.map((item: any) => ({
          ...item,
          lastWatched: new Date(item.lastWatched),
        }));
      }

      return [];
    } catch (error) {
      console.warn('Failed to load watch progress:', error);
      return [];
    }
  }

  /**
   * Remove content from continue watching list
   */
  static async removeFromContinueWatching(
    contentId: number,
    contentType: 'movie' | 'tv',
  ): Promise<void> {
    try {
      const existingProgress = await this.getWatchProgress();
      const updatedProgress = existingProgress.filter(
        item =>
          !(item.contentId === contentId && item.contentType === contentType),
      );

      await AsyncStorage.setItem(
        this.STORAGE_KEYS.CONTINUE_WATCHING,
        JSON.stringify(updatedProgress),
      );
    } catch (error) {
      throw this.createStorageError(
        'Failed to remove from continue watching',
        error,
      );
    }
  }

  /**
   * Save theme preference
   */
  static async saveTheme(theme: 'light' | 'dark'): Promise<void> {
    try {
      await AsyncStorage.setItem(this.STORAGE_KEYS.THEME, theme);
    } catch (error) {
      throw this.createStorageError('Failed to save theme preference', error);
    }
  }

  /**
   * Get theme preference
   */
  static async getTheme(): Promise<'light' | 'dark'> {
    try {
      const theme = await AsyncStorage.getItem(this.STORAGE_KEYS.THEME);
      return (theme as 'light' | 'dark') || 'dark';
    } catch (error) {
      console.warn('Failed to load theme preference, using default:', error);
      return 'dark';
    }
  }

  /**
   * Clear all stored data (useful for logout or reset functionality)
   */
  static async clearAllData(): Promise<void> {
    try {
      const keys = Object.values(this.STORAGE_KEYS);
      await AsyncStorage.multiRemove(keys);
    } catch (error) {
      throw this.createStorageError('Failed to clear all data', error);
    }
  }

  /**
   * Get storage usage information for debugging
   */
  static async getStorageInfo(): Promise<{
    keys: string[];
    totalSize: number;
  }> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const appKeys = keys.filter(key => key.startsWith('@netflix_clone:'));

      // Calculate approximate storage size
      let totalSize = 0;
      for (const key of appKeys) {
        const value = await AsyncStorage.getItem(key);
        if (value) {
          totalSize += value.length;
        }
      }

      return {
        keys: appKeys,
        totalSize,
      };
    } catch (error) {
      console.warn('Failed to get storage info:', error);
      return {keys: [], totalSize: 0};
    }
  }

  /**
   * Check if content is liked
   */
  static async isContentLiked(
    id: number,
    type: 'movie' | 'tv',
  ): Promise<boolean> {
    try {
      const likedContent = await this.getLikedContentByType(type);
      return likedContent.includes(id);
    } catch (error) {
      console.warn('Failed to check if content is liked:', error);
      return false;
    }
  }

  /**
   * Get watch progress for specific content
   */
  static async getContentWatchProgress(
    contentId: number,
    contentType: 'movie' | 'tv',
  ): Promise<WatchProgress | null> {
    try {
      const allProgress = await this.getWatchProgress();
      return (
        allProgress.find(
          item =>
            item.contentId === contentId && item.contentType === contentType,
        ) || null
      );
    } catch (error) {
      console.warn('Failed to get content watch progress:', error);
      return null;
    }
  }

  /**
   * Create standardized storage error
   */
  private static createStorageError(
    message: string,
    originalError: any,
  ): AppError {
    return {
      type: ErrorType.STORAGE_ERROR,
      message,
      code: originalError?.code || 'STORAGE_ERROR',
    };
  }

  /**
   * Generic method to set item in AsyncStorage
   */
  static async setItem(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      throw this.createStorageError(`Failed to save ${key}`, error);
    }
  }

  /**
   * Generic method to get item from AsyncStorage
   */
  static async getItem(key: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.warn(`Failed to load ${key}:`, error);
      return null;
    }
  }

  /**
   * Generic method to remove item from AsyncStorage
   */
  static async removeItem(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      throw this.createStorageError(`Failed to remove ${key}`, error);
    }
  }
}
