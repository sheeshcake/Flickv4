import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, PanResponder, View } from 'react-native';
import { styles } from './styles';
import { ProgressBarProps } from './types';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

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
  const trackRef = useRef<View>(null);

  const progressPercentage = useMemo(() => {
    if (!duration || duration === 0) return 0;
    return clamp(currentPosition / duration, 0, 1);
  }, [currentPosition, duration]);

  const bufferedPercentage = useMemo(() => {
    if (!duration || duration === 0) return 0;
    return clamp(bufferedPosition / duration, 0, 1);
  }, [bufferedPosition, duration]);

  useEffect(() => {
    if (!isDragging) {
      dragPercentageRef.current = progressPercentage;
      setDragPercentage(progressPercentage);
    }
  }, [isDragging, progressPercentage]);

  const updateFromLocation = useCallback((pageX: number) => {
    if (!trackWidth || !duration || !trackRef.current) return;

    // Measure the track position and calculate relative touch position
    trackRef.current.measure((_x, _y, width, _height, pageXOffset) => {
      const relativeX = pageX - pageXOffset;
      const clampedX = clamp(relativeX, 0, width);
      const percentage = clampedX / width;
      
      dragPercentageRef.current = percentage;
      setDragPercentage(percentage);
      
      const newTime = percentage * duration;
      onTimePreview(newTime);
    });
  }, [duration, onTimePreview, trackWidth]);

  const commitSeek = useCallback(() => {
    if (!duration) return;

    const newTime = dragPercentageRef.current * duration;
    onSeek(newTime);
  }, [duration, onSeek]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      setIsDragging(true);
      onSeekingStateChange(true);
      updateFromLocation(evt.nativeEvent.pageX);
    },
    onPanResponderMove: (evt) => {
      updateFromLocation(evt.nativeEvent.pageX);
    },
    onPanResponderRelease: () => {
      setIsDragging(false);
      onSeekingStateChange(false);
      commitSeek();
    },
    onPanResponderTerminate: () => {
      setIsDragging(false);
      onSeekingStateChange(false);
      commitSeek();
    },
  }), [commitSeek, onSeekingStateChange, updateFromLocation]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const displayPercentage = isDragging ? dragPercentage : progressPercentage;

  const bufferedStyle = useMemo(() => ({
    width: bufferedPercentage * trackWidth,
  }), [bufferedPercentage, trackWidth]);

  const progressStyle = useMemo(() => ({
    width: displayPercentage * trackWidth,
  }), [displayPercentage, trackWidth]);

  const thumbStyle = useMemo(() => ({
    left: Math.max(0, Math.min(displayPercentage * trackWidth - 7, trackWidth - 14)),
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
        <View ref={trackRef} style={styles.progressTrack}>
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
