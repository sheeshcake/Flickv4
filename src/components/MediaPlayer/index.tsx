import React, { useEffect, useState, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import { View, BackHandler, Dimensions, StyleSheet, Text, ActivityIndicator } from 'react-native';
import Video, { BufferingStrategyType, TextTrackType, SelectedTrackType } from 'react-native-video';
import { CastButton } from 'react-native-google-cast';
import RNFS from 'react-native-fs';
import { COLORS } from '../../utils/constants';
import { useAppState } from '../../hooks/useAppState';
import { usePlaybackCache } from '../../hooks/usePlaybackCache';
import { SubtitleTrack, DEFAULT_SUBTITLE_STYLE } from '../../types';
import { VIDEO_STREAM_HEADERS } from '../../utils/streamHeaders';
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

const RESIZE_MODES = ['contain', 'cover', 'stretch', 'none'] as const;
const NEXT_EPISODE_THRESHOLD = 150;

const convertSrtToVtt = (srtContent: string): string => {
  // Add VTT header
  let vttContent = 'WEBVTT\n\n';
  
  // Split by double newline to get subtitle blocks
  const blocks = srtContent.trim().split(/\r?\n\r?\n/);
  
  for (const block of blocks) {
    const lines = block.trim().split(/\r?\n/);
    if (lines.length < 2) continue;
    
    // Find the timestamp line (contains -->)
    const timestampIndex = lines.findIndex(line => line.includes('-->'));
    if (timestampIndex === -1) continue;
    
    // Convert SRT timestamps (00:00:01,000) to VTT format (00:00:01.000)
    const timestampLine = lines[timestampIndex].replace(/,/g, '.');
    const textLines = lines.slice(timestampIndex + 1);
    
    if (textLines.length > 0) {
      vttContent += `${timestampLine}\n${textLines.join('\n')}\n\n`;
    }
  }
  
  return vttContent;
};

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
  fullscreen?: boolean;
  setFullscreen?: (fullscreen: boolean) => void;
}

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
  fullscreen,
  setFullscreen,
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

  const [subtitleContent, setSubtitleContent] = useState<string | null>(null);
  const [subtitleVttPath, setSubtitleVttPath] = useState<string | null>(null);
  const [isPipActive, setIsPipActive] = useState(false);
  const [subtitleDelay, setSubtitleDelay] = useState(0);

  const videoRef = useRef<any>(null);
  const videoUrlRef = useRef<string>(videoUrl);
  const prevFullscreenPropRef = useRef<boolean | undefined>(fullscreen);
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

  useEffect(() => {
    videoUrlRef.current = videoUrl;
  }, [videoUrl]);

  const { isFullscreen, toggleFullscreen } = useFullscreen((val) => {
    if (setFullscreen) setFullscreen(val);
    if (onFullscreenChange) onFullscreenChange(val);
  }, fullscreen);

  useLayoutEffect(() => {
    if (typeof fullscreen === 'boolean' && fullscreen !== prevFullscreenPropRef.current && fullscreen !== isFullscreen) {
      toggleFullscreen();
    }
    prevFullscreenPropRef.current = fullscreen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen]);

  const { controlsVisible, toggleControls, showControls } = useControlsVisibility(isPlaying, isSeeking);

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

  useEffect(() => {
    if (contentType === 'tv' && duration > 0) {
      const timeRemaining = duration - currentTime;
      setIsReadyForNext(timeRemaining < NEXT_EPISODE_THRESHOLD);
    }
  }, [contentType, duration, currentTime]);

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
    onPlaybackProgress(time);
  }, [onPlaybackProgress]);

  const handleEnd = useCallback(() => {
    onPlaybackEnd();
    onNext?.();
  }, [onPlaybackEnd, onNext]);

  const handleBuffer = useCallback(({ isBuffering: buffering }: { isBuffering: boolean }) => {
    setIsBuffering(buffering);
    setVideoStatus(buffering ? 'loading' : 'loaded');
  }, []);

  const handleError = useCallback((_error: any) => {
    const currentUrl = videoUrlRef.current;
    if (!currentUrl || currentUrl.trim() === '') {
      return;
    }
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

  const handlePictureInPictureStatusChanged = useCallback((data: { isActive: boolean }) => {
    setIsPipActive(data.isActive);
  }, []);

  const handleSubtitleDelayChange = useCallback((delta: number) => {
    setSubtitleDelay(prev => {
      const newDelay = Math.round((prev + delta) * 10) / 10;
      return newDelay;
    });
  }, []);

  const handleResetSubtitleDelay = useCallback(() => {
    setSubtitleDelay(0);
  }, []);

  const videoSource = useMemo(() => {
    const uri = playbackUrl;
    const isCached = uri.startsWith('file://');
    return {
      uri,
      textTracks,
      ...(isCached ? {} : { headers: VIDEO_STREAM_HEADERS }),
    };
  }, [playbackUrl, textTracks]);

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
      {isCacheLoading && (
        <View style={styles.cacheLoadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.NETFLIX_RED} />
          <Text style={styles.cacheLoadingText}>Buffering ahead…</Text>
        </View>
      )}
      {playbackUrl && typeof playbackUrl === 'string' && playbackUrl.trim() !== '' ? (
        <Video
          ref={videoRef}
          source={videoSource}
          style={videoStyle}
          onLoad={handleLoad}
          onProgress={handleProgress}
          onBuffer={handleBuffer}
          onError={handleError}
          onEnd={handleEnd}
          onPictureInPictureStatusChanged={handlePictureInPictureStatusChanged}
          resizeMode={RESIZE_MODES[resizeMode]}
          poster={imageUrl}
          controls={false}
          bufferingStrategy={BufferingStrategyType.DEPENDING_ON_MEMORY}
          repeat={false}
          muted={false}
          paused={!isPlaying}
          hideShutterView
          enterPictureInPictureOnLeave={state.user.preferences.pictureInPicture}
          progressUpdateInterval={250}
          allowsExternalPlayback={false}
          // Native subtitle support for PiP mode
          textTracks={textTracks}
          selectedTextTrack={selectedTextTrack}
          subtitleStyle={{
            fontSize: 16,
            paddingBottom: 20,
            opacity: 1,
          }}
        />
      ) : (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>No valid video URL provided.</Text>
        </View>
      )}

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
        onResetTimer={showControls}
        subtitleDelay={subtitleDelay}
        onSubtitleDelayChange={handleSubtitleDelayChange}
        onResetSubtitleDelay={handleResetSubtitleDelay}
        cacheAheadSeconds={cacheStatus.isActive ? Math.round(cacheStatus.cachedSecondsAhead) : undefined}
        upperRightComponent={
          <View style={styles.castButtonContainer}>
            <CastButton style={styles.castButton} />
          </View>
        }
      />

      {!isPipActive && (
        <SubtitleOverlay
          subtitleContent={subtitleContent}
          currentTime={currentTime}
          isVideoFullscreen={isFullscreen}
          delay={subtitleDelay}
          style={state.user.preferences.subtitleStyle || DEFAULT_SUBTITLE_STYLE}
        />
      )}

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
    flex: 1,
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
  cacheLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  cacheLoadingText: {
    color: COLORS.NETFLIX_WHITE,
    marginTop: 12,
    fontSize: 14,
  },
});

export default React.memo(MediaPlayer);
