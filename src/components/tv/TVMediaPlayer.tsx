/**
 * TV Media Player Component
 * Full-screen video player optimized for TV with D-pad remote navigation
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  BackHandler,
  ActivityIndicator,
  Platform,
  PanResponder,
  GestureResponderEvent,
} from 'react-native';
import Video, { BufferingStrategyType, TextTrackType, SelectedTrackType } from 'react-native-video';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { useAppState } from '../../hooks/useAppState';
import { usePlaybackCache } from '../../hooks/usePlaybackCache';
import { VIDEO_STREAM_HEADERS } from '../../utils/streamHeaders';
import { convertSrtToVtt } from '../../utils/subtitleUtils';
import { SubtitleTrack, DEFAULT_SUBTITLE_STYLE } from '../../types';
import { SubtitleOverlay } from '../MediaPlayer/SubtitleOverlay';
import { TVSubtitleSelector } from './TVSubtitleSelector';
import { useSubtitles, useTVRemote } from '../MediaPlayer/hooks';
import RNFS from 'react-native-fs';
import { TVButton } from './TVButton';

const TV_FOCUS_COLOR = '#E50914';
const SEEK_AMOUNT = 10; // seconds
const SEEK_AMOUNT_LARGE = 30; // seconds for fast forward/rewind
const CONTROLS_HIDE_DELAY = 5000; // 10 seconds

interface TVMediaPlayerProps {
  videoUrl: string;
  title: string;
  contentId: number;
  contentType: 'movie' | 'tv';
  initialProgress?: number;
  season?: number;
  episode?: number;
  onEnd?: () => void;
  onBack?: () => void;
  navigation?: any;
}

// Format time helper
const formatTime = (seconds: number): string => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const TV_SUBTITLE_STYLE = { fontSize: 16, paddingBottom: 20 };

export const TVMediaPlayer: React.FC<TVMediaPlayerProps> = ({
  videoUrl,
  title,
  contentId,
  contentType,
  initialProgress = 0,
  season,
  episode,
  onEnd,
  onBack,
  navigation,
}) => {
  // Video state
  const [isPlaying, setIsPlaying] = useState(false); // Start paused to let player initialize
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isValidUrl, setIsValidUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [hasStartedFromProgress, setHasStartedFromProgress] = useState(false);
  const [showSubtitleSelector, setShowSubtitleSelector] = useState(false);
  const [subtitleContent, setSubtitleContent] = useState<string | null>(null);
  const [subtitleVttPath, setSubtitleVttPath] = useState<string | null>(null);
  const [subtitleDelay] = useState(0);
  const [focusedButton, setFocusedButton] = useState<string>('play');
  // Seekbar drag state
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekBarWidth, setSeekBarWidth] = useState(0);
  const [bufferedPosition, setBufferedPosition] = useState(0);
  const seekBarRef = useRef<View>(null);

  const videoRef = useRef<any>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { state, updateWatchProgress } = useAppState();

  const isLocalFile = videoUrl.startsWith('file://') || videoUrl.startsWith('/');
  const {
    playbackUrl,
    cacheStatus,
    onPlaybackProgress,
    onPlaybackEnd,
    isCacheLoading,
  } = usePlaybackCache({
    videoUrl,
    initialProgress,
    enabled: !isLocalFile,
  });

  // Progress bar animation
  const progressWidth = useSharedValue(0);
  const controlsOpacity = useSharedValue(1);

  // Validate URL before initializing player
  useEffect(() => {
    let cancelled = false;
    
    const validateAndInitialize = async () => {
      // Reset state
      setIsValidUrl(false);
      setUrlError(null);
      setIsPlayerReady(false);
      
      // Check if URL is provided and valid format
      if (!videoUrl || typeof videoUrl !== 'string' || videoUrl.trim() === '') {
        setUrlError('No video URL provided');
        return;
      }
      
      // Basic URL format validation using regex
      const urlPattern = /^https?:\/\/.+/i;
      if (!urlPattern.test(videoUrl)) {
        setUrlError('Invalid URL format');
        return;
      }
      
      // URL looks valid, allow player to initialize after delay
      await new Promise<void>(resolve => setTimeout(resolve, 200));
      
      if (!cancelled) {
        setIsValidUrl(true);
        setIsPlayerReady(true);
        console.log('[TVMediaPlayer] URL validated, player ready:', videoUrl.substring(0, 60) + '...');
      }
    };
    
    validateAndInitialize();
    
    return () => {
      cancelled = true;
    };
  }, [videoUrl]);

  // Subtitle support
  const savedSubtitle = useMemo(() => {
    const watchProgressItem = state.user.continueWatching.find(
      item =>
        item.contentId === contentId &&
        item.contentType === contentType &&
        (contentType === 'movie' || (item.season === season && item.episode === episode))
    );
    return watchProgressItem?.selectedSubtitle || null;
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

  // Update progress bar animation
  useEffect(() => {
    if (duration > 0) {
      progressWidth.value = withTiming((currentTime / duration) * 100, { duration: 250 });
    }
  }, [currentTime, duration, progressWidth]);

  // Show/hide controls animation
  useEffect(() => {
    controlsOpacity.value = withTiming(showControls ? 1 : 0, { duration: 200 });
  }, [showControls, controlsOpacity]);

  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControls(true);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, CONTROLS_HIDE_DELAY);
    }
  }, [isPlaying]);

  // Seekbar pan responder for TV scrolling
  const tvSeekPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt: GestureResponderEvent) => {
      setIsSeeking(true);
      resetControlsTimer();
      if (seekBarRef.current) {
        seekBarRef.current.measure((_x, _y, width, _height, pageX) => {
          const relX = evt.nativeEvent.pageX - pageX;
          const percent = Math.max(0, Math.min(relX / width, 1));
          const newTime = percent * duration;
          videoRef.current?.seek(newTime);
          setCurrentTime(newTime);
          onPlaybackProgress(newTime);
        });
      }
    },
    onPanResponderMove: (evt: GestureResponderEvent) => {
      if (seekBarRef.current) {
        seekBarRef.current.measure((_x, _y, width, _height, pageX) => {
          const relX = evt.nativeEvent.pageX - pageX;
          const percent = Math.max(0, Math.min(relX / width, 1));
          const newTime = percent * duration;
          setCurrentTime(newTime);
        });
      }
    },
    onPanResponderRelease: (evt: GestureResponderEvent) => {
      if (seekBarRef.current) {
        seekBarRef.current.measure((_x, _y, width, _height, pageX) => {
          const relX = evt.nativeEvent.pageX - pageX;
          const percent = Math.max(0, Math.min(relX / width, 1));
          const newTime = percent * duration;
          videoRef.current?.seek(newTime);
          setCurrentTime(newTime);
          onPlaybackProgress(newTime);
        });
      }
      setIsSeeking(false);
      resetControlsTimer();
    },
    onPanResponderTerminate: () => {
      setIsSeeking(false);
    },
  }), [duration, onPlaybackProgress, resetControlsTimer]);

  // Initial progress seek
  useEffect(() => {
    if (duration > 0 && initialProgress > 0 && !hasStartedFromProgress && videoRef.current) {
      videoRef.current.seek(initialProgress);
      setCurrentTime(initialProgress);
      setHasStartedFromProgress(true);
    }
  }, [duration, initialProgress, hasStartedFromProgress]);

  // Save watch progress
  useEffect(() => {
    if (duration > 0 && currentTime > 10 && isPlaying) {
      const progressPercent = (currentTime / duration) * 100;
      updateWatchProgress({
        contentId,
        contentType,
        progress: progressPercent,
        duration,
        lastWatched: new Date(),
        season,
        episode,
        selectedSubtitle: selectedSubtitle || undefined,
      });
    }
  }, [currentTime, duration, contentId, contentType, season, episode, selectedSubtitle, updateWatchProgress, isPlaying]);

  // Handle back press
  useEffect(() => {
    const handleBackPress = () => {
      setIsPlaying(false);
      if (onBack) {
        onBack();
      } else if (navigation) {
        navigation.goBack();
      }
      return true;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => backHandler.remove();
  }, [navigation, onBack]);

  // Video event handlers
  const handleLoad = useCallback(({ duration: videoDuration }: { duration: number }) => {
    setDuration(videoDuration);
    setIsBuffering(false);
    // Auto-play once loaded
    setTimeout(() => {
      setIsPlaying(true);
      resetControlsTimer();
    }, 100);

  }, [resetControlsTimer]);

  useEffect(() => {
    resetControlsTimer();
  }, [isPlaying, resetControlsTimer]);

  const handleProgress = useCallback(({ currentTime: time, playableDuration }: { currentTime: number; playableDuration?: number }) => {
    setCurrentTime(time);
    if (typeof playableDuration === 'number' && Number.isFinite(playableDuration)) {
      setBufferedPosition(playableDuration);
    }
    onPlaybackProgress(time);
  }, [onPlaybackProgress]);

  const handleBuffer = useCallback(({ isBuffering: buffering }: { isBuffering: boolean }) => {
    setIsBuffering(buffering);
  }, []);

  const handleEnd = useCallback(() => {
    setIsPlaying(false);
    onPlaybackEnd();
    if (onEnd) {
      onEnd();
    }
  }, [onEnd, onPlaybackEnd]);

  const handleError = useCallback((error: any) => {
    // Don't log errors for empty URLs
    if (!videoUrl || videoUrl.trim() === '') {
      return;
    }
    const errorMessage = error?.error?.errorString || error?.error?.message || error?.error || 'Unknown error';
    console.error('[TVMediaPlayer] Video error:', errorMessage);
    
    // Check if this is an initialization error - URL might be invalid
    if (typeof errorMessage === 'string' && errorMessage.includes('initialize')) {
      setUrlError('Failed to load video - the source may be unavailable');
      setIsValidUrl(false);
    }
    
    setIsBuffering(false);
  }, [videoUrl]);

  const handleSeek = useCallback((offset: number) => {
    if (videoRef.current && duration > 0) {
      const newTime = Math.max(0, Math.min(currentTime + offset, duration));
      videoRef.current.seek(newTime);
      setCurrentTime(newTime);
      onPlaybackProgress(newTime);
      resetControlsTimer();
    }
  }, [currentTime, duration, onPlaybackProgress, resetControlsTimer]);

  // TV Remote Control Support
  useTVRemote(
    {
      onPlayPause: useCallback(() => {
        setIsPlaying(prev => !prev);
        resetControlsTimer();
      }, [resetControlsTimer]),
      onSelect: useCallback(() => {
        setIsPlaying(prev => !prev);
        resetControlsTimer();
      }, [resetControlsTimer]),
      onLeft: useCallback(() => {
        if (videoRef.current && duration > 0) {
          const newTime = Math.max(0, currentTime - SEEK_AMOUNT);
          videoRef.current.seek(newTime);
          setCurrentTime(newTime);
          onPlaybackProgress(newTime);
          resetControlsTimer();
        }
      }, [currentTime, duration, onPlaybackProgress, resetControlsTimer]),
      onRight: useCallback(() => {
        if (videoRef.current && duration > 0) {
          const newTime = Math.min(duration, currentTime + SEEK_AMOUNT);
          videoRef.current.seek(newTime);
          setCurrentTime(newTime);
          onPlaybackProgress(newTime);
          resetControlsTimer();
        }
      }, [currentTime, duration, onPlaybackProgress, resetControlsTimer]),
      onRewind: useCallback(() => {
        if (videoRef.current && duration > 0) {
          const newTime = Math.max(0, currentTime - SEEK_AMOUNT_LARGE);
          videoRef.current.seek(newTime);
          setCurrentTime(newTime);
          onPlaybackProgress(newTime);
          resetControlsTimer();
        }
      }, [currentTime, duration, onPlaybackProgress, resetControlsTimer]),
      onFastForward: useCallback(() => {
        if (videoRef.current && duration > 0) {
          const newTime = Math.min(duration, currentTime + SEEK_AMOUNT_LARGE);
          videoRef.current.seek(newTime);
          setCurrentTime(newTime);
          onPlaybackProgress(newTime);
          resetControlsTimer();
        }
      }, [currentTime, duration, onPlaybackProgress, resetControlsTimer]),
      onBack: useCallback(() => {
        setIsPlaying(false);
        if (onBack) {
          onBack();
        } else if (navigation) {
          navigation.goBack();
        }
      }, [onBack, navigation]),
    },
    Platform.isTV && !!videoUrl,
  );

  const togglePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev);
    resetControlsTimer();
  }, [resetControlsTimer]);

  const handleSubtitleSelect = useCallback((subtitle: SubtitleTrack | null) => {
    setSelectedSubtitle(subtitle);
    setShowSubtitleSelector(false);
    resetControlsTimer();
  }, [setSelectedSubtitle, resetControlsTimer]);

  const handleGoBack = useCallback(() => {
    setIsPlaying(false);
    if (onBack) {
      onBack();
    } else if (navigation) {
      navigation.goBack();
    }
  }, [onBack, navigation]);

  // Download and process subtitles
  useEffect(() => {
    if (!selectedSubtitle) {
      setSubtitleContent(null);
      setSubtitleVttPath(null);
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
        const srtFilename = `${sanitizedTitle}_${selectedSubtitle.language}.srt`;
        const vttFilename = `${sanitizedTitle}_${selectedSubtitle.language}.vtt`;
        const srtPath = `${subtitlesDir}/${srtFilename}`;
        const vttPath = `${subtitlesDir}/${vttFilename}`;

        let srtContent: string;
        const srtExists = await RNFS.exists(srtPath);
        
        if (srtExists) {
          srtContent = await RNFS.readFile(srtPath, 'utf8');
        } else {
          const response = await fetch(selectedSubtitle.url);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          srtContent = await response.text();
          await RNFS.writeFile(srtPath, srtContent, 'utf8');
        }
        
        setSubtitleContent(srtContent);
        
        const vttExists = await RNFS.exists(vttPath);
        if (!vttExists) {
          const vttContent = convertSrtToVtt(srtContent);
          await RNFS.writeFile(vttPath, vttContent, 'utf8');
        }
        
        setSubtitleVttPath(`file://${vttPath}`);
        
      } catch {
        setSubtitleContent(null);
        setSubtitleVttPath(null);
      }
    };

    downloadAndSaveSubtitle();
  }, [selectedSubtitle, contentId, season, episode]);

  // Text tracks for video
  const textTracks = useMemo(() => {
    if (!subtitleVttPath || !selectedSubtitle) return undefined;
    
    return [{
      title: selectedSubtitle.title || 'Subtitles',
      language: (selectedSubtitle.language || 'en') as any,
      type: TextTrackType.VTT,
      uri: subtitleVttPath,
    }];
  }, [subtitleVttPath, selectedSubtitle]);

  const selectedTextTrack = useMemo(() => {
    if (!subtitleVttPath || !selectedSubtitle) {
      return { type: SelectedTrackType.DISABLED };
    }
    return {
      type: SelectedTrackType.LANGUAGE,
      value: selectedSubtitle.language || 'en',
    };
  }, [subtitleVttPath, selectedSubtitle]);

  // Animated styles
  const controlsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const bufferLinePct = useMemo(() => {
    if (duration <= 0) return 0;
    const bufferedPct = bufferedPosition / duration;
    const cachedPct = cacheStatus.isActive
      ? Math.min((currentTime + cacheStatus.cachedSecondsAhead) / duration, 1)
      : 0;
    return Math.max(bufferedPct, cachedPct);
  }, [bufferedPosition, cacheStatus.cachedSecondsAhead, cacheStatus.isActive, currentTime, duration]);

  // Control buttons for TV
  const controlButtons = [
    { key: 'back', icon: 'arrow-left', label: 'Back', onPress: handleGoBack },
    { key: 'rewind', icon: 'rewind-30', label: '-30s', onPress: () => handleSeek(-SEEK_AMOUNT_LARGE) },
    { key: 'seekBack', icon: 'rewind-10', label: '-10s', onPress: () => handleSeek(-SEEK_AMOUNT) },
    { key: 'play', icon: isPlaying ? 'pause' : 'play', label: isPlaying ? 'Pause' : 'Play', onPress: togglePlayPause },
    { key: 'seekForward', icon: 'fast-forward-10', label: '+10s', onPress: () => handleSeek(SEEK_AMOUNT) },
    { key: 'fastForward', icon: 'fast-forward-30', label: '+30s', onPress: () => handleSeek(SEEK_AMOUNT_LARGE) },
    { key: 'subtitles', icon: 'subtitles', label: 'Subtitles', onPress: () => setShowSubtitleSelector(true) },
  ];

  // Show error state
  if (urlError || !videoUrl) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Icon name="alert-circle-outline" size={64} color="#E50914" />
          <Text style={styles.errorText}>{urlError || 'No video URL provided'}</Text>
          <TVButton
            title="Go Back"
            onPress={handleGoBack}
            variant="secondary"
            style={{ marginTop: 20 }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Video Player - only render when URL is valid and player is ready */}
      {isPlayerReady && isValidUrl && !isCacheLoading && playbackUrl ? (
        <Video
          ref={videoRef}
          source={playbackUrl.includes('.m3u8')
            ? {
                uri: playbackUrl,
                headers: VIDEO_STREAM_HEADERS,
                type: 'm3u8',
              }
            : {
                uri: playbackUrl,
                headers: playbackUrl.startsWith('file://') || playbackUrl.startsWith('/')
                  ? undefined
                  : VIDEO_STREAM_HEADERS,
              }
          }
          style={styles.video}
          onLoad={handleLoad}
          onProgress={handleProgress}
          onBuffer={handleBuffer}
          onEnd={handleEnd}
          onError={handleError}
          onReadyForDisplay={() => console.log('[TVMediaPlayer] Ready for display')}
          resizeMode="contain"
          controls={false}
          bufferingStrategy={BufferingStrategyType.DEPENDING_ON_MEMORY}
          repeat={false}
          muted={false}
          paused={!isPlaying}
          hideShutterView
          progressUpdateInterval={250}
          allowsExternalPlayback={false}
          textTracks={textTracks}
          selectedTextTrack={selectedTextTrack}
          subtitleStyle={TV_SUBTITLE_STYLE}
        />
      ) : (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E50914" />
          <Text style={styles.loadingText}>Preparing video...</Text>
        </View>
      )}

      {/* Touch area to show controls */}
      <Pressable style={styles.touchArea} onPress={resetControlsTimer} />

      {/* Buffering indicator */}
      {(isBuffering || isCacheLoading) && (
        <View style={styles.bufferingContainer}>
          <ActivityIndicator size="large" color={TV_FOCUS_COLOR} />
          <Text style={styles.bufferingText}>
            {isCacheLoading ? 'Buffering ahead…' : 'Loading...'}
          </Text>
        </View>
      )}

      {/* Controls overlay */}
      <Animated.View style={[styles.controlsOverlay, controlsAnimatedStyle]} pointerEvents={showControls ? 'auto' : 'none'}>
        {/* Top bar - Title */}
        <View style={styles.topBar}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>

        {/* Center controls */}
        <View style={styles.centerControls}>
          {controlButtons.map((button) => (
            <Pressable
              key={button.key}
              style={[
                styles.controlButton,
                focusedButton === button.key && styles.controlButtonFocused,
                button.key === 'play' && styles.playButton,
                button.key === 'play' && focusedButton === button.key && styles.playButtonFocused,
              ]}
              onPress={() => { button.onPress(); resetControlsTimer(); }}
              onFocus={() => { setFocusedButton(button.key); resetControlsTimer(); }}
              // @ts-ignore - TV prop
              hasTVPreferredFocus={button.key === 'play'}
            >
              <Icon
                name={button.icon}
                size={button.key === 'play' ? 48 : 32}
                color={focusedButton === button.key ? '#FFFFFF' : '#CCCCCC'}
              />
            </Pressable>
          ))}
        </View>

        {/* Bottom bar - Progress */}
        <View style={styles.bottomBar}>
          {/* Time display */}
          <Text style={styles.timeText}>{formatTime(isSeeking ? currentTime : currentTime)}</Text>

          {/* Progress bar - draggable seekbar */}
          <View
            style={styles.progressContainer}
            onLayout={(e) => setSeekBarWidth(e.nativeEvent.layout.width)}
          >
            <View
              ref={seekBarRef}
              style={styles.progressBackground}
              {...tvSeekPanResponder.panHandlers}
            >
              {bufferLinePct > 0 && (
                <View style={[styles.progressBuffered, { width: `${bufferLinePct * 100}%` }]} />
              )}
              <Animated.View style={[styles.progressFill, progressAnimatedStyle]} />
              {/* Seek thumb */}
              {seekBarWidth > 0 && (
                <View
                  style={[
                    styles.progressThumb,
                    {
                      left: Math.max(0, ((duration > 0 ? currentTime / duration : 0) * seekBarWidth) - 8),
                    },
                    isSeeking && styles.progressThumbActive,
                  ]}
                />
              )}
            </View>
          </View>

          {/* Duration */}
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>

        {/* Remote hints */}
        <View style={styles.hintsContainer}>
          <Text style={styles.hintText}>◀ ▶ Seek 10s  |  Select: Play/Pause  |  Back: Exit</Text>
        </View>
      </Animated.View>

      {/* Subtitle overlay */}
      <SubtitleOverlay
        subtitleContent={subtitleContent}
        currentTime={currentTime}
        isVideoFullscreen={true}
        delay={subtitleDelay}
        style={state.user.preferences.subtitleStyle || DEFAULT_SUBTITLE_STYLE}
      />

      {/* Subtitle selector */}
      <TVSubtitleSelector
        visible={showSubtitleSelector}
        onClose={() => setShowSubtitleSelector(false)}
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
    flex: 1,
    backgroundColor: '#000000',
  },
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  touchArea: {
    ...StyleSheet.absoluteFillObject,
  },
  bufferingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  bufferingText: {
    color: '#fff',
    marginTop: 12,
    fontSize: 16,
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'space-between',
  },
  topBar: {
    paddingHorizontal: 48,
    paddingTop: 32,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: 'bold',
  },
  centerControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
  },
  controlButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  controlButtonFocused: {
    borderColor: TV_FOCUS_COLOR,
    backgroundColor: 'rgba(229, 9, 20, 0.3)',
    transform: [{ scale: 1.1 }],
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  playButtonFocused: {
    backgroundColor: TV_FOCUS_COLOR,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 48,
    paddingBottom: 24,
    gap: 16,
  },
  timeText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '500',
    minWidth: 80,
  },
  progressContainer: {
    flex: 1,
    height: 8,
    justifyContent: 'center',
  },
  progressBackground: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 3,
    overflow: 'visible',
  },
  progressBuffered: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
    borderRadius: 3,
  },
  progressFill: {
    height: '100%',
    backgroundColor: TV_FOCUS_COLOR,
    borderRadius: 3,
    zIndex: 1,
  },
  progressThumb: {
    position: 'absolute',
    top: -5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: TV_FOCUS_COLOR,
    elevation: 3,
  },
  progressThumbActive: {
    transform: [{ scale: 1.4 }],
    backgroundColor: TV_FOCUS_COLOR,
  },
  hintsContainer: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 20,
    marginTop: 16,
    textAlign: 'center',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 18,
    marginTop: 16,
  },
});

export default TVMediaPlayer;