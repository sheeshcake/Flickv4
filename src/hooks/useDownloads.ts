import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { 
  DownloadItem, 
  DownloadStatus, 
  DownloadNotification,
  DownloadQuality,
  Movie,
  TVShow
} from '../types';
import { downloadService, DownloadOptions } from '../services';

export interface UseDownloadsReturn {
  downloads: DownloadItem[];
  isDownloading: (contentId: number, contentType: 'movie' | 'tv', season?: number, episode?: number) => boolean;
  isDownloaded: (contentId: number, contentType: 'movie' | 'tv', season?: number, episode?: number) => boolean;
  getDownloadProgress: (contentId: number, contentType: 'movie' | 'tv', season?: number, episode?: number) => number;
  getDownloadedPath: (contentId: number, contentType: 'movie' | 'tv', season?: number, episode?: number) => string | null;
  startDownload: (
    content: Movie | TVShow,
    videoUrl: string,
    options?: Partial<DownloadOptions>,
    season?: number,
    episode?: number,
    episodeTitle?: string
  ) => Promise<string>;
  pauseDownload: (downloadId: string) => Promise<void>;
  resumeDownload: (downloadId: string) => Promise<void>;
  cancelDownload: (downloadId: string) => Promise<void>;
  deleteDownload: (downloadId: string) => Promise<void>;
  refreshDownloads: () => Promise<void>;
  storageInfo: {
    totalDownloads: number;
    completedDownloads: number;
    totalSize: number;
    usedSpace: number;
    availableSpace: number;
  };
}

/**
 * Hook for managing downloads in the app
 */
export const useDownloads = (): UseDownloadsReturn => {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [storageInfo, setStorageInfo] = useState({
    totalDownloads: 0,
    completedDownloads: 0,
    totalSize: 0,
    usedSpace: 0,
    availableSpace: 0,
  });

  // Generate download ID (same logic as in DownloadService)
  const generateDownloadId = useCallback((
    contentId: number, 
    contentType: 'movie' | 'tv', 
    season?: number, 
    episode?: number
  ): string => {
    const base = `${contentType}_${contentId}`;
    if (contentType === 'tv' && season !== undefined && episode !== undefined) {
      return `${base}_s${season}_e${episode}`;
    }
    return base;
  }, []);

  // Load downloads from service
  const loadDownloads = useCallback(async () => {
    try {
      const allDownloads = downloadService.getAllDownloads();
      setDownloads(allDownloads);

      const info = await downloadService.getStorageInfo();
      setStorageInfo(info);
    } catch (error) {
      console.error('Failed to load downloads:', error);
    }
  }, []);

  // Handle download notifications
  const handleNotification = useCallback((notification: DownloadNotification) => {
    console.log('Download notification:', notification);
    
    // Show user-friendly notifications for important events
    if (notification.type === 'success') {
      // Optionally show success toast
    } else if (notification.type === 'error') {
      Alert.alert('Download Error', notification.message);
    }
    
    // Refresh downloads when there's a notification
    loadDownloads();
  }, [loadDownloads]);

  // Set up downloads on mount
  useEffect(() => {
    loadDownloads();

    // Set up notification listener
    downloadService.addNotificationListener(handleNotification);

    return () => {
      downloadService.removeNotificationListener(handleNotification);
    };
  }, [loadDownloads, handleNotification]);

  // Check if content is currently downloading
  const isDownloading = useCallback((
    contentId: number, 
    contentType: 'movie' | 'tv', 
    season?: number, 
    episode?: number
  ): boolean => {
    const downloadId = generateDownloadId(contentId, contentType, season, episode);
    const download = downloads.find(d => d.id === downloadId);
    return download?.status === DownloadStatus.DOWNLOADING || false;
  }, [downloads, generateDownloadId]);

  // Check if content is downloaded
  const isDownloaded = useCallback((
    contentId: number, 
    contentType: 'movie' | 'tv', 
    season?: number, 
    episode?: number
  ): boolean => {
    const downloadId = generateDownloadId(contentId, contentType, season, episode);
    const download = downloads.find(d => d.id === downloadId);
    return download?.status === DownloadStatus.COMPLETED || false;
  }, [downloads, generateDownloadId]);

  // Get download progress
  const getDownloadProgress = useCallback((
    contentId: number, 
    contentType: 'movie' | 'tv', 
    season?: number, 
    episode?: number
  ): number => {
    const downloadId = generateDownloadId(contentId, contentType, season, episode);
    const download = downloads.find(d => d.id === downloadId);
    return download?.progress || 0;
  }, [downloads, generateDownloadId]);

  // Get downloaded file path
  const getDownloadedPath = useCallback((
    contentId: number, 
    contentType: 'movie' | 'tv', 
    season?: number, 
    episode?: number
  ): string | null => {
    const downloadId = generateDownloadId(contentId, contentType, season, episode);
    const download = downloads.find(d => d.id === downloadId);
    
    if (download?.status === DownloadStatus.COMPLETED && download.filePath) {
      return download.filePath;
    }
    
    return null;
  }, [downloads, generateDownloadId]);

  // Start download
  const startDownload = useCallback(async (
    content: Movie | TVShow,
    videoUrl: string,
    options: Partial<DownloadOptions> = {},
    season?: number,
    episode?: number,
    episodeTitle?: string
  ): Promise<string> => {
    try {
      const defaultOptions: DownloadOptions = {
        quality: DownloadQuality.MEDIUM,
        downloadSubtitles: true,
        wifiOnly: false,
        overwriteExisting: false,
        ...options,
      };

      const downloadId = await downloadService.startDownload(
        content,
        videoUrl,
        defaultOptions,
        season,
        episode,
        episodeTitle
      );

      // Refresh downloads after starting
      await loadDownloads();
      
      return downloadId;
    } catch (error: any) {
      Alert.alert('Download Error', error.message || 'Failed to start download');
      throw error;
    }
  }, [loadDownloads]);

  // Pause download
  const pauseDownload = useCallback(async (downloadId: string): Promise<void> => {
    try {
      await downloadService.pauseDownload(downloadId);
      await loadDownloads();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to pause download');
      throw error;
    }
  }, [loadDownloads]);

  // Resume download
  const resumeDownload = useCallback(async (downloadId: string): Promise<void> => {
    try {
      await downloadService.resumeDownload(downloadId);
      await loadDownloads();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to resume download');
      throw error;
    }
  }, [loadDownloads]);

  // Cancel download
  const cancelDownload = useCallback(async (downloadId: string): Promise<void> => {
    try {
      await downloadService.cancelDownload(downloadId);
      await loadDownloads();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to cancel download');
      throw error;
    }
  }, [loadDownloads]);

  // Delete download
  const deleteDownload = useCallback(async (downloadId: string): Promise<void> => {
    try {
      await downloadService.deleteDownload(downloadId);
      await loadDownloads();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to delete download');
      throw error;
    }
  }, [loadDownloads]);

  // Refresh downloads
  const refreshDownloads = useCallback(async (): Promise<void> => {
    await loadDownloads();
  }, [loadDownloads]);

  return {
    downloads,
    isDownloading,
    isDownloaded,
    getDownloadProgress,
    getDownloadedPath,
    startDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    deleteDownload,
    refreshDownloads,
    storageInfo,
  };
};

export default useDownloads;