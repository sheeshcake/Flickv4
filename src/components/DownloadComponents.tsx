import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  Modal,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import RNFS from 'react-native-fs';
import { TMDBService } from '../services/TMDBService';
import Svg, { Circle } from 'react-native-svg';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { 
  DownloadItem, 
  DownloadStatus, 
  DownloadProgress,
  Movie, 
  TVShow,
  M3U8StreamInfo,
} from '../types';
import { downloadService } from '../services';
import { COLORS } from '../utils/constants';

// Helper component: DownloadThumbnail - resolves local file or TMDB fallback
const DownloadThumbnail: React.FC<{ download: DownloadItem }> = React.memo(({ download }) => {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const tmdb = new TMDBService();

    const resolve = async () => {
      try {
        if (download.thumbnailPath) {
          const exists = await RNFS.exists(download.thumbnailPath);
          if (exists && mounted) {
            setUri(`file://${download.thumbnailPath}`);
            return;
          }
        }

        // fallback to TMDB poster or backdrop
        if (download.posterPath) {
          const remote = tmdb.getImageUrl(download.posterPath);
          if (mounted) setUri(remote);
          return;
        }

        if (download.backdropPath) {
          const remote = tmdb.getImageUrl(download.backdropPath);
          if (mounted) setUri(remote);
          return;
        }

        setUri(null);
      } catch (error) {
        console.warn('Failed to resolve download thumbnail:', error);
        if (mounted) setUri(null);
      }
    };

    resolve();

    return () => { mounted = false; };
  }, [download]);

  if (!uri) {
    return (
      <View style={styles.placeholderImage}>
        <Icon name="movie" size={32} color={COLORS.NETFLIX_GRAY} />
      </View>
    );
  }

  return (
    <Image source={{ uri }} style={styles.thumbnail} resizeMode="cover" />
  );
});

interface CircularProgressProps {
  size: number;
  progress: number;
  children?: React.ReactNode;
}

