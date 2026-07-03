import RNFS from 'react-native-fs';
import RNBackgroundDownloader, { DownloadTask } from '@kesha-antonov/react-native-background-downloader';
import { fromByteArray } from 'react-native-quick-base64';
import { 
  DownloadItem, 
  DownloadStatus, 
  DownloadQuality, 
  DownloadProgress,
  DownloadNotification,
  Movie, 
  TVShow,
  ErrorType,
  AppError,
  M3U8StreamInfo
} from '../types';
import { TMDBService } from './TMDBService';
import { StorageService } from './StorageService';
import { notificationService } from './NotificationService';
import {
  startBackgroundDownload,
  stopBackgroundDownload,
  isBackgroundDownloadRunning,
  BackgroundDownloadParams,
} from './BackgroundDownloadTask';
import { VIDEO_STREAM_HEADERS } from '../utils/streamHeaders';
import {
  isM3U8Url,
  fetchM3U8Playlist,
  getAvailableResolutions as getM3U8Resolutions,
  downloadSegmentToFile,
  getSegmentPath,
} from '../utils/m3u8';

export interface DownloadOptions {
  quality: DownloadQuality;
  downloadSubtitles?: boolean;
  wifiOnly?: boolean;
  overwriteExisting?: boolean;
  selectedStreamUrl?: string; // For M3U8: specific stream URL from getAvailableResolutions
  useBackgroundTask?: boolean; // Use HeadlessJS background task for better performance
}

export interface DownloadJobResult {
  task: DownloadTask;
  taskId: string;
}

export interface M3U8Segment {
  uri: string;
  duration: number;
  timeline: number;
  index: number;
}

export interface M3U8Playlist {
  segments: M3U8Segment[];
  targetDuration: number;
  mediaSequence: number;
  endList: boolean;
  version: number;
  totalDuration: number;
}

export interface M3U8DownloadState {
  downloadId: string;
  playlistUrl: string;
  segments: M3U8Segment[];
  downloadedSegments: Set<number>;
  failedSegments: Map<number, number>; // segment index -> retry count
  totalSegments: number;
  segmentsDir: string;
  outputPath: string;
  isPaused: boolean;
  isCancelled: boolean;
  totalBytes: number;
  downloadedBytes: number;
}

// Configuration
const CONFIG = {
  M3U8_CONCURRENCY: 3, // Download 3 segments at a time (reduced for better performance)
  MAX_RETRIES: 3, // Retry failed segments up to 3 times
  RETRY_DELAY: 1000, // Wait 1 second before retrying
  PROGRESS_NOTIFICATION_INTERVAL: 5000, // Update notification every 5 seconds
  PROGRESS_SAVE_INTERVAL: 15000, // Save progress to storage every 15 seconds
  PROGRESS_LISTENER_INTERVAL: 2000, // Minimum interval between progress listener calls (2 seconds)
};

/**
 * DownloadService handles downloading and managing offline content
 * 
 * Features:
 * - Concurrent M3U8 segment downloads (5 at a time by default)
 * - Pause/Resume support for all downloads including M3U8
 * - Automatic retry for failed segments (up to 3 retries)
 * - Background download support
 * - Progress persistence for resume after app restart
 */
export class DownloadService {
  private static instance: DownloadService;
  private downloads: Map<string, DownloadItem> = new Map();
  private activeDownloads: Map<string, DownloadJobResult> = new Map();
  private m3u8Downloads: Map<string, M3U8DownloadState> = new Map();
  private downloadListeners: Map<string, (progress: DownloadProgress) => void> = new Map();
  private notificationListeners: Set<(notification: DownloadNotification) => void> = new Set();
  private tmdbService: TMDBService;
  private lastProgressNotification: Map<string, number> = new Map();
  private lastProgressSave: Map<string, number> = new Map();
  private lastProgressListener: Map<string, number> = new Map();

  // Storage paths
  private static readonly DOWNLOADS_DIR = `${RNFS.DocumentDirectoryPath}/FlickDownloads`;
  private static readonly VIDEOS_DIR = `${DownloadService.DOWNLOADS_DIR}/videos`;
  private static readonly THUMBNAILS_DIR = `${DownloadService.DOWNLOADS_DIR}/thumbnails`;
  private static readonly SUBTITLES_DIR = `${DownloadService.DOWNLOADS_DIR}/subtitles`;
  private static readonly M3U8_STATE_DIR = `${DownloadService.DOWNLOADS_DIR}/m3u8_state`;
  private static readonly DOWNLOADS_STORAGE_KEY = '@netflix_clone:downloads';

  private constructor() {
    this.tmdbService = new TMDBService();
    this.initializeDownloadsDirectory()
      .catch((err) => console.warn('Failed to initialize downloads directory:', err))
      .finally(() => this.loadDownloadsFromStorage());
  }

  /**
   * Get singleton instance
   */
  static getInstance(): DownloadService {
    if (!DownloadService.instance) {
      DownloadService.instance = new DownloadService();
    }
    return DownloadService.instance;
  }

  /**
   * Initialize downloads directory structure
   */
  private async initializeDownloadsDirectory(): Promise<void> {
    try {
      const directories = [
        DownloadService.DOWNLOADS_DIR,
        DownloadService.VIDEOS_DIR,
        DownloadService.THUMBNAILS_DIR,
        DownloadService.SUBTITLES_DIR,
        DownloadService.M3U8_STATE_DIR,
      ];

      for (const dir of directories) {
        const exists = await RNFS.exists(dir);
        if (!exists) {
          await RNFS.mkdir(dir);
        }
      }
    } catch (error) {
      console.error('Failed to initialize downloads directory:', error);
      throw this.createDownloadError('Failed to initialize downloads directory', error);
    }
  }

  /**
   * Load downloads from AsyncStorage
   */
  private async loadDownloadsFromStorage(): Promise<void> {
    try {
      const downloadsData = await StorageService.getItem(DownloadService.DOWNLOADS_STORAGE_KEY);
      if (downloadsData) {
        const downloads: DownloadItem[] = JSON.parse(downloadsData);
        downloads.forEach(download => {
          download.createdAt = new Date(download.createdAt);
          download.updatedAt = new Date(download.updatedAt);
          if (download.startedAt) download.startedAt = new Date(download.startedAt);
          if (download.completedAt) download.completedAt = new Date(download.completedAt);
          
          // Reset downloading status to paused on app restart
          if (download.status === DownloadStatus.DOWNLOADING) {
            download.status = DownloadStatus.PAUSED;
          }
          
          this.downloads.set(download.id, download);
        });
      }
      
      // Load M3U8 download states
      await this.loadM3U8States();
    } catch (error) {
      console.warn('Failed to load downloads from storage:', error);
    }
  }

  /**
   * Save downloads to AsyncStorage
   */
  private async saveDownloadsToStorage(): Promise<void> {
    try {
      const downloads = Array.from(this.downloads.values());
      await StorageService.setItem(DownloadService.DOWNLOADS_STORAGE_KEY, JSON.stringify(downloads));
    } catch (error) {
      console.error('Failed to save downloads to storage:', error);
    }
  }

