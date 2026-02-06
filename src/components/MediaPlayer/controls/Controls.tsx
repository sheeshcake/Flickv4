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
  subtitleDelay = 0,
  onSubtitleDelayChange,
  onResetSubtitleDelay,
}) => {
  const navigation = useNavigation();
  const [timeLabel, setTimeLabel] = useState<string>(formatTime(0));
  const [status, setStatus] = useState<VideoStatus>(videoStatus as VideoStatus);
  const [loadingMessage, setLoadingMessage] = useState<string>('Loading...');
  const [isSeeking, setIsSeeking] = useState(false);
  
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isSeeking) {
      setTimeLabel(formatTime(currentPosition));
    }
  }, [currentPosition, isSeeking]);

  useEffect(() => {
    setStatus(videoStatus as VideoStatus);
  }, [videoStatus]);

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

  const handleSeekingStateChange = useCallback((isCurrentlySeeking: boolean) => {
    setIsSeeking(isCurrentlySeeking);
    onSeekingStateChange?.(isCurrentlySeeking);
  }, [onSeekingStateChange]);

  const handleTimePreview = useCallback((newTime: number) => {
    setTimeLabel(formatTime(newTime));
  }, []);

  const handleSeekOffset = useCallback((seconds: number) => {
    const newTime = Math.max(0, Math.min(currentPosition + seconds, duration));
    onSeek(newTime);
  }, [currentPosition, duration, onSeek]);

  const handleBackPress = useCallback(() => {
    if (fullscreen) {
      onFullscreen();
    } else {
      Orientation.lockToPortrait();
      setTimeout(() => Orientation.unlockAllOrientations(), 300);
      navigation.goBack();
    }
  }, [fullscreen, navigation, onFullscreen]);

  const handlePlayPause = useCallback(() => {
    if (playing) {
      onPause();
    } else {
      onPlay();
    }
  }, [onPause, onPlay, playing]);

  const containerDimensions = useMemo(() => ({
    width: fullscreen ? sizes.height : sizes.width,
    height: fullscreen ? sizes.width : sizes.height * 0.3,
  }), [fullscreen]);

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
        subtitleDelay={subtitleDelay}
        onSubtitleDelayChange={onSubtitleDelayChange}
        onResetSubtitleDelay={onResetSubtitleDelay}
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
