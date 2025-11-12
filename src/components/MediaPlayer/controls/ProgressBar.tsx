import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, PanResponder, View } from 'react-native';
import { styles } from './styles';
import { ProgressBarProps } from './types';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/**
 * Optimized ProgressBar Component
 * Features:
 * - Better performance with refs to avoid unnecessary renders
 * - Smoother dragging with optimized pan responder
 * - Accurate progress tracking
 */
const ProgressBarComponent: React.FC<ProgressBarProps> = ({
  currentPosition,
  duration,
  bufferedPosition = 0,
  hidden,
  onSeek,
  onTimePreview,
  onSeekingStateChange,
}) => {
  const [trackWidth, setTrackWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPercentage, setDragPercentage] = useState(0);
  const dragPercentageRef = useRef(0);

  // Calculate progress percentage
  const progressPercentage = useMemo(() => {
    if (!duration || duration === 0) return 0;
    return clamp(currentPosition / duration, 0, 1);
  }, [currentPosition, duration]);

  // Calculate buffered percentage
  const bufferedPercentage = useMemo(() => {
    if (!duration || duration === 0) return 0;
    return clamp(bufferedPosition / duration, 0, 1);
  }, [bufferedPosition, duration]);

  // Sync drag percentage with actual progress when not dragging
  useEffect(() => {
    if (!isDragging) {
      dragPercentageRef.current = progressPercentage;
      setDragPercentage(progressPercentage);
    }
  }, [isDragging, progressPercentage]);

  // Update position from touch location
  const updateFromLocation = useCallback((locationX: number) => {
    if (!trackWidth || !duration) return;

    const percentage = clamp(locationX / trackWidth, 0, 1);
    dragPercentageRef.current = percentage;
    setDragPercentage(percentage);
    
    const newTime = percentage * duration;
    onTimePreview(newTime);
  }, [duration, onTimePreview, trackWidth]);

  // Commit seek when drag ends
  const commitSeek = useCallback(() => {
    if (!duration) return;

    const newTime = clamp(dragPercentageRef.current * duration, 0, duration);
    onSeek(newTime);
    setDragPercentage(dragPercentageRef.current);
  }, [duration, onSeek]);

  // Pan responder for touch handling
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      setIsDragging(true);
      onSeekingStateChange(true);
      updateFromLocation(evt.nativeEvent.locationX);
    },
    onPanResponderMove: (evt) => {
      updateFromLocation(evt.nativeEvent.locationX);
    },
    onPanResponderRelease: () => {
      commitSeek();
      setIsDragging(false);
      onSeekingStateChange(false);
    },
    onPanResponderTerminate: () => {
      commitSeek();
      setIsDragging(false);
      onSeekingStateChange(false);
    },
  }), [commitSeek, onSeekingStateChange, updateFromLocation]);

  // Track width measurement
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  }, []);

  // Display percentage (use drag when dragging, otherwise use actual progress)
  const displayPercentage = isDragging ? dragPercentage : progressPercentage;

  // Memoized styles for performance
  const bufferedStyle = useMemo(() => ({
    width: bufferedPercentage * trackWidth,
  }), [bufferedPercentage, trackWidth]);

  const progressStyle = useMemo(() => ({
    width: displayPercentage * trackWidth,
  }), [displayPercentage, trackWidth]);

  const thumbStyle = useMemo(() => ({
    left: clamp(displayPercentage * trackWidth - 7, 0, trackWidth),
    opacity: isDragging ? 1 : 0.8,
    transform: [{ scale: isDragging ? 1.2 : 1 }],
  }), [displayPercentage, isDragging, trackWidth]);

  return (
    <View
      style={[styles.progressContainer, hidden ? styles.progressHidden : null]}
      pointerEvents={hidden ? 'none' : 'auto'}
      onLayout={handleLayout}
    >
      <View style={styles.progressTouchArea} {...panResponder.panHandlers}>
        <View style={styles.progressTrack}>
          <View style={styles.progressBackground} />
          {bufferedPercentage > 0 && <View style={[styles.progressBuffered, bufferedStyle]} />}
          <View style={[styles.progressForeground, progressStyle]} />
          <Animated.View style={[styles.progressThumb, thumbStyle]} />
        </View>
      </View>
    </View>
  );
};

export const ProgressBar = memo(ProgressBarComponent);

ProgressBar.displayName = 'ProgressBar';
