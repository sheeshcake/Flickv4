import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { View, BackHandler, Dimensions, StyleSheet, Text } from 'react-native';
import Video, { TextTrackType, SelectedTrackType } from 'react-native-video';
import { CastButton } from 'react-native-google-cast';
import { COLORS } from '../../utils/constants';
import { useAppState } from '../../hooks/useAppState';
import { SubtitleTrack } from '../../types';
import { SubtitleSelector } from '../';
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

  const videoRef = useRef<any>(null);
  const { state, updateWatchProgress } = useAppState();

  // Debug logging for initial state
  useEffect(() => {
    console.log('[MediaPlayer] Component mounted with autoplay:', autoplay, 'initialProgress:', initialProgress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    console.log("Video Url: ", videoUrl);
  }, [videoUrl]);

  // Debug logging for play state changes
  useEffect(() => {
    console.log('[MediaPlayer] isPlaying changed to:', isPlaying);
  }, [isPlaying]);

  // Custom hooks
  const { isFullscreen, toggleFullscreen } = useFullscreen(onFullscreenChange);
  const { controlsVisible, toggleControls, showControls } = useControlsVisibility(isPlaying);

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
      console.log('[MediaPlayer] Seeking to initial progress:', initialProgress, 'autoplay:', autoplay);
      videoRef.current.seek(initialProgress);
      setCurrentTime(initialProgress);
      setHasStartedFromProgress(true);
      
      // Ensure video plays after seeking if autoplay is enabled
      if (autoplay) {
        console.log('[MediaPlayer] Restoring play state after initial seek');
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

  // Video event handlers
  const handleLoadStart = useCallback(() => {
    setVideoStatus('loading');
    console.log('[MediaPlayer] Video loading started');
  }, []);

  const handleLoad = useCallback(({ duration: videoDuration }: { duration: number }) => {
    setDuration(videoDuration);
    console.log('[MediaPlayer] Video loaded, duration:', videoDuration, 'initialProgress:', initialProgress);

    // Don't restore current time during initial load - let the initial progress effect handle it
    // Only restore for subtitle changes (when we have progress but haven't started from initial progress yet)
    if (currentTime > 0 && hasStartedFromProgress && videoRef.current) {
      console.log('[MediaPlayer] Restoring currentTime after subtitle change:', currentTime);
      setTimeout(() => {
        videoRef.current.seek(currentTime);
      }, 50);
    }
  }, [currentTime, hasStartedFromProgress, initialProgress]);

  const handleReadyForDisplay = useCallback(() => {
    setVideoStatus('loaded');
    console.log('[MediaPlayer] Video ready for display, autoplay:', autoplay);

    // Force autoplay if enabled
    if (autoplay) {
      console.log('[MediaPlayer] Setting isPlaying to true due to autoplay');
      setIsPlaying(true);
    }
  }, [autoplay]);

  const handleProgress = useCallback(({ currentTime: time }: { currentTime: number }) => {
    setCurrentTime(time);
    
    // Log progress occasionally to verify playback is happening
    if (Math.floor(time) % 5 === 0 && Math.floor(time) !== Math.floor(currentTime)) {
      console.log('[MediaPlayer] Progress update:', Math.floor(time), 'isPlaying:', isPlaying);
    }
  }, [currentTime, isPlaying]);

  const handleBuffer = useCallback(({ isBuffering: buffering }: { isBuffering: boolean }) => {
    setIsBuffering(buffering);
  }, []);

  const handleError = useCallback((error: any) => {
    console.error('[MediaPlayer] Video error:', error);
    setVideoStatus('error');
    setIsBuffering(false);
  }, []);

  const handleSeek = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.seek(time);
      setCurrentTime(time);
      setIsPlaying(true);
      showControls();
    }
  }, [showControls]);

  const handleResizeModeToggle = useCallback(() => {
    setResizeMode(prev => (prev + 1) % RESIZE_MODES.length);
    showControls();
  }, [showControls]);

  const handleSubtitlePress = useCallback(() => {
    setShowSubtitleSelector(true);
    showControls();
  }, [showControls]);

  const handleSubtitleSelect = useCallback((subtitle: SubtitleTrack | null) => {
    console.log('[MediaPlayer] Subtitle selected:', subtitle?.title);

    const savedTime = currentTime;
    const wasPlaying = isPlaying;

    setSelectedSubtitle(subtitle);
    setShowSubtitleSelector(false);

    // Restore playback state
    // setTimeout(() => {
    //   if (videoRef.current && savedTime > 0) {
    //     videoRef.current.seek(savedTime);
    //     if (wasPlaying) setIsPlaying(true);
    //   }
    // }, 100);
  }, [currentTime, isPlaying, setSelectedSubtitle]);

  const handleCloseSubtitleSelector = useCallback(() => {
    setShowSubtitleSelector(false);
  }, []);

  // Text tracks configuration
  const textTracks = useMemo(() => {
    if (!selectedSubtitle) return [];

    const trackType = selectedSubtitle.format === 'vtt' || selectedSubtitle.isConverted
      ? TextTrackType.VTT
      : TextTrackType.SUBRIP;

    console.log('[MediaPlayer] Text track:', {
      title: selectedSubtitle.title,
      type: trackType,
      isDataUrl: selectedSubtitle.url.startsWith('data:'),
    });

    return [{
      title: selectedSubtitle.title,
      language: selectedSubtitle.language as any,
      type: trackType,
      uri: selectedSubtitle.url,
    }];
  }, [selectedSubtitle]);

  const selectedTextTrack = useMemo(() => {
    if (!selectedSubtitle) {
      return { type: SelectedTrackType.DISABLED };
    }
    return { type: SelectedTrackType.INDEX, value: 0 };
  }, [selectedSubtitle]);

  // Container styles
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

  // Log the paused prop value
  console.log('[MediaPlayer] Rendering Video with paused:', !isPlaying, 'isPlaying:', isPlaying);

  return (
    <View style={[styles.container, videoContainerStyle]}>
      <Video
        ref={videoRef}
        source={{ uri: videoUrl,
          headers : {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"
          }
         }}
        style={videoStyle}
        onLoadStart={handleLoadStart}
        onLoad={handleLoad}
        onReadyForDisplay={handleReadyForDisplay}
        onProgress={handleProgress}
        onBuffer={handleBuffer}
        onError={handleError}
        onPlaybackRateChange={({ playbackRate }) => {
          console.log("Playback Rate: ", playbackRate)
        }}
        resizeMode={RESIZE_MODES[resizeMode]}
        poster={imageUrl}
        posterResizeMode="cover"
        controls={false}
        repeat={false}
        muted={false}
        paused={!isPlaying}
        hideShutterView
        enterPictureInPictureOnLeave={state.user.preferences.pictureInPicture}
        progressUpdateInterval={1000}
        textTracks={textTracks}
        selectedTextTrack={selectedTextTrack}
        allowsExternalPlayback={false}
        playInBackground={false}
      />

      <Controls
        title={title}
        hide={!controlsVisible}
        onHide={toggleControls}
        onPause={() => {
          console.log('[MediaPlayer] onPause called');
          setIsPlaying(false);
        }}
        onPlay={() => {
          console.log('[MediaPlayer] onPlay called');
          setIsPlaying(true);
        }}
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
        upperRightComponent={
          <View style={styles.castButtonContainer}>
            <CastButton style={styles.castButton} />
          </View>
        }
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
