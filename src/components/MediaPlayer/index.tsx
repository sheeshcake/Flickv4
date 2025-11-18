import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { View, BackHandler, Dimensions, StyleSheet, Text } from 'react-native';
import Video from 'react-native-video';
import { CastButton } from 'react-native-google-cast';
import RNFS from 'react-native-fs';
import { COLORS } from '../../utils/constants';
import { useAppState } from '../../hooks/useAppState';
import { SubtitleTrack } from '../../types';
import { SubtitleSelector } from '../';
import { SubtitleOverlay } from './SubtitleOverlay';
import Controls from './controls';
import {
  useVideoProgress,
  useSubtitles,
  useFullscreen,
  useControlsVisibility,
} from './hooks';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Constants
const RESIZE_MODES = ['contain', 'cover', 'stretch', 'none'] as const;
const NEXT_EPISODE_THRESHOLD = 150; // seconds (2.5 minutes)

interface MediaPlayerProps {
  videoUrl: string;
  title: string;
  imageUrl?: string;
  subtitle?: string;
  contentType: 'movie' | 'tv';
  contentId: number;
  autoplay?: boolean;
  onEnd?: () => void;
  onNext?: () => void;
  navigation?: any;
  initialProgress?: number;
  season?: number;
  episode?: number;
  onFullscreenChange?: (isFullscreen: boolean) => void;
}

/**
 * Optimized MediaPlayer Component
 * Features:
 * - Custom hooks for state management (progress, subtitles, fullscreen, controls)
 * - Improved performance with memoization
 * - Better error handling and logging
 * - Cleaner code organization
 */
