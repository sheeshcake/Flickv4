import React, { useState } from 'react';
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
  onResetTimer,
  subtitleDelay = 0,
  onSubtitleDelayChange,
  onResetSubtitleDelay,
}) => {
  const [showDelayControls, setShowDelayControls] = useState(false);

  const handleSubtitleLongPress = () => {
    if (hasSubtitles && onSubtitleDelayChange) {
      setShowDelayControls(!showDelayControls);
    }
  };

  const formatDelay = (delay: number) => {
    const sign = delay >= 0 ? '+' : '';
    return `${sign}${delay.toFixed(1)}s`;
  };

  return (
    <View
      style={[
        styles.bottomBar,
        fullscreen ? styles.bottomBarFullscreen : styles.bottomBarRegular,
        hidden ? styles.bottomBarHidden : styles.bottomBarVisible,
      ]}
    >
      <TouchableOpacity onPress={() => { onPlayPause(); onResetTimer?.(); }} style={styles.bottomPlayButton}>
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

      {/* Subtitle delay controls - shown when long-pressing subtitle button */}
      {showDelayControls && hasSubtitles && onSubtitleDelayChange && (
        <View style={styles.delayControlsContainer}>
          <TouchableOpacity 
            onPress={() => onSubtitleDelayChange(-0.5)} 
            style={styles.delayButton}
          >
            <MaterialCommunityIcon
              name="minus"
              size={sizes.width * 0.04}
              color={colors.white}
            />
          </TouchableOpacity>
          
          <TouchableOpacity 
            onPress={onResetSubtitleDelay}
            style={styles.delayValueButton}
          >
            <Text style={styles.delayText}>{formatDelay(subtitleDelay)}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            onPress={() => onSubtitleDelayChange(0.5)} 
            style={styles.delayButton}
          >
            <MaterialCommunityIcon
              name="plus"
              size={sizes.width * 0.04}
              color={colors.white}
            />
          </TouchableOpacity>
        </View>
      )}

      {onSubtitlePress && (
        <TouchableOpacity 
          onPress={() => { onSubtitlePress(); onResetTimer?.(); }} 
          onLongPress={handleSubtitleLongPress}
          delayLongPress={500}
          style={styles.subtitleButton}
        >
          <MaterialCommunityIcon
            name={showDelayControls ? 'timer-outline' : 'closed-caption'}
            size={sizes.width * 0.05}
            color={hasSubtitles ? colors.red : colors.white}
          />
        </TouchableOpacity>
      )}

      {fullscreen && (
        <TouchableOpacity onPress={() => { onResize(); onResetTimer?.(); }} style={styles.resizeButton}>
          <MaterialCommunityIcon
            name="magnify"
            size={sizes.width * 0.05}
            color={colors.white}
          />
        </TouchableOpacity>
      )}

      <TouchableOpacity onPress={() => { onFullscreen(); onResetTimer?.(); }} style={styles.fullscreenButton}>
        <MaterialIcon
          name={fullscreen ? 'fullscreen-exit' : 'fullscreen'}
          size={sizes.width * 0.06}
          color={colors.white}
        />
      </TouchableOpacity>
    </View>
  );
};
