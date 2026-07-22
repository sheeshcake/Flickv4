import { useRef, useState } from 'react';
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  PanResponder,
  View,
} from 'react-native';
import { Box } from '@/components/ui/box';

interface ProgressBarProps {
  progress: number; // 0..1
  /** Buffered fraction 0..1 shown behind the played fill. */
  buffered?: number;
  onScrub: (value: number) => void;
  onScrubEnd: (value: number) => void;
}

/**
 * Netflix-style scrubber. Uses absolute pageX + measured bar geometry so
 * seeks land accurately even when the finger is over the filled track/knob.
 */
export const ProgressBar = ({
  progress,
  buffered = 0,
  onScrub,
  onScrubEnd,
}: ProgressBarProps) => {
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);

  const trackRef = useRef<View>(null);
  const metricsRef = useRef({ left: 0, width: 0 });
  const onScrubRef = useRef(onScrub);
  const onScrubEndRef = useRef(onScrubEnd);
  onScrubRef.current = onScrub;
  onScrubEndRef.current = onScrubEnd;

  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        trackRef.current?.measureInWindow((x, _y, w) => {
          if (w > 0) {
            metricsRef.current = { left: x, width: w };
            setWidth(w);
          }
          const { left, width: barW } = metricsRef.current;
          const v =
            barW > 0
              ? Math.min(1, Math.max(0, (evt.nativeEvent.pageX - left) / barW))
              : 0;
          setDragging(true);
          setDragValue(v);
          onScrubRef.current(v);
        });
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        const { left, width: barW } = metricsRef.current;
        if (barW <= 0) return;
        const v = Math.min(
          1,
          Math.max(0, (evt.nativeEvent.pageX - left) / barW),
        );
        setDragValue(v);
        onScrubRef.current(v);
      },
      onPanResponderRelease: (evt: GestureResponderEvent) => {
        const { left, width: barW } = metricsRef.current;
        const v =
          barW > 0
            ? Math.min(1, Math.max(0, (evt.nativeEvent.pageX - left) / barW))
            : 0;
        setDragging(false);
        onScrubEndRef.current(v);
      },
      onPanResponderTerminate: (evt: GestureResponderEvent) => {
        const { left, width: barW } = metricsRef.current;
        const v =
          barW > 0
            ? Math.min(1, Math.max(0, (evt.nativeEvent.pageX - left) / barW))
            : 0;
        setDragging(false);
        onScrubEndRef.current(v);
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) {
      metricsRef.current = { ...metricsRef.current, width: w };
      setWidth(w);
    }
    trackRef.current?.measureInWindow((x, _y, measuredW) => {
      if (measuredW > 0) {
        metricsRef.current = { left: x, width: measuredW };
        setWidth(measuredW);
      }
    });
  };

  const value = dragging ? dragValue : clamp(progress);
  const bufferedValue = clamp(buffered);

  return (
    <View
      ref={trackRef}
      {...panResponder.panHandlers}
      onLayout={onLayout}
      hitSlop={{ top: 16, bottom: 16 }}
      style={{ paddingVertical: 16 }}
      collapsable={false}
    >
      <Box className="h-1 w-full rounded-full bg-muted-foreground/40">
        {/* Netflix-style layering: base track (above) -> buffered -> played -> knob. */}
        <Box
          className="absolute h-1 rounded-full bg-muted-foreground/60"
          style={{ width: bufferedValue * width }}
          pointerEvents="none"
        />
        <Box
          className="h-1 rounded-full bg-primary"
          style={{ width: value * width }}
          pointerEvents="none"
        />
        <Box
          className="absolute h-3.5 w-3.5 rounded-full bg-primary"
          style={{ left: Math.max(0, value * width - 7), top: -5 }}
          pointerEvents="none"
        />
      </Box>
    </View>
  );
};