const MediaPlayer: React.FC<MediaPlayerProps> = ({
  videoUrl,
  title,
  imageUrl = '',
  contentType,
  contentId,
  autoplay = false,
  onNext,
  navigation,
  initialProgress = 0,
  season,
  episode,
  onFullscreenChange,
}) => {
  // Video state
  const [isPlaying, setIsPlaying] = useState(autoplay);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [resizeMode, setResizeMode] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [videoStatus, setVideoStatus] = useState('loading');
  const [isReadyForNext, setIsReadyForNext] = useState(false);
  const [hasStartedFromProgress, setHasStartedFromProgress] = useState(false);
  const [showSubtitleSelector, setShowSubtitleSelector] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);

  // State for subtitle content
  const [subtitleContent, setSubtitleContent] = useState<string | null>(null);

  const videoRef = useRef<any>(null);
  const { state, updateWatchProgress } = useAppState();

  // Custom hooks
  const { isFullscreen, toggleFullscreen } = useFullscreen(onFullscreenChange);
  const { controlsVisible, toggleControls, showControls } = useControlsVisibility(isPlaying, isSeeking);

  // Get saved subtitle from continue watching
  const savedSubtitle = useMemo(() => {
    const watchProgress = state.user.continueWatching.find(
      item =>
        item.contentId === contentId &&
        item.contentType === contentType &&
        (contentType === 'movie' || (item.season === season && item.episode === episode))
    );
    return watchProgress?.selectedSubtitle || null;
  }, [state.user.continueWatching, contentId, contentType, season, episode]);

  const {
    selectedSubtitle,
    setSelectedSubtitle,
    availableSubtitles,
  } = useSubtitles({
    contentId,
    contentType,
    season,
    episode,
    autoSelectSubtitles: state.user.preferences.autoSelectSubtitles,
    defaultSubtitleLanguage: state.user.preferences.defaultSubtitleLanguage,
    savedSubtitle,
  });

  // Video progress tracking
  useVideoProgress({
    contentId,
    contentType,
    duration,
    currentTime,
    season,
    episode,
    selectedSubtitle,
    updateWatchProgress,
    isPlaying,
  });

  // Seek to initial progress when video loads
  useEffect(() => {
    if (duration > 0 && initialProgress > 0 && !hasStartedFromProgress && videoRef.current) {
      videoRef.current.seek(initialProgress);
      setCurrentTime(initialProgress);
      setHasStartedFromProgress(true);
      
      if (autoplay) {
        setTimeout(() => {
          setIsPlaying(true);
        }, 100);
      }
    }
  }, [duration, initialProgress, hasStartedFromProgress, autoplay]);

  // Check if near end for next episode button
  useEffect(() => {
    if (contentType === 'tv' && duration > 0) {
      const timeRemaining = duration - currentTime;
      setIsReadyForNext(timeRemaining < NEXT_EPISODE_THRESHOLD);
    }
  }, [contentType, duration, currentTime]);

  // Back button handler
  useEffect(() => {
    const handleBackPress = () => {
      if (isFullscreen) {
        toggleFullscreen();
        return true;
      }
      setIsPlaying(false);
      navigation?.goBack();
      return true;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => backHandler.remove();
  }, [isFullscreen, navigation, toggleFullscreen]);


  const handleLoad = useCallback(({ duration: videoDuration }: { duration: number }) => {
    setDuration(videoDuration);

    if (currentTime > 0 && hasStartedFromProgress && videoRef.current) {
      setTimeout(() => {
        videoRef.current.seek(currentTime);
      }, 50);
    }
  }, [currentTime, hasStartedFromProgress]);

  const handleProgress = useCallback(({ currentTime: time }: { currentTime: number }) => {
    setCurrentTime(time);
  }, []);

  const handleBuffer = useCallback(({ isBuffering: buffering }: { isBuffering: boolean }) => {
    setIsBuffering(buffering);
    setVideoStatus(buffering ? 'loading' : 'loaded');
  }, []);

  const handleError = useCallback((error: any) => {
    console.error('[MediaPlayer] Video error:', error);
    setVideoStatus('error');
    setIsBuffering(false);
  }, []);

  const handleSeek = useCallback((time: number) => {
    if (videoRef.current && duration > 0) {
      const clampedTime = Math.max(0, Math.min(time, duration));
      videoRef.current.seek(clampedTime);
      setCurrentTime(clampedTime);
      showControls();
    }
  }, [duration, showControls]);

  const handleResizeModeToggle = useCallback(() => {
    setResizeMode(prev => (prev + 1) % RESIZE_MODES.length);
    showControls();
  }, [showControls]);

  const handleSubtitlePress = useCallback(() => {
    setShowSubtitleSelector(true);
    showControls();
  }, [showControls]);

  const handleSubtitleSelect = useCallback((subtitle: SubtitleTrack | null) => {
    setSelectedSubtitle(subtitle);
    setShowSubtitleSelector(false);
  }, [setSelectedSubtitle]);

  const handleCloseSubtitleSelector = useCallback(() => {
    setShowSubtitleSelector(false);
  }, []);

  const handleSeekingStateChange = useCallback((seeking: boolean) => {
    setIsSeeking(seeking);
  }, []);

  useEffect(() => {
    if (!selectedSubtitle) {
      setSubtitleContent(null);
      return;
    }

    const downloadAndSaveSubtitle = async () => {
      try {
        const subtitlesDir = `${RNFS.DocumentDirectoryPath}/subtitles`;
        const dirExists = await RNFS.exists(subtitlesDir);
        
        if (!dirExists) {
          await RNFS.mkdir(subtitlesDir);
        }

        const sanitizedTitle = selectedSubtitle.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + `_${contentId}` + (season && episode ? `_s${season}e${episode}` : '');
        const filename = `${sanitizedTitle}_${selectedSubtitle.language}.srt`;
        const localPath = `${subtitlesDir}/${filename}`;

        const fileExists = await RNFS.exists(localPath);
        
        if (fileExists) {
          const cachedContent = await RNFS.readFile(localPath, 'utf8');
          setSubtitleContent(cachedContent);
          return;
        }

        const response = await fetch(selectedSubtitle.url);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const downloadedContent = await response.text();
        
        await RNFS.writeFile(localPath, downloadedContent, 'utf8');
        
        setSubtitleContent(downloadedContent);
        
      } catch (error) {
        console.error('[MediaPlayer] Failed to process subtitle:', error);
      }
    };

    downloadAndSaveSubtitle();
  }, [selectedSubtitle, contentId, season, episode]);


  const videoContainerStyle = useMemo(() => ({
    height: isFullscreen ? screenWidth : screenHeight * 0.3,
    width: isFullscreen ? screenHeight : screenWidth,
    backgroundColor: COLORS.NETFLIX_BLACK,
    position: 'relative' as const,
  }), [isFullscreen]);

  const videoStyle = useMemo(() => ({
    position: 'absolute' as const,
    top: isFullscreen ? 0 : 15,
    left: 0,
    bottom: 0,
    right: 0,
    height: isFullscreen ? screenWidth : screenHeight * 0.3,
    width: isFullscreen ? screenHeight : screenWidth,
  }), [isFullscreen]);

  if (!videoUrl) {
    return (
      <View style={[styles.container, videoContainerStyle]}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>No video URL provided</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, videoContainerStyle]}>
      <Video
        ref={videoRef}
        source={{ 
          uri: videoUrl,
        }}
        style={videoStyle}
        onLoad={handleLoad}
        onProgress={handleProgress}
        onBuffer={handleBuffer}
        onError={handleError}
        resizeMode={RESIZE_MODES[resizeMode]}
        poster={imageUrl}
        controls={false}
        repeat={false}
        muted={false}
        paused={!isPlaying}
        hideShutterView
        enterPictureInPictureOnLeave={state.user.preferences.pictureInPicture}
        progressUpdateInterval={250}
        allowsExternalPlayback={false}
      />

      <Controls
        title={title}
        hide={!controlsVisible}
        onHide={toggleControls}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        playing={isPlaying}
        currentPosition={currentTime}
        duration={duration}
        onSeek={handleSeek}
        fullscreen={isFullscreen}
        onFullscreen={toggleFullscreen}
        onResize={handleResizeModeToggle}
        readyNext={isReadyForNext}
        onNext={onNext}
        _link
        _movie={null}
        _isBuffering={isBuffering}
        _resize={resizeMode}
        videoStatus={videoStatus}
        _onDownload={() => {}}
        onSubtitlePress={handleSubtitlePress}
        hasSubtitles={!!selectedSubtitle}
        onSeekingStateChange={handleSeekingStateChange}
        upperRightComponent={
          <View style={styles.castButtonContainer}>
            <CastButton style={styles.castButton} />
          </View>
        }
      />

      {/* Custom subtitle overlay for Android compatibility */}
      <SubtitleOverlay
        subtitleContent={subtitleContent}
        currentTime={currentTime}
        isVideoFullscreen={isFullscreen}
      />

      <SubtitleSelector
        visible={showSubtitleSelector}
        onClose={handleCloseSubtitleSelector}
        onSelectSubtitle={handleSubtitleSelect}
        selectedSubtitle={selectedSubtitle}
        contentId={contentId}
        contentType={contentType}
        season={season}
        episode={episode}
        title={title}
        prefetchedSubtitles={availableSubtitles}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.NETFLIX_BLACK,
    justifyContent: 'center',
    alignItems: 'center',
  },
  castButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  castButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.NETFLIX_BLACK,
  },
  errorText: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 16,
    textAlign: 'center',
  },
});

export default React.memo(MediaPlayer);
