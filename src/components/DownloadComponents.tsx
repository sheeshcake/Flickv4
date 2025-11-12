import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { 
  DownloadItem, 
  DownloadStatus, 
  DownloadProgress,
  Movie, 
  TVShow 
} from '../types';
import { downloadService } from '../services';
import { COLORS } from '../utils/constants';

interface CircularProgressProps {
  size: number;
  progress: number;
  children?: React.ReactNode;
}

const CircularProgress: React.FC<CircularProgressProps> = ({
  size,
  progress,
  children,
}) => {
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDasharray = circumference;
  
  // Ensure progress is between 0 and 100, and handle very small values
  const clampedProgress = Math.max(0, Math.min(100, progress || 0));
  const strokeDashoffset = circumference - (clampedProgress / 100) * circumference;

  return (
    <View style={[styles.circularProgressContainer, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.progressSvg}>
        {/* Background circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Progress circle - only show if there's actual progress */}
        {clampedProgress > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#e50914" // Netflix red
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      
      {/* Content in center */}
      <View style={styles.circularProgressContent}>
        {children}
      </View>
    </View>
  );
};

interface DownloadButtonProps {
  content: Movie | TVShow;
  videoUrl?: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  size?: 'small' | 'medium' | 'large';
  style?: any;
  onVideoNeeded?: () => void;
  isPreparingVideo?: boolean;
}

export const DownloadButton: React.FC<DownloadButtonProps> = ({
  content,
  videoUrl,
  season,
  episode,
  episodeTitle,
  size = 'medium',
  style,
  onVideoNeeded,
  isPreparingVideo = false,
}) => {
  const [downloadItem, setDownloadItem] = useState<DownloadItem | null>(null);
  const [progress, setProgress] = useState(0);
  const [_isLocalDownloading, setIsLocalDownloading] = useState(false);
  const [_lastProgressUpdate, _setLastProgressUpdate] = useState<number>(0);

  const contentType = 'title' in content ? 'movie' : 'tv';
  const isDownloaded = downloadService.isContentDownloaded(
    content.id,
    contentType,
    season,
    episode
  );

  const generateDownloadId = useCallback((
    itemContentId: number, 
    itemContentType: 'movie' | 'tv', 
    itemSeason?: number, 
    itemEpisode?: number
  ): string => {
    const base = `${itemContentType}_${itemContentId}`;
    if (itemContentType === 'tv' && itemSeason !== undefined && itemEpisode !== undefined) {
      return `${base}_s${itemSeason}_e${itemEpisode}`;
    }
    return base;
  }, []);

  const downloadId = generateDownloadId(content.id, contentType, season, episode);

  useEffect(() => {
    // Check if content is already downloaded or downloading
    const existingDownload = downloadService.getDownload(downloadId);
    
    if (existingDownload) {
      setDownloadItem(existingDownload);
      setProgress(existingDownload.progress || 0);
      setIsLocalDownloading(existingDownload.status === DownloadStatus.DOWNLOADING);
    } else {
      // Reset state when no existing download
      setDownloadItem(null);
      setProgress(0);
      setIsLocalDownloading(false);
    }

    // Set up progress listener for any existing downloads (not just downloading ones)
    const progressListener = (progressData: DownloadProgress) => {
      console.log('Progress update received:', {
        downloadId: progressData.downloadId,
        progress: progressData.progress,
        status: existingDownload?.status,
        applying: true
      });
      
      // Force state updates
      setProgress(progressData.progress);
      setIsLocalDownloading(progressData.progress < 100 && progressData.progress > 0);
      
      // Also update the download item with the latest progress
      const currentDownload = downloadService.getDownload(downloadId);
      if (currentDownload) {
        setDownloadItem({...currentDownload, progress: progressData.progress});
      }
      
      // Update download item if progress is complete
      if (progressData.progress >= 100) {
        setIsLocalDownloading(false);
        const updatedDownload = downloadService.getDownload(downloadId);
        if (updatedDownload) {
          setDownloadItem(updatedDownload);
        }
      }
    };

    // Always set up the listener for this download ID
    downloadService.addProgressListener(downloadId, progressListener);

    return () => {
      downloadService.removeProgressListener(downloadId);
    };
  }, [content.id, contentType, season, episode, downloadId]);

  // Monitor download item changes to update local state
  useEffect(() => {
    if (downloadItem) {
      setProgress(downloadItem.progress || 0);
      setIsLocalDownloading(downloadItem.status === DownloadStatus.DOWNLOADING);
      console.log('Download item state updated:', {
        id: downloadItem.id,
        status: downloadItem.status,
        progress: downloadItem.progress,
        isLocalDownloading: downloadItem.status === DownloadStatus.DOWNLOADING
      });
    }
  }, [downloadItem]);

  // Minimal polling only for downloads without active progress listeners
  useEffect(() => {
    if (_isLocalDownloading || (downloadItem?.status === DownloadStatus.DOWNLOADING)) {
      // For downloads that are actively downloading with listeners, minimal fallback polling
      const pollInterval = setInterval(() => {
        // Only poll if we haven't received progress updates recently (more than 10 seconds)
        const timeSinceLastUpdate = downloadItem?.updatedAt ? 
          Date.now() - downloadItem.updatedAt.getTime() : 
          Date.now();
        
        if (timeSinceLastUpdate > 10000) { // 10 seconds without updates
          const currentDownload = downloadService.getDownload(downloadId);
          if (currentDownload) {
            console.log('Polling download status (no recent updates):', {
              id: currentDownload.id,
              status: currentDownload.status,
              progress: currentDownload.progress,
              timeSinceLastUpdate
            });
            
            // Only update if the polled data is different from current state
            if (currentDownload.progress !== progress || 
                currentDownload.status !== downloadItem?.status) {
              setDownloadItem(currentDownload);
              setProgress(currentDownload.progress || 0);
            }
            
            // Stop polling if download is complete or failed
            if (currentDownload.status === DownloadStatus.COMPLETED || 
                currentDownload.status === DownloadStatus.FAILED ||
                currentDownload.status === DownloadStatus.CANCELLED) {
              setIsLocalDownloading(false);
            }
          } else {
            setIsLocalDownloading(false);
          }
        }
      }, 2000); // Poll every 2 seconds but only act on stale data

      return () => clearInterval(pollInterval);
    }
  }, [_isLocalDownloading, downloadItem?.status, downloadId, progress, downloadItem?.updatedAt]);

  const handleDownload = async () => {
    if (!videoUrl) {
      if (onVideoNeeded) {
        // If callback is provided, trigger video scraping
        onVideoNeeded();
        Alert.alert(
          'Getting Video Ready', 
          'Starting video preparation for download. Once the video loads, the download will begin automatically.',
          [{ text: 'OK' }]
        );
      } else {
        // Fallback to original behavior
        Alert.alert(
          'Video URL Required', 
          'Please start playing the video first, then try downloading. This ensures we get the correct video stream for download.',
          [{ text: 'OK' }]
        );
      }
      return;
    }

    try {
      setProgress(0); // Reset progress to 0 when starting new download
      setIsLocalDownloading(true); // Immediately set downloading state
      console.log('Starting download for:', {
        contentId: content.id,
        downloadId,
        videoUrl: videoUrl ? 'available' : 'missing'
      });

      const newDownloadId = await downloadService.startDownload(
        content,
        videoUrl,
        {
          quality: '720p' as any, // Default quality
          downloadSubtitles: true,
          wifiOnly: false,
        },
        season,
        episode,
        episodeTitle
      );

      console.log('Download started with ID:', newDownloadId);

      // Set up progress listener immediately after starting download
      const progressListener = (progressData: DownloadProgress) => {
        console.log('Download progress listener called:', progressData);
        setProgress(progressData.progress);
        setIsLocalDownloading(progressData.progress < 100);
        if (progressData.progress >= 100) {
          setProgress(100);
          setIsLocalDownloading(false);
          // Download completed - get updated download item
          const updatedDownload = downloadService.getDownload(newDownloadId);
          setDownloadItem(updatedDownload);
        }
      };

      downloadService.addProgressListener(newDownloadId, progressListener);

      // Update download item
      const download = downloadService.getDownload(newDownloadId);
      setDownloadItem(download);

    } catch (error: any) {
      setIsLocalDownloading(false);
      console.error('Download start failed:', error);
      Alert.alert('Download Error', error.message || 'Failed to start download');
    }
  };

  const handlePause = async () => {
    if (!downloadItem) return;

    try {
      await downloadService.pauseDownload(downloadItem.id);
      
      const updatedDownload = downloadService.getDownload(downloadItem.id);
      setDownloadItem(updatedDownload);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to pause download');
    }
  };

  const handleResume = async () => {
    if (!downloadItem) return;

    try {
      await downloadService.resumeDownload(downloadItem.id);
      
      const updatedDownload = downloadService.getDownload(downloadItem.id);
      setDownloadItem(updatedDownload);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to resume download');
    }
  };

  const handleCancel = async () => {
    if (!downloadItem) return;

    Alert.alert(
      'Cancel Download',
      'Are you sure you want to cancel this download?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              await downloadService.cancelDownload(downloadItem.id);
              setProgress(0);
              setDownloadItem(null);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to cancel download');
            }
          },
        },
      ]
    );
  };

  const handleLongPress = () => {
    if (downloadItem?.status === DownloadStatus.DOWNLOADING) {
      handleCancel();
    } else if (downloadItem?.status === DownloadStatus.COMPLETED) {
      handleDelete();
    }
  };

  const handleDelete = async () => {
    if (!downloadItem) return;

    Alert.alert(
      'Delete Download',
      'Are you sure you want to delete this downloaded content?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              await downloadService.deleteDownload(downloadItem.id);
              setDownloadItem(null);
              setProgress(0);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete download');
            }
          },
        },
      ]
    );
  };

  const getIconSize = () => {
    switch (size) {
      case 'small': return 18;
      case 'large': return 32;
      default: return 24;
    }
  };

  const getButtonSize = () => {
    switch (size) {
      case 'small': return 36;
      case 'large': return 52;
      default: return 44;
    }
  };

  // Show different states based on download status
  if (isDownloaded && downloadItem?.status === DownloadStatus.COMPLETED) {
    return (
      <TouchableOpacity
        style={[
          styles.downloadButtonContainer,
          {
            width: getButtonSize(),
            height: getButtonSize(),
            borderRadius: getButtonSize() / 2,
          },
          style
        ]}
        onPress={handleDelete}
        onLongPress={handleLongPress}
        activeOpacity={0.7}
      >
        <View style={styles.iconContainer}>
          <Icon name="check-circle" size={getIconSize()} color="#00ff00" />
        </View>
      </TouchableOpacity>
    );
  }

  if (downloadItem?.status === DownloadStatus.DOWNLOADING || _isLocalDownloading) {
    const progressToShow = Math.max(0, Math.min(100, progress));
    console.log('Rendering download progress:', {
      downloadId: downloadItem?.id || 'local',
      status: downloadItem?.status,
      isLocalDownloading: _isLocalDownloading,
      progress,
      progressToShow,
      buttonSize: getButtonSize()
    });
    
    return (
      <TouchableOpacity
        style={[
          {
            width: getButtonSize(),
            height: getButtonSize(),
            borderRadius: getButtonSize() / 2,
          },
          style
        ]}
        onPress={handlePause}
        onLongPress={handleLongPress}
        activeOpacity={0.7}
      >
        <CircularProgress size={getButtonSize()} progress={progressToShow}>
          <Icon name="pause" size={getIconSize() * 0.6} color={COLORS.NETFLIX_WHITE} />
        </CircularProgress>
      </TouchableOpacity>
    );
  }

  if (downloadItem?.status === DownloadStatus.PAUSED) {
    return (
      <TouchableOpacity
        style={[
          styles.downloadButtonContainer,
          {
            width: getButtonSize(),
            height: getButtonSize(),
            borderRadius: getButtonSize() / 2,
          },
          style
        ]}
        onPress={handleResume}
        onLongPress={handleLongPress}
        activeOpacity={0.7}
      >
        <CircularProgress size={getButtonSize()} progress={progress}>
          <Icon name="play-arrow" size={getIconSize() * 0.6} color={COLORS.NETFLIX_WHITE} />
        </CircularProgress>
      </TouchableOpacity>
    );
  }

  // If preparing video, show loading state
  if (isPreparingVideo) {
    return (
      <TouchableOpacity
        style={[
          styles.downloadButtonContainer,
          {
            width: getButtonSize(),
            height: getButtonSize(),
            borderRadius: getButtonSize() / 2,
          },
          style
        ]}
        disabled={true}
        activeOpacity={0.7}
      >
        <View style={styles.iconContainer}>
          <Icon 
            name="cloud-download" 
            size={getIconSize()} 
            color={COLORS.NETFLIX_GRAY}
          />
        </View>
      </TouchableOpacity>
    );
  }

  // Default download button
  return (
    <TouchableOpacity
      style={[
        styles.downloadButtonContainer,
        {
          width: getButtonSize(),
          height: getButtonSize(),
          borderRadius: getButtonSize() / 2,
        },
        style
      ]}
      onPress={handleDownload}
      activeOpacity={0.7}
      // Don't disable the button - let it show informative message instead
    >
      <View style={styles.iconContainer}>
        <Icon 
          name="download" 
          size={getIconSize()} 
          color={COLORS.NETFLIX_WHITE} 
        />
      </View>
    </TouchableOpacity>
  );
};

