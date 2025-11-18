import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import MaterialIcon from 'react-native-vector-icons/MaterialIcons';
import { colors, sizes } from '../../../constants/theme';
import { ProgressBar } from './ProgressBar';
import { BottomBarProps } from './types';
import { styles } from './styles';

export const BottomBar: React.FC<BottomBarProps> = ({
  playing,
  timeLabel,
  hidden,
  currentPosition,
  duration,
  bufferedPosition,
  hasSubtitles,
  fullscreen,
  onPlayPause,
  onSeek,
  onTimePreview,
  onSeekingStateChange,
  onSubtitlePress,
  onResize,
  onFullscreen,
}) => {
  return (
    <View
      style={[
        styles.bottomBar,
        fullscreen ? { paddingBottom: sizes.height * 0.01 } : {},
        hidden ? styles.bottomBarHidden : styles.bottomBarVisible,
      ]}
    >
      <TouchableOpacity onPress={onPlayPause} style={styles.bottomPlayButton}>
        <MaterialCommunityIcon
          name={playing ? 'pause' : 'play'}
          size={sizes.width * 0.05}
          color={colors.white}
        />
      </TouchableOpacity>

      <ProgressBar
        currentPosition={currentPosition}
        duration={duration}
        bufferedPosition={bufferedPosition}
        hidden={hidden}
        onSeek={onSeek}
        onTimePreview={onTimePreview}
        onSeekingStateChange={onSeekingStateChange}
      />

      <Text style={styles.timeText}>{timeLabel}</Text>

      {onSubtitlePress && (
        <TouchableOpacity onPress={onSubtitlePress} style={styles.subtitleButton}>
          <MaterialCommunityIcon
            name="closed-caption"
            size={sizes.width * 0.05}
            color={hasSubtitles ? colors.red : colors.white}
          />
        </TouchableOpacity>
      )}

      {fullscreen && (
        <TouchableOpacity onPress={onResize} style={styles.resizeButton}>
          <MaterialCommunityIcon
            name="magnify"
            size={sizes.width * 0.05}
            color={colors.white}
          />
        </TouchableOpacity>
      )}

      <TouchableOpacity onPress={onFullscreen} style={styles.fullscreenButton}>
        <MaterialIcon
          name={fullscreen ? 'fullscreen-exit' : 'fullscreen'}
          size={sizes.width * 0.06}
          color={colors.white}
        />
      </TouchableOpacity>
    </View>
  );
};