// Memoize CircularProgress to prevent unnecessary re-renders
const CircularProgress: React.FC<CircularProgressProps> = React.memo(({
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
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if progress changed significantly (by 1% or more)
  return prevProps.size === nextProps.size && 
         Math.abs(prevProps.progress - nextProps.progress) < 1;
});

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
  
  // Track last progress to avoid unnecessary state updates
  const lastProgressRef = useRef<number>(0);
  const lastStatusRef = useRef<DownloadStatus | null>(null);
  
  // Resolution selection state
  const [showResolutionModal, setShowResolutionModal] = useState(false);
  const [availableResolutions, setAvailableResolutions] = useState<M3U8StreamInfo[]>([]);
  const [loadingResolutions, setLoadingResolutions] = useState(false);

  const contentType = 'title' in content ? 'movie' : 'tv';
  const isDownloaded = downloadService.isContentDownloaded(
    content?.id,
    contentType,
    season,
    episode
  );

  const downloadId = useMemo(() => {
    const base = `${contentType}_${content.id}`;
    if (contentType === 'tv' && season !== undefined && episode !== undefined) {
      return `${base}_s${season}_e${episode}`;
    }
    return base;
  }, [content.id, contentType, season, episode]);

  useEffect(() => {
    // Check if content is already downloaded or downloading
    const existingDownload = downloadService.getDownload(downloadId);
    
    if (existingDownload) {
      setDownloadItem(existingDownload);
      setProgress(existingDownload.progress || 0);
      setIsLocalDownloading(existingDownload.status === DownloadStatus.DOWNLOADING);
      lastProgressRef.current = existingDownload.progress || 0;
      lastStatusRef.current = existingDownload.status;
    } else {
      // Reset state when no existing download
      setDownloadItem(null);
      setProgress(0);
      setIsLocalDownloading(false);
      lastProgressRef.current = 0;
      lastStatusRef.current = null;
    }

    // Set up progress listener with debouncing to reduce re-renders
    const progressListener = (progressData: DownloadProgress) => {
      // Only update if progress changed significantly (by at least 2%)
      const progressDiff = Math.abs(progressData.progress - lastProgressRef.current);
      if (progressDiff < 2 && progressData.progress < 100) {
        return;
      }
      
      lastProgressRef.current = progressData.progress;
      
      // Direct state update - service already throttles to 2 seconds
      setProgress(progressData.progress);
      setIsLocalDownloading(progressData.progress < 100 && progressData.progress > 0);
      
      // Update download item with progress data (including speed)
      setDownloadItem(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          progress: progressData.progress,
          downloadSpeed: progressData.downloadSpeed,
          downloadedSize: progressData.downloadedSize,
          totalSize: progressData.totalSize,
          estimatedTimeRemaining: progressData.estimatedTimeRemaining,
          updatedAt: new Date(),
        };
      });
      
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
    if (downloadItem && downloadItem.status !== lastStatusRef.current) {
      lastStatusRef.current = downloadItem.status;
      setProgress(downloadItem.progress || 0);
      setIsLocalDownloading(downloadItem.status === DownloadStatus.DOWNLOADING);
    }
  }, [downloadItem]);

  // Minimal polling only for downloads without active progress listeners
  // Significantly increased interval to reduce CPU usage
  useEffect(() => {
    // Only set up polling if actively downloading
    if (!(_isLocalDownloading || downloadItem?.status === DownloadStatus.DOWNLOADING)) {
      return;
    }
    
    // Poll every 10 seconds but only act on very stale data (30 seconds)
    const pollInterval = setInterval(() => {
      const timeSinceLastUpdate = downloadItem?.updatedAt ? 
        Date.now() - downloadItem.updatedAt.getTime() : 
        Date.now();
      
      // Only poll if very stale (30 seconds without updates)
      if (timeSinceLastUpdate > 30000) {
        const currentDownload = downloadService.getDownload(downloadId);
        if (currentDownload) {
          // Only update if significant change
          if (Math.abs((currentDownload.progress || 0) - progress) >= 2 || 
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
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(pollInterval);
  }, [_isLocalDownloading, downloadItem?.status, downloadId]);

  // Fetch available resolutions for the video
  const fetchResolutions = useCallback(async () => {
    if (!videoUrl) return;
    
    setLoadingResolutions(true);
    try {
      const resolutions = await downloadService.getAvailableResolutions(videoUrl);
      setAvailableResolutions(resolutions);
      
      if (resolutions.length === 0) {
        // No resolution options (direct file download), start immediately
        await startDownloadWithResolution(undefined);
      } else {
        // Show resolution selection modal
        setShowResolutionModal(true);
      }
    } catch (error) {
      console.error('Failed to fetch resolutions:', error);
      // Fallback to direct download without resolution selection
      await startDownloadWithResolution(undefined);
    } finally {
      setLoadingResolutions(false);
    }
  }, [videoUrl]);

  // Start download with selected resolution
  const startDownloadWithResolution = useCallback(async (selectedStream?: M3U8StreamInfo) => {
    setShowResolutionModal(false);
    
    try {
      setProgress(0);
      setIsLocalDownloading(true);
      lastProgressRef.current = 0;

      // Determine quality label from resolution
      let qualityLabel = '720p';
      if (selectedStream) {
        if (selectedStream.height >= 2160) qualityLabel = '4K';
        else if (selectedStream.height >= 1080) qualityLabel = '1080p';
        else if (selectedStream.height >= 720) qualityLabel = '720p';
        else if (selectedStream.height >= 480) qualityLabel = '480p';
        else qualityLabel = `${selectedStream.height}p`;
      }

      const newDownloadId = await downloadService.startDownload(
        content,
        videoUrl!,
        {
          quality: qualityLabel as any,
          downloadSubtitles: true,
          wifiOnly: false,
          selectedStreamUrl: selectedStream?.url,
        },
        season,
        episode,
        episodeTitle
      );

      // Set up progress listener immediately after starting download
      // Note: The main useEffect already handles progress listening
      // This is just to ensure immediate feedback

      // Update download item
      const download = downloadService.getDownload(newDownloadId);
      setDownloadItem(download);

    } catch (error: any) {
      setIsLocalDownloading(false);
      Alert.alert('Download Error', error.message || 'Failed to start download');
    }
  }, [content, videoUrl, season, episode, episodeTitle]);

  const handleDownload = useCallback(async () => {
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

    // Fetch available resolutions and show selection modal
    await fetchResolutions();
  }, [videoUrl, onVideoNeeded, fetchResolutions]);

  const handlePause = useCallback(async () => {
    if (!downloadItem) return;

    try {
      await downloadService.pauseDownload(downloadItem.id);
      
      const updatedDownload = downloadService.getDownload(downloadItem.id);
      setDownloadItem(updatedDownload);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to pause download');
    }
  }, [downloadItem]);

  const handleResume = useCallback(async () => {
    if (!downloadItem) return;

    try {
      await downloadService.resumeDownload(downloadItem.id);
      
      const updatedDownload = downloadService.getDownload(downloadItem.id);
      setDownloadItem(updatedDownload);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to resume download');
    }
  }, [downloadItem]);

  const handleCancel = useCallback(async () => {
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
  }, [downloadItem]);

  const handleLongPress = useCallback(() => {
    if (downloadItem?.status === DownloadStatus.DOWNLOADING) {
      handleCancel();
    } else if (downloadItem?.status === DownloadStatus.COMPLETED) {
      handleDelete();
    }
  }, [downloadItem, handleCancel]);

  const handleDelete = useCallback(async () => {
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
  }, [downloadItem]);

  const getIconSize = useMemo(() => {
    switch (size) {
      case 'small': return 18;
      case 'large': return 32;
      default: return 24;
    }
  }, [size]);

  const getButtonSize = useMemo(() => {
    switch (size) {
      case 'small': return 36;
      case 'large': return 52;
      default: return 44;
    }
  }, [size]);

  // Show different states based on download status
  if (isDownloaded && downloadItem?.status === DownloadStatus.COMPLETED) {
    return (
      <TouchableOpacity
        style={[
          styles.downloadButtonContainer,
          {
            width: getButtonSize,
            height: getButtonSize,
            borderRadius: getButtonSize / 2,
          },
          style
        ]}
        onPress={handleDelete}
        onLongPress={handleLongPress}
        activeOpacity={0.7}
      >
        <View style={styles.iconContainer}>
          <Icon name="check-circle" size={getIconSize} color="#00ff00" />
        </View>
      </TouchableOpacity>
    );
  }

  if (downloadItem?.status === DownloadStatus.DOWNLOADING || _isLocalDownloading) {
    const progressToShow = Math.max(0, Math.min(100, progress));
    
    return (
      <TouchableOpacity
        style={[
          {
            width: getButtonSize,
            height: getButtonSize,
            borderRadius: getButtonSize / 2,
          },
          style
        ]}
        onPress={handlePause}
        onLongPress={handleLongPress}
        activeOpacity={0.7}
      >
        <CircularProgress size={getButtonSize} progress={progressToShow}>
          <Icon name="pause" size={getIconSize * 0.6} color={COLORS.NETFLIX_WHITE} />
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
            width: getButtonSize,
            height: getButtonSize,
            borderRadius: getButtonSize / 2,
          },
          style
        ]}
        onPress={handleResume}
        onLongPress={handleLongPress}
        activeOpacity={0.7}
      >
        <CircularProgress size={getButtonSize} progress={progress}>
          <Icon name="play-arrow" size={getIconSize * 0.6} color={COLORS.NETFLIX_WHITE} />
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
            width: getButtonSize,
            height: getButtonSize,
            borderRadius: getButtonSize / 2,
          },
          style
        ]}
        disabled={true}
        activeOpacity={0.7}
      >
        <View style={styles.iconContainer}>
          <Icon 
            name="cloud-download" 
            size={getIconSize} 
            color={COLORS.NETFLIX_GRAY}
          />
        </View>
      </TouchableOpacity>
    );
  }

  // Resolution Selection Modal
  const renderResolutionModal = () => (
    <Modal
      visible={showResolutionModal}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowResolutionModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.resolutionModalContent}>
          <View style={styles.resolutionModalHeader}>
            <Text style={styles.resolutionModalTitle}>Select Quality</Text>
            <TouchableOpacity 
              onPress={() => setShowResolutionModal(false)}
              style={styles.modalCloseButton}
            >
              <Icon name="close" size={24} color={COLORS.NETFLIX_WHITE} />
            </TouchableOpacity>
          </View>
          
          <FlatList
            data={availableResolutions}
            keyExtractor={(item, index) => `${item.resolution}-${index}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.resolutionItem}
                onPress={() => startDownloadWithResolution(item)}
              >
                <View style={styles.resolutionInfo}>
                  <Text style={styles.resolutionLabel}>{item.label}</Text>
                  <Text style={styles.resolutionDetails}>
                    {item.resolution} {item.codecs ? `• ${item.codecs.split(',')[0]}` : ''}
                  </Text>
                </View>
                <Icon name="download" size={24} color={COLORS.NETFLIX_RED} />
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.resolutionSeparator} />}
            ListEmptyComponent={
              <Text style={styles.noResolutionsText}>No resolutions available</Text>
            }
          />
        </View>
      </View>
    </Modal>
  );

  // Default download button
  return (
    <>
      {renderResolutionModal()}
      <TouchableOpacity
        style={[
          styles.downloadButtonContainer,
          {
            width: getButtonSize,
            height: getButtonSize,
            borderRadius: getButtonSize / 2,
          },
          style
        ]}
        onPress={handleDownload}
        activeOpacity={0.7}
        disabled={loadingResolutions}
      >
        <View style={styles.iconContainer}>
          {loadingResolutions ? (
            <ActivityIndicator size="small" color={COLORS.NETFLIX_WHITE} />
          ) : (
            <Icon 
              name="download" 
              size={getIconSize} 
              color={COLORS.NETFLIX_WHITE} 
            />
          )}
        </View>
      </TouchableOpacity>
    </>
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
      case DownloadStatus.COMPLETED: return '#75af42';
      case DownloadStatus.DOWNLOADING: return '#124191';
      case DownloadStatus.PAUSED: return '#ed812b';
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
            <DownloadThumbnail download={download} />
            
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
              
              {/* {download.totalSize && (
                <Text style={styles.fileSize}>
                  {formatFileSize(download.totalSize)}
                </Text>
              )} */}
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

  // Resolution Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  resolutionModalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 30,
  },
  resolutionModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  resolutionModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.NETFLIX_WHITE,
  },
  modalCloseButton: {
    padding: 4,
  },
  resolutionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  resolutionInfo: {
    flex: 1,
    marginRight: 16,
  },
  resolutionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.NETFLIX_WHITE,
    marginBottom: 4,
  },
  resolutionDetails: {
    fontSize: 12,
    color: COLORS.NETFLIX_GRAY,
  },
  resolutionSeparator: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 20,
  },
  noResolutionsText: {
    fontSize: 14,
    color: COLORS.NETFLIX_GRAY,
    textAlign: 'center',
    padding: 20,
  },
});

export default { DownloadButton, DownloadsList };