interface DownloadsListProps {
  downloads: DownloadItem[];
  onItemPress?: (download: DownloadItem) => void;
  onDeletePress?: (download: DownloadItem) => void;
}

export const DownloadsList: React.FC<DownloadsListProps> = ({
  downloads,
  onItemPress,
  onDeletePress,
}) => {
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getStatusColor = (status: DownloadStatus): string => {
    switch (status) {
      case DownloadStatus.COMPLETED: return '#00ff00';
      case DownloadStatus.DOWNLOADING: return '#0099ff';
      case DownloadStatus.PAUSED: return '#ff9900';
      case DownloadStatus.FAILED: return COLORS.NETFLIX_RED;
      default: return COLORS.NETFLIX_GRAY;
    }
  };

  const getStatusText = (status: DownloadStatus): string => {
    switch (status) {
      case DownloadStatus.COMPLETED: return 'Downloaded';
      case DownloadStatus.DOWNLOADING: return 'Downloading';
      case DownloadStatus.PAUSED: return 'Paused';
      case DownloadStatus.FAILED: return 'Failed';
      case DownloadStatus.CANCELLED: return 'Cancelled';
      default: return 'Pending';
    }
  };

  if (downloads.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="download" size={64} color={COLORS.NETFLIX_GRAY} />
        <Text style={styles.emptyTitle}>No Downloads</Text>
        <Text style={styles.emptyMessage}>
          Downloaded content will appear here for offline viewing
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
      {downloads.map((download) => (
        <TouchableOpacity
          key={download.id}
          style={styles.downloadItem}
          onPress={() => onItemPress?.(download)}
          activeOpacity={0.7}
        >
          <View style={styles.downloadImage}>
            {download.thumbnailPath ? (
              <Image
                source={{ uri: `file://${download.thumbnailPath}` }}
                style={styles.thumbnail}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.placeholderImage}>
                <Icon name="movie" size={32} color={COLORS.NETFLIX_GRAY} />
              </View>
            )}
            
            {download.status === DownloadStatus.DOWNLOADING && (
              <View style={styles.progressOverlay}>
                <View style={[styles.progressBar, { width: `${download.progress}%` }]} />
              </View>
            )}
          </View>

          <View style={styles.downloadInfo}>
            <Text style={styles.downloadTitle} numberOfLines={2}>
              {download.title}
              {download.episodeTitle && ` - ${download.episodeTitle}`}
            </Text>
            
            {download.season && download.episode && (
              <Text style={styles.episodeInfo}>
                Season {download.season}, Episode {download.episode}
              </Text>
            )}

            <View style={styles.downloadMeta}>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(download.status) }]}>
                <Text style={styles.statusText}>{getStatusText(download.status)}</Text>
              </View>
              
              <Text style={styles.quality}>{download.quality}</Text>
              
              {download.totalSize && (
                <Text style={styles.fileSize}>
                  {formatFileSize(download.totalSize)}
                </Text>
              )}
            </View>

            {download.status === DownloadStatus.DOWNLOADING && (
              <View style={styles.downloadProgress}>
                <Text style={styles.progressPercentage}>
                  {Math.round(download.progress)}%
                </Text>
                {download.downloadSpeed && (
                  <Text style={styles.downloadSpeed}>
                    {formatFileSize(download.downloadSpeed)}/s
                  </Text>
                )}
                {download.estimatedTimeRemaining && (
                  <Text style={styles.timeRemaining}>
                    {formatDuration(download.estimatedTimeRemaining)} left
                  </Text>
                )}
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => onDeletePress?.(download)}
            activeOpacity={0.7}
          >
            <Icon name="delete" size={24} color={COLORS.NETFLIX_RED} />
          </TouchableOpacity>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  // Download Button Styles
  buttonSmall: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 32,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonMedium: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonLarge: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadButton: {
    backgroundColor: COLORS.NETFLIX_RED,
  },
  completedButton: {
    backgroundColor: '#00ff00',
  },
  downloadingButton: {
    backgroundColor: COLORS.NETFLIX_DARK_GRAY,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pausedButton: {
    backgroundColor: '#ff9900',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  buttonText: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  disabledText: {
    color: COLORS.NETFLIX_GRAY,
  },
  pauseButton: {
    padding: 4,
  },
  resumeButton: {
    padding: 4,
  },
  cancelButton: {
    padding: 4,
  },
  progressContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressText: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 12,
    fontWeight: '600',
  },

  // Downloads List Styles
  listContainer: {
    flex: 1,
    backgroundColor: COLORS.NETFLIX_BLACK,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyMessage: {
    color: COLORS.NETFLIX_GRAY,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  downloadItem: {
    flexDirection: 'row',
    backgroundColor: COLORS.NETFLIX_DARK_GRAY,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  downloadImage: {
    width: 80,
    height: 120,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.NETFLIX_GRAY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.NETFLIX_RED,
  },
  downloadInfo: {
    flex: 1,
    paddingHorizontal: 12,
    justifyContent: 'space-between',
  },
  downloadTitle: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  episodeInfo: {
    color: COLORS.NETFLIX_GRAY,
    fontSize: 14,
    marginBottom: 8,
  },
  downloadMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  statusText: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  quality: {
    color: COLORS.NETFLIX_LIGHT_GRAY,
    fontSize: 12,
    marginRight: 8,
    fontWeight: '500',
  },
  fileSize: {
    color: COLORS.NETFLIX_GRAY,
    fontSize: 12,
  },
  downloadProgress: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressPercentage: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 12,
    fontWeight: '600',
    marginRight: 8,
  },
  downloadSpeed: {
    color: COLORS.NETFLIX_LIGHT_GRAY,
    fontSize: 10,
    marginRight: 8,
  },
  timeRemaining: {
    color: COLORS.NETFLIX_GRAY,
    fontSize: 10,
  },
  deleteButton: {
    padding: 8,
  },

  // Circular Progress Styles
  circularProgressContainer: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circularProgressContent: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  progressSvg: {
    position: 'absolute',
  },

  // New Download Button Styles
  downloadButtonContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default { DownloadButton, DownloadsList };