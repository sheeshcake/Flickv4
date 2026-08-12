import { useRef, useState } from 'react';
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  PanResponder,
  View,
} from 'react-native';
import type { Sun } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { Icon } from '@/components/ui/icon';
import { VStack } from '@/components/ui/vstack';

interface VerticalSliderProps {
  /** Current value in 0..1. */
  value: number;
  onChange: (value: number) => void;
  icon: typeof Sun;
}

/**
 * Thin vertical scrubber for in-player brightness/volume. Uses absolute
 * pageY + measured track geometry (same approach as `ProgressBar`) so
 * drags land accurately even when the finger is over the filled segment.
 */
export const VerticalSlider = ({
  value,
  onChange,
  icon,
}: VerticalSliderProps) => {
  const [height, setHeight] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);

  const trackRef = useRef<View>(null);
  const metricsRef = useRef({ top: 0, height: 0 });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  const valueFromPageY = (pageY: number) => {
    const { top, height: h } = metricsRef.current;
    if (h <= 0) return 0;
    // Top of the track = 1 (max), bottom = 0 (min).
    return clamp(1 - (pageY - top) / h);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        trackRef.current?.measureInWindow((_x, y, _w, h) => {
          if (h > 0) {
            metricsRef.current = { top: y, height: h };
            setHeight(h);
          }
          const v = valueFromPageY(evt.nativeEvent.pageY);
          setDragging(true);
          setDragValue(v);
          onChangeRef.current(v);
        });
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        const v = valueFromPageY(evt.nativeEvent.pageY);
        setDragValue(v);
        onChangeRef.current(v);
      },
      onPanResponderRelease: (evt: GestureResponderEvent) => {
        const v = valueFromPageY(evt.nativeEvent.pageY);
        setDragging(false);
        onChangeRef.current(v);
      },
      onPanResponderTerminate: (evt: GestureResponderEvent) => {
        const v = valueFromPageY(evt.nativeEvent.pageY);
        setDragging(false);
        onChangeRef.current(v);
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) {
      metricsRef.current = { ...metricsRef.current, height: h };
      setHeight(h);
    }
    trackRef.current?.measureInWindow((_x, y, _w, measuredH) => {
      if (measuredH > 0) {
        metricsRef.current = { top: y, height: measuredH };
        setHeight(measuredH);
      }
    });
  };

  const display = dragging ? dragValue : clamp(value);
  const fillHeight = display * height;

  return (
    <VStack space="sm" className="items-center">
      <Icon as={icon} size="md" className="text-foreground" />
      <View
        ref={trackRef}
        {...panResponder.panHandlers}
        onLayout={onLayout}
        hitSlop={{ left: 16, right: 16 }}
        style={{ height: 140, width: 28, justifyContent: 'center' }}
        collapsable={false}
      >
        <Box className="h-full w-1 self-center rounded-full bg-muted-foreground/40">
          <Box
            className="absolute bottom-0 w-1 rounded-full bg-primary"
            style={{ height: fillHeight }}
            pointerEvents="none"
          />
          <Box
            className="absolute h-3.5 w-3.5 self-center rounded-full bg-primary"
            style={{
              bottom: Math.max(0, fillHeight - 7),
              left: -5,
            }}
            pointerEvents="none"
          />
        </Box>
      </View>
    </VStack>
  );
};
