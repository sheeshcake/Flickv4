import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Text, View, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Orientation from 'react-native-orientation-locker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, sizes } from '../../../constants/theme';
import { BottomBar } from './BottomBar';
import { CenterOverlay } from './CenterOverlay';
import { TopBar } from './TopBar';
import { styles } from './styles';
import {
  SEEK_INCREMENT_SECONDS,
  formatTime,
} from './utils';
import type { ControlsProps, VideoStatus } from './types';

const loadingMessagesModule = require('../../../constants/loadingmessage.js');
const loadingMessages: string[] = loadingMessagesModule?.default ?? [];

/**
 * Optimized Controls Component
 * Features:
 * - Better memoization to prevent unnecessary re-renders
 * - Improved auto-hide logic with proper cleanup
 * - Cleaner state management
 */
const ControlsComponent: React.FC<ControlsProps> = ({
  hide,
  title,
  readyNext,
  playing,
  currentPosition,
  duration,
  bufferedPosition = 0,
  fullscreen,
  onFullscreen,
  onResize,
  onSeek,
  videoStatus,
  onHide,
  onPause,
  onPlay,
  onNext,
  upperRightComponent,
  onSubtitlePress,
  hasSubtitles,
  onSeekingStateChange,
}) => {
  const navigation = useNavigation();
  const [timeLabel, setTimeLabel] = useState<string>(formatTime(0));
  const [status, setStatus] = useState<VideoStatus>(videoStatus as VideoStatus);
  const [loadingMessage, setLoadingMessage] = useState<string>('Loading...');
  const [isSeeking, setIsSeeking] = useState(false);
  
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update time label when not seeking
  useEffect(() => {
    if (!isSeeking) {
      setTimeLabel(formatTime(currentPosition));
    }
  }, [currentPosition, isSeeking]);

  // Update status
  useEffect(() => {
    setStatus(videoStatus as VideoStatus);
  }, [videoStatus]);

  // Loading message rotation
  useEffect(() => {
    if (videoStatus === 'loading' && loadingMessages.length > 0) {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }

      messageTimeoutRef.current = setTimeout(() => {
        const randomIndex = Math.floor(Math.random() * loadingMessages.length);
        setLoadingMessage(loadingMessages[randomIndex]);
      }, 3000);

      return () => {
        if (messageTimeoutRef.current) {
          clearTimeout(messageTimeoutRef.current);
        }
      };
    }
  }, [videoStatus]);

  // Handle seeking state changes
  const handleSeekingStateChange = useCallback((isCurrentlySeeking: boolean) => {
    setIsSeeking(isCurrentlySeeking);
    onSeekingStateChange?.(isCurrentlySeeking);
  }, [onSeekingStateChange]);

  // Auto-hide is now handled by the useControlsVisibility hook in MediaPlayer
  // This component no longer manages its own auto-hide timer

  // Time preview handler for progress bar
  const handleTimePreview = useCallback((newTime: number) => {
    setTimeLabel(formatTime(newTime));
  }, []);

  // Seek with offset
  const handleSeekOffset = useCallback((seconds: number) => {
    const newTime = Math.max(0, Math.min(currentPosition + seconds, duration));
    onSeek(newTime);
  }, [currentPosition, duration, onSeek]);

  // Back button handler
  const handleBackPress = useCallback(() => {
    Orientation.lockToPortrait();
    if (fullscreen) {
      onFullscreen();
    } else {
      navigation.goBack();
    }
  }, [fullscreen, navigation, onFullscreen]);

  // Play/Pause toggle
  const handlePlayPause = useCallback(() => {
    if (playing) {
      onPause();
    } else {
      onPlay();
    }
  }, [onPause, onPlay, playing]);

  // Memoize container dimensions
  const containerDimensions = useMemo(() => ({
    width: fullscreen ? sizes.height : sizes.width,
    height: fullscreen ? sizes.width : sizes.height * 0.3,
  }), [fullscreen]);

  // Memoize controls visibility
  const isControlsHidden = useMemo(() => hide && !isSeeking, [hide, isSeeking]);

  return (
    <View
      style={[
        styles.container,
        fullscreen ? styles.containerFullscreen : styles.containerRegular,
        containerDimensions,
      ]}
    >
      <TopBar
        fullscreen={fullscreen}
        hidden={isControlsHidden}
        title={title}
        onBackPress={handleBackPress}
        upperRightComponent={upperRightComponent}
      />

      <CenterOverlay
        status={status}
        loadingMessage={loadingMessage}
        playing={playing}
        hidden={isControlsHidden}
        seekIncrementSeconds={SEEK_INCREMENT_SECONDS}
        onPlayPause={handlePlayPause}
        onHide={onHide}
        onSeekBackward={() => handleSeekOffset(-SEEK_INCREMENT_SECONDS)}
        onSeekForward={() => handleSeekOffset(SEEK_INCREMENT_SECONDS)}
      />

      <BottomBar
        playing={playing}
        timeLabel={timeLabel}
        hidden={isControlsHidden}
        currentPosition={currentPosition}
        duration={duration}
        bufferedPosition={bufferedPosition}
        hasSubtitles={hasSubtitles}
        fullscreen={fullscreen}
        onPlayPause={handlePlayPause}
        onSeek={onSeek}
        onTimePreview={handleTimePreview}
        onSeekingStateChange={handleSeekingStateChange}
        onSubtitlePress={onSubtitlePress}
        onResize={onResize}
        onFullscreen={onFullscreen}
      />

      {readyNext && fullscreen && onNext && (
        <View
          style={[
            styles.nextEpisodeContainer,
            {
              left: sizes.height * 0.8,
              bottom: sizes.height - sizes.height * 0.94,
            },
          ]}
        >
          <TouchableOpacity style={styles.nextEpisodeButton} onPress={onNext}>
            <Icon
              name="fast-forward"
              size={sizes.width * 0.05}
              color={colors.black}
            />
            <Text
              style={[
                styles.nextEpisodeText,
                { fontSize: sizes.width * 0.04 },
              ]}
            >
              Next Episode
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

export const Controls = memo(ControlsComponent);

Controls.displayName = 'Controls';

export default Controls;