  /**
   * Save M3U8 download state for resume support
   */
  private async saveM3U8State(state: M3U8DownloadState): Promise<void> {
    try {
      const statePath = `${DownloadService.M3U8_STATE_DIR}/${state.downloadId}.json`;
      const stateData = {
        ...state,
        downloadedSegments: Array.from(state.downloadedSegments),
        failedSegments: Array.from(state.failedSegments.entries()),
      };
      await RNFS.writeFile(statePath, JSON.stringify(stateData), 'utf8');
    } catch (error) {
      console.warn('Failed to save M3U8 state:', error);
    }
  }

  /**
   * Load M3U8 download states for resume support
   */
  private async loadM3U8States(): Promise<void> {
    try {
      const stateDir = DownloadService.M3U8_STATE_DIR;
      const exists = await RNFS.exists(stateDir);
      if (!exists) return;

      const files = await RNFS.readDir(stateDir);
      for (const file of files) {
        if (file.name.endsWith('.json')) {
          try {
            const content = await RNFS.readFile(file.path, 'utf8');
            const stateData = JSON.parse(content);
            const state: M3U8DownloadState = {
              ...stateData,
              downloadedSegments: new Set(stateData.downloadedSegments),
              failedSegments: new Map(stateData.failedSegments),
              isPaused: true, // Start paused
              isCancelled: false,
            };
            this.m3u8Downloads.set(state.downloadId, state);
          } catch (e) {
            console.warn(`Failed to load M3U8 state from ${file.name}:`, e);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load M3U8 states:', error);
    }
  }

  /**
   * Delete M3U8 state file
   */
  private async deleteM3U8State(downloadId: string): Promise<void> {
    try {
      const statePath = `${DownloadService.M3U8_STATE_DIR}/${downloadId}.json`;
      const exists = await RNFS.exists(statePath);
      if (exists) {
        await RNFS.unlink(statePath);
      }
      this.m3u8Downloads.delete(downloadId);
    } catch (error) {
      console.warn('Failed to delete M3U8 state:', error);
    }
  }

  /**
   * Generate unique download ID
   */
  private generateDownloadId(
    contentId: number, 
    contentType: 'movie' | 'tv', 
    season?: number, 
    episode?: number
  ): string {
    const base = `${contentType}_${contentId}`;
    if (contentType === 'tv' && season !== undefined && episode !== undefined) {
      return `${base}_s${season}_e${episode}`;
    }
    return base;
  }

  /**
   * Generate file paths for downloads
   */
  private generateFilePaths(downloadId: string, quality: DownloadQuality) {
    const videoFileName = `${downloadId}_${quality}.mp4`;
    const thumbnailFileName = `${downloadId}_thumb.jpg`;
    
    return {
      videoPath: `${DownloadService.VIDEOS_DIR}/${videoFileName}`,
      thumbnailPath: `${DownloadService.THUMBNAILS_DIR}/${thumbnailFileName}`,
      subtitlesDir: `${DownloadService.SUBTITLES_DIR}/${downloadId}`,
      segmentsDir: `${DownloadService.VIDEOS_DIR}/${downloadId}_segments`,
    };
  }

  /**
   * Start downloading content
   */
  async startDownload(
    content: Movie | TVShow,
    videoUrl: string,
    options: DownloadOptions,
    season?: number,
    episode?: number,
    episodeTitle?: string
  ): Promise<string> {
    try {
      const contentType = 'title' in content ? 'movie' : 'tv';
      const downloadId = this.generateDownloadId(content.id, contentType, season, episode);

      // Check if already downloaded or downloading
      const existingDownload = this.downloads.get(downloadId);
      if (existingDownload) {
        if (existingDownload.status === DownloadStatus.COMPLETED) {
          throw this.createDownloadError('Content already downloaded', null);
        }
        if (existingDownload.status === DownloadStatus.DOWNLOADING) {
          throw this.createDownloadError('Content is already being downloaded', null);
        }
        // If paused, resume instead
        if (existingDownload.status === DownloadStatus.PAUSED) {
          await this.resumeDownload(downloadId);
          return downloadId;
        }
        // If cancelled or failed, clean up old state before starting fresh
        if (existingDownload.status === DownloadStatus.CANCELLED || 
            existingDownload.status === DownloadStatus.FAILED) {
          console.log(`[Download] Cleaning up old ${existingDownload.status} download: ${downloadId}`);
          // Remove old M3U8 state from memory and disk
          await this.deleteM3U8State(downloadId);
          // Remove from downloads map
          this.downloads.delete(downloadId);
        }
      }

      const filePaths = this.generateFilePaths(downloadId, options.quality);

      // Create download item
      const downloadItem: DownloadItem = {
        id: downloadId,
        contentId: content.id,
        contentType,
        title: 'title' in content ? content.title : content.name,
        overview: content.overview,
        posterPath: content.poster_path,
        backdropPath: content.backdrop_path,
        releaseDate: 'release_date' in content ? content.release_date : (content as TVShow).first_air_date,
        season,
        episode,
        episodeTitle,
        videoUrl,
        quality: options.quality,
        status: DownloadStatus.PENDING,
        progress: 0,
        filePath: filePaths.videoPath,
        thumbnailPath: filePaths.thumbnailPath,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.downloads.set(downloadId, downloadItem);
      await this.saveDownloadsToStorage();

      this.sendNotification({
        id: `download_started_${downloadId}`,
        title: 'Download Started',
        message: `Started downloading ${downloadItem.title}`,
        type: 'info',
        timestamp: new Date(),
      });

      // Start the actual download
      // Note: Foreground service is started inside performDownload based on download type
      // M3U8 background downloads use react-native-background-actions which has its own notification
      // Direct downloads and non-background M3U8 use notifee foreground service
      await this.performDownload(downloadItem, options);

      return downloadId;
    } catch (error) {
      console.error('Failed to start download:', error);
      throw error;
    }
  }

  /**
   * Perform the actual download
   */
  private async performDownload(downloadItem: DownloadItem, options: DownloadOptions): Promise<void> {
    try {
      // Update status to downloading
      downloadItem.status = DownloadStatus.DOWNLOADING;
      downloadItem.startedAt = new Date();
      downloadItem.updatedAt = new Date();
      this.downloads.set(downloadItem.id, downloadItem);
      await this.saveDownloadsToStorage();

      // Check if this is an M3U8 playlist
      if (isM3U8Url(downloadItem.videoUrl)) {
        // Use background task for M3U8 downloads to keep JS thread free
        if (options.useBackgroundTask !== false) {
          // Background task uses react-native-background-actions which has its own notification
          // Do NOT start notifee foreground service to avoid duplicate notifications
          await this.performBackgroundM3U8Download(downloadItem, options);
        } else {
          // Non-background M3U8 download - use notifee foreground service
          await notificationService.startForegroundService(downloadItem.id, downloadItem.title);
          await this.downloadM3U8Concurrent(downloadItem, options);
        }
      } else {
        // Direct file download - use notifee foreground service
        await notificationService.startForegroundService(downloadItem.id, downloadItem.title);
        await this.downloadDirectFile(downloadItem, options);
      }
    } catch (error) {
      // Download failed
      downloadItem.status = DownloadStatus.FAILED;
      downloadItem.error = error instanceof Error ? error.message : 'Unknown error';
      downloadItem.updatedAt = new Date();

      this.downloads.set(downloadItem.id, downloadItem);
      await this.saveDownloadsToStorage();

      this.sendNotification({
        id: `download_failed_${downloadItem.id}`,
        title: 'Download Failed',
        message: `Failed to download ${downloadItem.title}: ${downloadItem.error}`,
        type: 'error',
        timestamp: new Date(),
      });

      await notificationService.showDownloadFailed({
        downloadId: downloadItem.id,
        title: downloadItem.title,
        status: 'failed',
        error: downloadItem.error,
      });

      await notificationService.stopForegroundService(downloadItem.id);
      this.lastProgressNotification.delete(downloadItem.id);
      this.lastProgressSave.delete(downloadItem.id);

      throw error;
    }
  }

  /**
   * Perform M3U8 download using HeadlessJS background task
   * This runs completely separate from the UI thread, preventing any lag
   */
  private async performBackgroundM3U8Download(downloadItem: DownloadItem, options: DownloadOptions): Promise<void> {
    const filePaths = this.generateFilePaths(downloadItem.id, downloadItem.quality);
    
    // Create segments directory
    const segmentsDirExists = await RNFS.exists(filePaths.segmentsDir);
    if (!segmentsDirExists) {
      await RNFS.mkdir(filePaths.segmentsDir);
    }

    // Start the background task
    const params: BackgroundDownloadParams = {
      downloadId: downloadItem.id,
      videoUrl: downloadItem.videoUrl,
      filePath: downloadItem.filePath!,
      title: downloadItem.title,
      segmentsDir: filePaths.segmentsDir,
      selectedStreamUrl: options.selectedStreamUrl,
    };

    try {
      // Check if already running
      if (isBackgroundDownloadRunning()) {
        console.log('[DownloadService] Background service already running, using concurrent download');
        await this.downloadM3U8Concurrent(downloadItem, options);
        return;
      }

      console.log('[DownloadService] Starting background download task');
      await startBackgroundDownload(params);
      
      // Poll for completion (the background task saves state to storage)
      const stateKey = `@flick:background_download_state:${downloadItem.id}`;
      let checkCount = 0;
      const maxChecks = 60 * 60; // 1 hour max (checking every second)
      
      while (isBackgroundDownloadRunning() && checkCount < maxChecks) {
        await this.delay(1000);
        checkCount++;
        
        // Check state from storage
        const stateJson = await StorageService.getItem(stateKey);
        if (stateJson) {
          const state = JSON.parse(stateJson);
          
          // Update progress in main thread (throttled)
          if (state.totalSegments > 0) {
            const progress = (state.downloadedSegments?.length || 0) / state.totalSegments * 100;
            const downloadedBytes = state.downloadedBytes || 0;
            
            // Calculate download speed and estimates
            let downloadSpeed = 0;
            let estimatedTotalSize = 0;
            let estimatedTimeRemaining = 0;
            
            if (downloadItem.startedAt) {
              const elapsedSeconds = (Date.now() - downloadItem.startedAt.getTime()) / 1000;
              if (elapsedSeconds > 0) {
                downloadSpeed = downloadedBytes / elapsedSeconds;
                
                // Estimate total size based on downloaded ratio
                const downloadedSegments = state.downloadedSegments?.length || 0;
                if (downloadedSegments > 0) {
                  estimatedTotalSize = (downloadedBytes / downloadedSegments) * state.totalSegments;
                  const remainingBytes = estimatedTotalSize - downloadedBytes;
                  if (downloadSpeed > 0) {
                    estimatedTimeRemaining = remainingBytes / downloadSpeed;
                  }
                }
              }
            }
            
            downloadItem.progress = progress;
            downloadItem.downloadedSize = downloadedBytes;
            downloadItem.downloadSpeed = downloadSpeed;
            downloadItem.totalSize = estimatedTotalSize;
            downloadItem.estimatedTimeRemaining = estimatedTimeRemaining;
            downloadItem.updatedAt = new Date();
            this.downloads.set(downloadItem.id, downloadItem);
            
            // Call progress listener (throttled)
            const now = Date.now();
            const lastCall = this.lastProgressListener.get(downloadItem.id) || 0;
            if (now - lastCall >= CONFIG.PROGRESS_LISTENER_INTERVAL) {
              this.lastProgressListener.set(downloadItem.id, now);
              const listener = this.downloadListeners.get(downloadItem.id);
              if (listener) {
                listener({
                  downloadId: downloadItem.id,
                  progress,
                  downloadedSize: downloadedBytes,
                  totalSize: estimatedTotalSize,
                  downloadSpeed: downloadSpeed,
                  estimatedTimeRemaining: estimatedTimeRemaining,
                });
              }
            }
          }
          
          // Check if completed or failed
          if (state.status === 'completed') {
            console.log('[DownloadService] Background download completed');
            // Stop the background service first
            if (isBackgroundDownloadRunning()) {
              await stopBackgroundDownload();
            }
            await this.finalizeDownload(downloadItem);
            return;
          } else if (state.status === 'failed') {
            throw new Error(state.error || 'Background download failed');
          } else if (state.status === 'cancelled') {
            throw new Error('Download cancelled');
          } else if (state.status === 'paused') {
            return; // Just return, don't throw
          }
        }
      }
      
      // If we get here without completion, check final state
      const finalStateJson = await StorageService.getItem(stateKey);
      if (finalStateJson) {
        const finalState = JSON.parse(finalStateJson);
        if (finalState.status === 'completed') {
          // Stop the background service first
          if (isBackgroundDownloadRunning()) {
            await stopBackgroundDownload();
          }
          await this.finalizeDownload(downloadItem);
          return;
        } else if (finalState.status !== 'paused') {
          throw new Error('Download timed out or failed');
        }
      }
      
    } catch (error) {
      console.error('[DownloadService] Background download error:', error);
      // Stop background service if running
      if (isBackgroundDownloadRunning()) {
        await stopBackgroundDownload();
      }
      throw error;
    }
  }

  /**
   * Finalize a completed download
   */
  private async finalizeDownload(downloadItem: DownloadItem): Promise<void> {
    // Verify output file exists and has content
    if (downloadItem.filePath) {
      const exists = await RNFS.exists(downloadItem.filePath);
      if (!exists) {
        throw new Error('Downloaded file not found');
      }
      
      const stats = await RNFS.stat(downloadItem.filePath);
      if (stats.size === 0) {
        throw new Error('Downloaded file is empty');
      }
      
      downloadItem.totalSize = stats.size;
      downloadItem.downloadedSize = stats.size;
    }
    
    // Update status
    downloadItem.status = DownloadStatus.COMPLETED;
    downloadItem.progress = 100;
    downloadItem.completedAt = new Date();
    downloadItem.updatedAt = new Date();
    
    this.downloads.set(downloadItem.id, downloadItem);
    await this.saveDownloadsToStorage();
    
    // Clean up M3U8 state
    this.m3u8Downloads.delete(downloadItem.id);
    
    // Notify
    this.sendNotification({
      id: `download_complete_${downloadItem.id}`,
      title: 'Download Complete',
      message: `${downloadItem.title} is ready to watch offline`,
      type: 'success',
      timestamp: new Date(),
    });
    
    await notificationService.showDownloadCompleted({
      downloadId: downloadItem.id,
      title: downloadItem.title,
      status: 'completed',
    });
    
    await notificationService.stopForegroundService(downloadItem.id);
    
    // Call completion listener
    const listener = this.downloadListeners.get(downloadItem.id);
    if (listener) {
      listener({
        downloadId: downloadItem.id,
        progress: 100,
        downloadedSize: downloadItem.totalSize || 0,
        totalSize: downloadItem.totalSize || 0,
        downloadSpeed: 0,
        estimatedTimeRemaining: 0,
      });
    }
    
    // Cleanup
    this.lastProgressNotification.delete(downloadItem.id);
    this.lastProgressSave.delete(downloadItem.id);
    this.lastProgressListener.delete(downloadItem.id);
  }

  async getAvailableResolutions(videoUrl: string): Promise<M3U8StreamInfo[]> {
    return getM3U8Resolutions(videoUrl);
  }

  /**
   * Download M3U8 with concurrent segment downloads
   */
  private async downloadM3U8Concurrent(downloadItem: DownloadItem, options: DownloadOptions): Promise<void> {
    // Pass selected stream URL if user chose a specific resolution
    const playlist = await fetchM3U8Playlist(downloadItem.videoUrl, options.selectedStreamUrl);
    const filePaths = this.generateFilePaths(downloadItem.id, downloadItem.quality);
    
    // Create or restore M3U8 state
    let state = this.m3u8Downloads.get(downloadItem.id);
    
    console.log(`[M3U8] downloadM3U8Concurrent called for ${downloadItem.id}, existing state:`, state ? `isPaused=${state.isPaused}, isCancelled=${state.isCancelled}` : 'none');
    
    // If state exists but was cancelled, remove it and start fresh
    if (state && state.isCancelled) {
      console.log(`[M3U8] Removing cancelled state for ${downloadItem.id}`);
      this.m3u8Downloads.delete(downloadItem.id);
      state = undefined;
    }
    
    if (!state) {
      // Create segments directory
      const exists = await RNFS.exists(filePaths.segmentsDir);
      if (!exists) {
        await RNFS.mkdir(filePaths.segmentsDir);
      }
      
      state = {
        downloadId: downloadItem.id,
        playlistUrl: downloadItem.videoUrl,
        segments: playlist.segments,
        downloadedSegments: new Set<number>(),
        failedSegments: new Map<number, number>(),
        totalSegments: playlist.segments.length,
        segmentsDir: filePaths.segmentsDir,
        outputPath: downloadItem.filePath!,
        isPaused: false,
        isCancelled: false,
        totalBytes: 0,
        downloadedBytes: 0,
      };
      
      // Check for already downloaded segments (resume support)
      for (let i = 0; i < playlist.segments.length; i++) {
        const segmentPath = `${filePaths.segmentsDir}/segment_${i.toString().padStart(5, '0')}.ts`;
        const segmentExists = await RNFS.exists(segmentPath);
        if (segmentExists) {
          const segmentStat = await RNFS.stat(segmentPath);
          if (segmentStat.size > 0) {
            state.downloadedSegments.add(i);
            state.downloadedBytes += segmentStat.size;
          }
        }
      }
      
      this.m3u8Downloads.set(downloadItem.id, state);
    } else {
      state.isPaused = false;
      state.isCancelled = false;
    }

    console.log(`[M3U8] Starting concurrent download: ${state.downloadedSegments.size}/${state.totalSegments} already downloaded`);

    // Get segments that need to be downloaded
    const pendingSegments = state.segments.filter(
      segment => !state!.downloadedSegments.has(segment.index)
    );

    if (pendingSegments.length === 0) {
      // All segments already downloaded, just combine
      await this.combineAndFinalize(downloadItem, state);
      return;
    }

    // Download segments concurrently with limited concurrency
    const concurrency = CONFIG.M3U8_CONCURRENCY;
    let activeDownloads = 0;
    
    const downloadQueue = [...pendingSegments];
    const downloadPromises: Promise<void>[] = [];
    const abortController = new AbortController();

    // Ensure state is clean before starting download loop
    state.isPaused = false;
    state.isCancelled = false;
    console.log(`[M3U8] Starting download loop with ${pendingSegments.length} pending segments`);

    const processQueue = async (): Promise<void> => {
      while (downloadQueue.length > 0 && !state!.isPaused && !state!.isCancelled) {
        // Wait if at max concurrency
        while (activeDownloads >= concurrency && !state!.isPaused && !state!.isCancelled) {
          await this.delay(100);
        }

        if (state!.isPaused || state!.isCancelled) break;

        const segment = downloadQueue.shift();
        if (!segment) break;

        activeDownloads++;
        
        const downloadPromise = this.downloadSegment(state!, segment, downloadItem, abortController.signal)
          .finally(() => {
            activeDownloads--;
          });
        
        downloadPromises.push(downloadPromise);
      }
    };

    // Start processing queue
    await processQueue();
    
    // If paused or cancelled, abort ongoing fetches and wait for cleanup
    if (state.isPaused || state.isCancelled) {
      abortController.abort();
    }

    // Wait for all in-flight downloads to complete (they will handle abort gracefully)
    await Promise.allSettled(downloadPromises);

    // Check if cancelled or paused
    if (state.isCancelled) {
      console.log(`[M3U8] Download cancelled for ${downloadItem.id}, cleaning up`);
      // Clean up segments directory
      try {
        const dirExists = await RNFS.exists(state.segmentsDir);
        if (dirExists) {
          await RNFS.unlink(state.segmentsDir);
        }
      } catch (error) {
        console.warn(`[M3U8] Failed to clean up segments directory after cancellation:`, error);
      }
    }

    if (state.isPaused) {
      // Save state and return - don't throw error
      await this.saveM3U8State(state);
      return;
    }

    // Retry failed segments
    let retryAttempt = 0;
    while (state.failedSegments.size > 0 && retryAttempt < CONFIG.MAX_RETRIES) {
      retryAttempt++;
      console.log(`[M3U8] Retry attempt ${retryAttempt} for ${state.failedSegments.size} failed segments`);
      
      await this.delay(CONFIG.RETRY_DELAY);
      
      const failedSegmentIndices = Array.from(state.failedSegments.keys());
      const retrySegments = failedSegmentIndices.map(index => 
        state!.segments.find(s => s.index === index)!
      ).filter(Boolean);

      for (const segment of retrySegments) {
        if (state.isPaused || state.isCancelled) break;
        await this.downloadSegment(state, segment, downloadItem);
      }
    }

    // Check if all segments downloaded
    if (state.downloadedSegments.size < state.totalSegments) {
      const remaining = state.totalSegments - state.downloadedSegments.size;
      throw new Error(`Failed to download ${remaining} segments after ${CONFIG.MAX_RETRIES} retries`);
    }

    // Combine segments and finalize
    await this.combineAndFinalize(downloadItem, state);
  }

  /**
   * Download a single segment
   */
  private async downloadSegment(
    state: M3U8DownloadState, 
    segment: M3U8Segment, 
    downloadItem: DownloadItem,
    abortSignal?: AbortSignal
  ): Promise<void> {
    const segmentPath = getSegmentPath(state.segmentsDir, segment.index);
    
    try {
      // Skip if already downloaded
      if (state.downloadedSegments.has(segment.index)) {
        return;
      }

      // Check if paused or cancelled
      if (state.isPaused || state.isCancelled) {
        return;
      }

      const dirExists = await RNFS.exists(state.segmentsDir);
      if (!dirExists) {
        return;
      }

      const bytesWritten = await downloadSegmentToFile(segment.uri, segmentPath, abortSignal);

      if (state.isPaused || state.isCancelled || abortSignal?.aborted) {
        return;
      }

      // Update state
      state.downloadedSegments.add(segment.index);
      state.downloadedBytes += bytesWritten;
      state.failedSegments.delete(segment.index);

      // Update progress
      this.updateM3U8Progress(state, downloadItem);

    } catch (error) {
      // Don't log warnings if download was cancelled or paused (expected behavior)
      if (!state.isCancelled && !state.isPaused) {
        console.warn(`[M3U8] Failed to download segment ${segment.index}:`, error);
        
        const retryCount = (state.failedSegments.get(segment.index) || 0) + 1;
        state.failedSegments.set(segment.index, retryCount);
        
        // Delete partial file if exists
        try {
          const exists = await RNFS.exists(segmentPath);
          if (exists) {
            await RNFS.unlink(segmentPath);
          }
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }

  /**
   * Convert ArrayBuffer to Base64
   * Uses native C++/JSI implementation for ~16x faster performance
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    return fromByteArray(bytes);
  }

  /**
   * Update M3U8 download progress
   * Optimized to reduce main thread pressure by throttling all updates
   */
  private updateM3U8Progress(state: M3U8DownloadState, downloadItem: DownloadItem): void {
    const progress = (state.downloadedSegments.size / state.totalSegments) * 100;
    const now = Date.now();
    
    // Update download item (in-memory only, cheap operation)
    downloadItem.progress = progress;
    downloadItem.downloadedSize = state.downloadedBytes;
    
    // Estimate download speed (only calculate periodically to reduce CPU)
    const lastListenerCall = this.lastProgressListener.get(downloadItem.id) || 0;
    const shouldUpdateListener = now - lastListenerCall >= CONFIG.PROGRESS_LISTENER_INTERVAL;
    
    if (shouldUpdateListener && downloadItem.startedAt) {
      const elapsedSeconds = (now - downloadItem.startedAt.getTime()) / 1000;
      if (elapsedSeconds > 0) {
        downloadItem.downloadSpeed = state.downloadedBytes / elapsedSeconds;
        
        // Estimate total size based on downloaded ratio
        if (state.downloadedSegments.size > 0) {
          const estimatedTotalBytes = (state.downloadedBytes / state.downloadedSegments.size) * state.totalSegments;
          downloadItem.totalSize = estimatedTotalBytes;
          
          const remainingBytes = estimatedTotalBytes - state.downloadedBytes;
          downloadItem.estimatedTimeRemaining = remainingBytes / downloadItem.downloadSpeed;
        }
      }
      downloadItem.updatedAt = new Date();
    }

    this.downloads.set(downloadItem.id, downloadItem);

    // Throttled progress listener notification (reduces React re-renders)
    if (shouldUpdateListener) {
      this.lastProgressListener.set(downloadItem.id, now);
      const listener = this.downloadListeners.get(downloadItem.id);
      if (listener) {
        // Call directly - already throttled, no need to defer
        listener({
          downloadId: downloadItem.id,
          progress,
          downloadSpeed: downloadItem.downloadSpeed || 0,
          totalSize: downloadItem.totalSize || 0,
          downloadedSize: state.downloadedBytes,
          estimatedTimeRemaining: downloadItem.estimatedTimeRemaining || 0,
        });
      }
    }

    // Throttled notification update
    const lastNotification = this.lastProgressNotification.get(downloadItem.id) || 0;
    if (now - lastNotification >= CONFIG.PROGRESS_NOTIFICATION_INTERVAL) {
      this.lastProgressNotification.set(downloadItem.id, now);
      // Fire and forget - don't await
      notificationService.updateForegroundService(downloadItem.id, downloadItem.title, progress)
        .catch(() => {}); // Silently ignore notification errors
    }

    // Throttled state save (most expensive operation)
    const lastSave = this.lastProgressSave.get(downloadItem.id) || 0;
    if (now - lastSave >= CONFIG.PROGRESS_SAVE_INTERVAL) {
      this.lastProgressSave.set(downloadItem.id, now);
      // Save asynchronously without blocking
      this.saveDownloadsToStorage().catch(() => {});
      this.saveM3U8State(state).catch(() => {});
    }
  }

  /**
   * Combine segments and finalize download
   */
  private async combineAndFinalize(downloadItem: DownloadItem, state: M3U8DownloadState): Promise<void> {
    console.log(`[M3U8] Combining ${state.totalSegments} segments...`);
    
    // Combine segments
    for (let i = 0; i < state.totalSegments; i++) {
      const segmentPath = `${state.segmentsDir}/segment_${i.toString().padStart(5, '0')}.ts`;
      
      try {
        const segmentData = await RNFS.readFile(segmentPath, 'base64');
        
        if (i === 0) {
          await RNFS.writeFile(state.outputPath, segmentData, 'base64');
        } else {
          await RNFS.appendFile(state.outputPath, segmentData, 'base64');
        }
      } catch (error) {
        console.error(`Failed to read segment ${i}:`, error);
      }
    }

    // Verify output
    const outputStats = await RNFS.stat(state.outputPath);
    if (outputStats.size === 0) {
      throw new Error('Combined video file is empty');
    }

    console.log(`[M3U8] Combined file size: ${Math.round(outputStats.size / 1024 / 1024)}MB`);

    // Clean up segments
    try {
      await RNFS.unlink(state.segmentsDir);
    } catch (e) {
      console.warn('Failed to cleanup segments:', e);
    }

    // Delete M3U8 state
    await this.deleteM3U8State(downloadItem.id);

    // Finalize download
    downloadItem.status = DownloadStatus.COMPLETED;
    downloadItem.progress = 100;
    downloadItem.totalSize = outputStats.size;
    downloadItem.downloadedSize = outputStats.size;
    downloadItem.completedAt = new Date();
    downloadItem.updatedAt = new Date();

    // Download thumbnail
    if (downloadItem.posterPath) {
      await this.downloadThumbnail(downloadItem);
    }

    this.downloads.set(downloadItem.id, downloadItem);
    await this.saveDownloadsToStorage();

    this.sendNotification({
      id: `download_completed_${downloadItem.id}`,
      title: 'Download Completed',
      message: `${downloadItem.title} downloaded successfully`,
      type: 'success',
      timestamp: new Date(),
    });

    await notificationService.showDownloadCompleted({
      downloadId: downloadItem.id,
      title: downloadItem.title,
      status: 'completed',
    });

    await notificationService.stopForegroundService(downloadItem.id);
    this.lastProgressNotification.delete(downloadItem.id);
    this.lastProgressSave.delete(downloadItem.id);
  }

  /**
   * Download direct video file (non-M3U8)
   */
  private async downloadDirectFile(downloadItem: DownloadItem, options: DownloadOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const task = RNBackgroundDownloader.download({
        id: downloadItem.id,
        url: downloadItem.videoUrl,
        destination: downloadItem.filePath!,
        headers: { ...VIDEO_STREAM_HEADERS },
      });

      task
        .begin(({ expectedBytes }) => {
          downloadItem.totalSize = expectedBytes;
          downloadItem.updatedAt = new Date();
          this.downloads.set(downloadItem.id, downloadItem);
        })
        .progress(({ bytesDownloaded, bytesTotal }) => {
          const progress = (bytesDownloaded / bytesTotal) * 100;
          const now = Date.now();
          const elapsedSeconds = downloadItem.startedAt 
            ? (now - downloadItem.startedAt.getTime()) / 1000 
            : 1;
          const downloadSpeed = bytesDownloaded / elapsedSeconds;
          const estimatedTimeRemaining = (bytesTotal - bytesDownloaded) / downloadSpeed;

          downloadItem.progress = progress;
          downloadItem.downloadSpeed = downloadSpeed;
          downloadItem.totalSize = bytesTotal;
          downloadItem.downloadedSize = bytesDownloaded;
          downloadItem.estimatedTimeRemaining = estimatedTimeRemaining;
          downloadItem.updatedAt = new Date();

          this.downloads.set(downloadItem.id, downloadItem);

          // Notify listener
          const listener = this.downloadListeners.get(downloadItem.id);
          if (listener) {
            listener({
              downloadId: downloadItem.id,
              progress,
              downloadSpeed,
              totalSize: bytesTotal,
              downloadedSize: bytesDownloaded,
              estimatedTimeRemaining,
            });
          }

          // Throttled notification
          const lastNotification = this.lastProgressNotification.get(downloadItem.id) || 0;
          if (now - lastNotification >= CONFIG.PROGRESS_NOTIFICATION_INTERVAL) {
            this.lastProgressNotification.set(downloadItem.id, now);
            notificationService.updateForegroundService(downloadItem.id, downloadItem.title, progress)
              .catch(err => console.warn('Failed to update notification:', err));
          }
        })
        .done(async () => {
          downloadItem.status = DownloadStatus.COMPLETED;
          downloadItem.progress = 100;
          downloadItem.completedAt = new Date();
          downloadItem.updatedAt = new Date();

          if (downloadItem.posterPath) {
            await this.downloadThumbnail(downloadItem);
          }

          if (options.downloadSubtitles) {
            await this.downloadSubtitles(downloadItem);
          }

          this.downloads.set(downloadItem.id, downloadItem);
          await this.saveDownloadsToStorage();

          this.sendNotification({
            id: `download_completed_${downloadItem.id}`,
            title: 'Download Completed',
            message: `${downloadItem.title} downloaded successfully`,
            type: 'success',
            timestamp: new Date(),
          });

          await notificationService.showDownloadCompleted({
            downloadId: downloadItem.id,
            title: downloadItem.title,
            status: 'completed',
          });

          await notificationService.stopForegroundService(downloadItem.id);
          this.lastProgressNotification.delete(downloadItem.id);
          this.activeDownloads.delete(downloadItem.id);

          resolve();
        })
        .error(({ error }) => {
          downloadItem.status = DownloadStatus.FAILED;
          downloadItem.error = error;
          downloadItem.updatedAt = new Date();

          this.downloads.set(downloadItem.id, downloadItem);
          this.saveDownloadsToStorage();
          this.activeDownloads.delete(downloadItem.id);

          this.sendNotification({
            id: `download_failed_${downloadItem.id}`,
            title: 'Download Failed',
            message: `Failed to download ${downloadItem.title}: ${error}`,
            type: 'error',
            timestamp: new Date(),
          });

          notificationService.showDownloadFailed({
            downloadId: downloadItem.id,
            title: downloadItem.title,
            status: 'failed',
            error: error,
          });

          notificationService.stopForegroundService(downloadItem.id);
          this.lastProgressNotification.delete(downloadItem.id);

          reject(new Error(error));
        });

      this.activeDownloads.set(downloadItem.id, { task, taskId: downloadItem.id });
    });
  }

  /**
   * Download thumbnail image
   */
  private async downloadThumbnail(downloadItem: DownloadItem): Promise<void> {
    try {
      if (!downloadItem.posterPath || !downloadItem.thumbnailPath) return;

      const thumbnailUrl = this.tmdbService.getImageUrl(downloadItem.posterPath, 'w500');
      
      await RNFS.downloadFile({
        fromUrl: thumbnailUrl,
        toFile: downloadItem.thumbnailPath,
      }).promise;
    } catch (error) {
      console.warn('Failed to download thumbnail:', error);
    }
  }

  /**
   * Download subtitles
   */
  private async downloadSubtitles(downloadItem: DownloadItem): Promise<void> {
    try {
      downloadItem.subtitlePaths = [];
    } catch (error) {
      console.warn('Failed to download subtitles:', error);
    }
  }

  /**
   * Pause download
   */
  async pauseDownload(downloadId: string): Promise<void> {
    try {
      const downloadItem = this.downloads.get(downloadId);
      if (!downloadItem) {
        throw this.createDownloadError('Download not found', null);
      }

      // Check if download is in a pausable state
      if (downloadItem.status !== DownloadStatus.DOWNLOADING && 
          downloadItem.status !== DownloadStatus.PENDING) {
        console.log(`[Pause] Download ${downloadId} is not in pausable state: ${downloadItem.status}`);
        return;
      }

      console.log(`[Pause] Pausing download: ${downloadId}`);

      // Pause M3U8 download
      const m3u8State = this.m3u8Downloads.get(downloadId);
      if (m3u8State) {
        console.log(`[Pause] Setting M3U8 state isPaused=true for ${downloadId}`);
        m3u8State.isPaused = true;
        await this.saveM3U8State(m3u8State);
      }

      // Pause direct download
      const activeDownload = this.activeDownloads.get(downloadId);
      if (activeDownload) {
        console.log(`[Pause] Pausing active download task for ${downloadId}`);
        activeDownload.task.pause();
      }

      if (isBackgroundDownloadRunning()) {
        const stateKey = `@flick:background_download_state:${downloadId}`;
        try {
          const stateJson = await StorageService.getItem(stateKey);
          if (stateJson) {
            const bgState = JSON.parse(stateJson);
            bgState.status = 'paused';
            await StorageService.setItem(stateKey, JSON.stringify(bgState));
          }
          await stopBackgroundDownload();
        } catch (bgError) {
          console.warn('[Pause] Failed to pause background download:', bgError);
        }
      }

      downloadItem.status = DownloadStatus.PAUSED;
      downloadItem.updatedAt = new Date();
      this.downloads.set(downloadId, downloadItem);
      await this.saveDownloadsToStorage();

      this.sendNotification({
        id: `download_paused_${downloadId}`,
        title: 'Download Paused',
        message: `${downloadItem.title} download paused`,
        type: 'info',
        timestamp: new Date(),
      });

      await notificationService.showDownloadPaused({
        downloadId: downloadId,
        title: downloadItem.title,
        progress: downloadItem.progress,
        status: 'paused',
      });

      await notificationService.stopForegroundService(downloadId);
      console.log(`[Pause] Download ${downloadId} paused successfully`);
    } catch (error) {
      console.error('Failed to pause download:', error);
      throw error;
    }
  }

  /**
   * Resume download
   */
  async resumeDownload(downloadId: string): Promise<void> {
    try {
      const downloadItem = this.downloads.get(downloadId);
      if (!downloadItem) {
        throw this.createDownloadError('Download not found', null);
      }

      if (downloadItem.status !== DownloadStatus.PAUSED && 
          downloadItem.status !== DownloadStatus.FAILED) {
        throw this.createDownloadError('Download is not paused or failed', null);
      }

      console.log(`[Resume] Resuming download: ${downloadId}`);

      // Start foreground service
      await notificationService.startForegroundService(downloadId, downloadItem.title);

      // Check if this is an M3U8 download
      const isM3U8 = isM3U8Url(downloadItem.videoUrl);
      
      if (isM3U8) {
        // Try to load M3U8 state from memory or disk
        let m3u8State = this.m3u8Downloads.get(downloadId);
        
        if (!m3u8State) {
          // Try to load from disk (app might have been restarted)
          await this.loadM3U8States();
          m3u8State = this.m3u8Downloads.get(downloadId);
        }
        
        if (m3u8State) {
          console.log(`[Resume] Found M3U8 state with ${m3u8State.downloadedSegments.size}/${m3u8State.totalSegments} segments, isPaused=${m3u8State.isPaused}, isCancelled=${m3u8State.isCancelled}`);
          m3u8State.isPaused = false;
          m3u8State.isCancelled = false;
          // Update the state in the map to ensure consistency
          this.m3u8Downloads.set(downloadId, m3u8State);
          console.log(`[Resume] Reset M3U8 state: isPaused=${m3u8State.isPaused}, isCancelled=${m3u8State.isCancelled}`);
        } else {
          console.log(`[Resume] No M3U8 state found, will create fresh state`);
        }
        
        downloadItem.status = DownloadStatus.DOWNLOADING;
        downloadItem.updatedAt = new Date();
        if (!downloadItem.startedAt) {
          downloadItem.startedAt = new Date();
        }
        this.downloads.set(downloadId, downloadItem);
        await this.saveDownloadsToStorage();
        
        // Continue downloading - downloadM3U8Concurrent will handle the state
        const options: DownloadOptions = { quality: downloadItem.quality };
        await this.downloadM3U8Concurrent(downloadItem, options);
        return;
      }

      // Resume direct download
      const activeDownload = this.activeDownloads.get(downloadId);
      if (activeDownload) {
        console.log(`[Resume] Resuming active download task for ${downloadId}`);
        activeDownload.task.resume();
        downloadItem.status = DownloadStatus.DOWNLOADING;
        downloadItem.updatedAt = new Date();
        this.downloads.set(downloadId, downloadItem);
        await this.saveDownloadsToStorage();
      } else {
        // Restart download if no active task
        console.log(`[Resume] No active task found, restarting download for ${downloadId}`);
        downloadItem.status = DownloadStatus.PENDING;
        const options: DownloadOptions = {
          quality: downloadItem.quality,
          downloadSubtitles: !!downloadItem.subtitlePaths,
        };
        await this.performDownload(downloadItem, options);
      }
    } catch (error) {
      console.error('Failed to resume download:', error);
      
      // Update status to failed if resume fails
      const downloadItem = this.downloads.get(downloadId);
      if (downloadItem) {
        downloadItem.status = DownloadStatus.FAILED;
        downloadItem.error = error instanceof Error ? error.message : 'Resume failed';
        downloadItem.updatedAt = new Date();
        this.downloads.set(downloadId, downloadItem);
        await this.saveDownloadsToStorage();
      }
      
      await notificationService.stopForegroundService(downloadId);
      throw error;
    }
  }

  /**
   * Cancel download
   */
  async cancelDownload(downloadId: string): Promise<void> {
    try {
      const downloadItem = this.downloads.get(downloadId);
      if (!downloadItem) {
        throw this.createDownloadError('Download not found', null);
      }

      console.log(`[Cancel] Cancelling download: ${downloadId}, current status: ${downloadItem.status}`);

      // FIRST: Stop background service if running to prevent further file operations
      if (isBackgroundDownloadRunning()) {
        console.log(`[Cancel] Stopping background service for ${downloadId}`);
        await stopBackgroundDownload();
      }

      // Update background download state in storage to 'cancelled' so any remaining operations stop
      const stateKey = `@flick:background_download_state:${downloadId}`;
      try {
        const stateJson = await StorageService.getItem(stateKey);
        if (stateJson) {
          const state = JSON.parse(stateJson);
          state.status = 'cancelled';
          await StorageService.setItem(stateKey, JSON.stringify(state));
          console.log(`[Cancel] Updated background state to cancelled for ${downloadId}`);
        }
      } catch (e) {
        console.warn('Failed to update background state:', e);
      }

      // Cancel M3U8 download
      const m3u8State = this.m3u8Downloads.get(downloadId);
      if (m3u8State) {
        console.log(`[Cancel] Setting M3U8 state isCancelled=true for ${downloadId}`);
        m3u8State.isCancelled = true;
        m3u8State.isPaused = false; // Ensure not paused to allow cleanup
        
        // Clean up segments directory
        try {
          const exists = await RNFS.exists(m3u8State.segmentsDir);
          if (exists) {
            // Delete all segment files first
            const files = await RNFS.readDir(m3u8State.segmentsDir);
            for (const file of files) {
              try {
                await RNFS.unlink(file.path);
              } catch (e) {
                console.warn(`Failed to delete segment ${file.path}:`, e);
              }
            }
            // Then delete directory
            await RNFS.unlink(m3u8State.segmentsDir);
            console.log(`[Cancel] Cleaned up segments directory for ${downloadId}`);
          }
        } catch (e) {
          console.warn('Failed to cleanup segments:', e);
        }
        
        await this.deleteM3U8State(downloadId);
      }

      // Cancel direct download
      const activeDownload = this.activeDownloads.get(downloadId);
      if (activeDownload) {
        console.log(`[Cancel] Stopping active download task for ${downloadId}`);
        activeDownload.task.stop();
        this.activeDownloads.delete(downloadId);
      }

      // Delete partial video file
      if (downloadItem.filePath) {
        try {
          const exists = await RNFS.exists(downloadItem.filePath);
          if (exists) {
            await RNFS.unlink(downloadItem.filePath);
            console.log(`[Cancel] Deleted partial file: ${downloadItem.filePath}`);
          }
        } catch (e) {
          console.warn('Failed to delete partial file:', e);
        }
      }

      // Also try to delete segments directory by generating paths (in case m3u8State wasn't found)
      const filePaths = this.generateFilePaths(downloadId, downloadItem.quality);
      try {
        const segmentsDirExists = await RNFS.exists(filePaths.segmentsDir);
        if (segmentsDirExists) {
          const files = await RNFS.readDir(filePaths.segmentsDir);
          for (const file of files) {
            try {
              await RNFS.unlink(file.path);
            } catch {
              // Ignore
            }
          }
          await RNFS.unlink(filePaths.segmentsDir);
        }
      } catch {
        // Ignore - directory might not exist
      }

      downloadItem.status = DownloadStatus.CANCELLED;
      downloadItem.updatedAt = new Date();
      this.downloads.set(downloadId, downloadItem);
      await this.saveDownloadsToStorage();

      this.sendNotification({
        id: `download_cancelled_${downloadId}`,
        title: 'Download Cancelled',
        message: `${downloadItem.title} download cancelled`,
        type: 'info',
        timestamp: new Date(),
      });

      await notificationService.showDownloadCancelled({
        downloadId: downloadId,
        title: downloadItem.title,
        status: 'cancelled',
      });

      await notificationService.stopForegroundService(downloadId);
      this.lastProgressNotification.delete(downloadId);
      this.lastProgressSave.delete(downloadId);
      this.lastProgressListener.delete(downloadId);
      this.downloadListeners.delete(downloadId);
    } catch (error) {
      console.error('Failed to cancel download:', error);
      throw error;
    }
  }

  /**
   * Delete downloaded content
   */
  async deleteDownload(downloadId: string): Promise<void> {
    try {
      const downloadItem = this.downloads.get(downloadId);
      if (!downloadItem) {
        throw this.createDownloadError('Download not found', null);
      }

      // Cancel if actively downloading
      if (downloadItem.status === DownloadStatus.DOWNLOADING || 
          downloadItem.status === DownloadStatus.PENDING) {
        await this.cancelDownload(downloadId);
      }

      // Delete M3U8 state if exists
      await this.deleteM3U8State(downloadId);

      // Delete files
      const filesToDelete = [
        downloadItem.filePath,
        downloadItem.thumbnailPath,
        ...(downloadItem.subtitlePaths || []),
      ].filter(Boolean) as string[];

      for (const filePath of filesToDelete) {
        try {
          const exists = await RNFS.exists(filePath);
          if (exists) {
            await RNFS.unlink(filePath);
          }
        } catch (e) {
          console.warn(`Failed to delete file ${filePath}:`, e);
        }
      }

      // Delete segments directory (for M3U8 downloads that may have partial data)
      const filePaths = this.generateFilePaths(downloadId, downloadItem.quality);
      try {
        const segmentsDirExists = await RNFS.exists(filePaths.segmentsDir);
        if (segmentsDirExists) {
          // Read directory contents and delete each file first
          const files = await RNFS.readDir(filePaths.segmentsDir);
          for (const file of files) {
            try {
              await RNFS.unlink(file.path);
            } catch (e) {
              console.warn(`Failed to delete segment file ${file.path}:`, e);
            }
          }
          // Then delete the directory
          await RNFS.unlink(filePaths.segmentsDir);
        }
      } catch (e) {
        console.warn('Failed to delete segments dir:', e);
      }

      // Delete subtitles directory
      try {
        const subtitlesDirExists = await RNFS.exists(filePaths.subtitlesDir);
        if (subtitlesDirExists) {
          await RNFS.unlink(filePaths.subtitlesDir);
        }
      } catch (e) {
        console.warn('Failed to delete subtitles dir:', e);
      }

      this.downloads.delete(downloadId);
      this.downloadListeners.delete(downloadId);
      this.lastProgressNotification.delete(downloadId);
      this.lastProgressSave.delete(downloadId);
      await this.saveDownloadsToStorage();

      this.sendNotification({
        id: `download_deleted_${downloadId}`,
        title: 'Download Deleted',
        message: `${downloadItem.title} deleted from downloads`,
        type: 'info',
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Failed to delete download:', error);
      throw error;
    }
  }

  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get all downloads
   */
  getAllDownloads(): DownloadItem[] {
    return Array.from(this.downloads.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  /**
   * Get download by ID
   */
  getDownload(downloadId: string): DownloadItem | null {
    return this.downloads.get(downloadId) || null;
  }

  /**
   * Get downloads by status
   */
  getDownloadsByStatus(status: DownloadStatus): DownloadItem[] {
    return this.getAllDownloads().filter(download => download.status === status);
  }

  /**
   * Check if content is downloaded
   */
  isContentDownloaded(
    contentId: number, 
    contentType: 'movie' | 'tv', 
    season?: number, 
    episode?: number
  ): boolean {
    const downloadId = this.generateDownloadId(contentId, contentType, season, episode);
    const download = this.downloads.get(downloadId);
    return download?.status === DownloadStatus.COMPLETED || false;
  }

  /**
   * Get downloaded content file path
   */
  getDownloadedContentPath(
    contentId: number, 
    contentType: 'movie' | 'tv', 
    season?: number, 
    episode?: number
  ): string | null {
    const downloadId = this.generateDownloadId(contentId, contentType, season, episode);
    const download = this.downloads.get(downloadId);
    
    if (download?.status === DownloadStatus.COMPLETED && download.filePath) {
      return download.filePath;
    }
    
    return null;
  }

  /**
   * Get storage usage information
   */
  async getStorageInfo(): Promise<{
    totalDownloads: number;
    completedDownloads: number;
    totalSize: number;
    usedSpace: number;
    availableSpace: number;
  }> {
    try {
      const downloads = this.getAllDownloads();
      const completedDownloads = downloads.filter(d => d.status === DownloadStatus.COMPLETED);
      
      let totalSize = 0;
      for (const download of completedDownloads) {
        if (download.totalSize) {
          totalSize += download.totalSize;
        }
      }

      const fsInfo = await RNFS.getFSInfo();

      return {
        totalDownloads: downloads.length,
        completedDownloads: completedDownloads.length,
        totalSize,
        usedSpace: totalSize,
        availableSpace: fsInfo.freeSpace,
      };
    } catch (error) {
      console.error('Failed to get storage info:', error);
      return {
        totalDownloads: 0,
        completedDownloads: 0,
        totalSize: 0,
        usedSpace: 0,
        availableSpace: 0,
      };
    }
  }

  /**
   * Clean up failed and cancelled downloads
   */
  async cleanupFailedDownloads(): Promise<number> {
    try {
      const failedDownloads = this.getDownloadsByStatus(DownloadStatus.FAILED);
      const cancelledDownloads = this.getDownloadsByStatus(DownloadStatus.CANCELLED);
      const toCleanup = [...failedDownloads, ...cancelledDownloads];

      for (const download of toCleanup) {
        await this.deleteDownload(download.id);
      }

      return toCleanup.length;
    } catch (error) {
      console.error('Failed to cleanup failed downloads:', error);
      return 0;
    }
  }

  /**
   * Add download progress listener
   */
  addProgressListener(downloadId: string, listener: (progress: DownloadProgress) => void): void {
    this.downloadListeners.set(downloadId, listener);
  }

  /**
   * Remove download progress listener
   */
  removeProgressListener(downloadId: string): void {
    this.downloadListeners.delete(downloadId);
  }

  /**
   * Add notification listener
   */
  addNotificationListener(listener: (notification: DownloadNotification) => void): void {
    this.notificationListeners.add(listener);
  }

  /**
   * Remove notification listener
   */
  removeNotificationListener(listener: (notification: DownloadNotification) => void): void {
    this.notificationListeners.delete(listener);
  }

  /**
   * Send notification to all listeners
   */
  private sendNotification(notification: DownloadNotification): void {
    this.notificationListeners.forEach(listener => {
      try {
        listener(notification);
      } catch (error) {
        console.error('Error in notification listener:', error);
      }
    });
  }

  /**
   * Create standardized download error
   */
  private createDownloadError(message: string, originalError: any): AppError {
    return {
      type: ErrorType.STORAGE_ERROR,
      message,
      code: originalError?.code || 'DOWNLOAD_ERROR',
    };
  }
}

// Export singleton instance
export const downloadService = DownloadService.getInstance();
