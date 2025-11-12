import {Image} from 'react-native';
import {Movie, TVShow} from '../types';
import {TMDB_CONFIG} from './constants';

export interface PreloadOptions {
  priority?: 'low' | 'normal' | 'high';
  maxConcurrent?: number;
  batchSize?: number;
}

class ImagePreloader {
  private static instance: ImagePreloader;
  private preloadQueue: string[] = [];
  private preloading = false;
  private maxConcurrent = 3;
  private currentlyPreloading = 0;

  static getInstance(): ImagePreloader {
    if (!ImagePreloader.instance) {
      ImagePreloader.instance = new ImagePreloader();
    }
    return ImagePreloader.instance;
  }

  /**
   * Preload images for a list of content items
   */
  async preloadContentImages(
    items: (Movie | TVShow)[],
    options: PreloadOptions = {},
  ): Promise<void> {
    const {priority = 'normal', maxConcurrent = 3, batchSize = 10} = options;
    this.maxConcurrent = maxConcurrent;

    const imageUrls = items
      .slice(0, batchSize)
      .map(item => item.poster_path)
      .filter(Boolean)
      .map(path => `${TMDB_CONFIG.IMAGE_BASE_URL}${path}`);

    await this.preloadImages(imageUrls, priority);
  }

  /**
   * Preload a batch of image URLs
   */
  async preloadImages(
    urls: string[],
    priority: 'low' | 'normal' | 'high' = 'normal',
  ): Promise<void> {
    const promises = urls.map(url => this.preloadSingleImage(url, priority));
    
    try {
      await Promise.allSettled(promises);
    } catch (error) {
      console.warn('Image preload failed:', error);
    }
  }

  /**
   * Preload images with queue management for better performance
   */
  async preloadImagesWithQueue(
    urls: string[],
    priority: 'low' | 'normal' | 'high' = 'normal',
  ): Promise<void> {
    this.preloadQueue.push(...urls);

    if (!this.preloading) {
      this.processPreloadQueue(priority);
    }
  }

  /**
   * Process the preload queue with concurrency control
   */
  private async processPreloadQueue(
    priority: 'low' | 'normal' | 'high',
  ): Promise<void> {
    this.preloading = true;

    while (
      this.preloadQueue.length > 0 &&
      this.currentlyPreloading < this.maxConcurrent
    ) {
      const url = this.preloadQueue.shift();
      if (url) {
        this.currentlyPreloading++;
        this.preloadSingleImage(url, priority).finally(() => {
          this.currentlyPreloading--;
        });
      }
    }

    // Wait for all current preloads to complete
    while (this.currentlyPreloading > 0) {
      await new Promise<void>(resolve => setTimeout(resolve, 100));
    }

    this.preloading = false;
  }

  /**
   * Preload a single image using React Native's Image.prefetch
   */
  private async preloadSingleImage(
    url: string,
    priority: 'low' | 'normal' | 'high',
  ): Promise<void> {
    try {
      // React Native's Image.prefetch doesn't support priority, but we can implement it differently
      if (priority === 'high') {
        // For high priority, prefetch immediately
        await Image.prefetch(url);
      } else if (priority === 'normal') {
        // For normal priority, add a small delay
        await new Promise<void>(resolve => setTimeout(resolve, 100));
        await Image.prefetch(url);
      } else {
        // For low priority, add a longer delay
        await new Promise<void>(resolve => setTimeout(resolve, 500));
        await Image.prefetch(url);
      }
    } catch (error) {
      console.warn(`Failed to preload image: ${url}`, error);
    }
  }



  /**
   * Clear the preload queue
   */
  clearQueue(): void {
    this.preloadQueue = [];
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    queueLength: number;
    currentlyPreloading: number;
    isPreloading: boolean;
  } {
    return {
      queueLength: this.preloadQueue.length,
      currentlyPreloading: this.currentlyPreloading,
      isPreloading: this.preloading,
    };
  }
}

// Export singleton instance
export const imagePreloader = ImagePreloader.getInstance();

// Utility functions for common use cases
export const preloadMoviePosters = async (
  movies: Movie[],
  options?: PreloadOptions,
): Promise<void> => {
  return imagePreloader.preloadContentImages(movies, options);
};

export const preloadTVShowPosters = async (
  tvShows: TVShow[],
  options?: PreloadOptions,
): Promise<void> => {
  return imagePreloader.preloadContentImages(tvShows, options);
};

export const preloadMixedContent = async (
  content: (Movie | TVShow)[],
  options?: PreloadOptions,
): Promise<void> => {
  return imagePreloader.preloadContentImages(content, options);
};
