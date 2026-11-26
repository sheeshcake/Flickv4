import { useEffect } from 'react';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  makeMutable,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { POSTER_ASPECT_RATIO } from '@/src/utils/responsive';

/**
 * One shared pulse for every skeleton on screen.
 *
 * A loading screen can easily render 30+ placeholder blocks; giving each one
 * its own Reanimated animation would spin up 30 independent UI-thread loops.
 * A single module-level mutable drives all of them, so the cost stays flat no
 * matter how many blocks a layout has.
 */
const pulse = makeMutable(0.35);
let pulseStarted = false;
let mountedBoxes = 0;

const ensurePulse = () => {
  mountedBoxes += 1;
  if (pulseStarted) return;
  pulseStarted = true;
  pulse.value = withRepeat(
    withTiming(0.9, { duration: 850, easing: Easing.inOut(Easing.quad) }),
    -1,
    true,
  );
};

/**
 * Stops the loop once the last skeleton unmounts, so a loading screen doesn't
 * leave an infinite UI-thread animation running for the rest of the session.
 */
const releasePulse = () => {
  mountedBoxes = Math.max(0, mountedBoxes - 1);
  if (mountedBoxes > 0 || !pulseStarted) return;
  pulseStarted = false;
  cancelAnimation(pulse);
  pulse.value = 0.35;
};

/** Base fill for skeletons — sits one step above `card` on the black bg. */
const SKELETON_COLOR = '#2A2A2A';

interface SkeletonBoxProps {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** A single pulsing placeholder block. */
export const SkeletonBox = ({
  width = '100%',
  height = 16,
  radius = 8,
  style,
}: SkeletonBoxProps) => {
  useEffect(() => {
    ensurePulse();
    return releasePulse;
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: SKELETON_COLOR,
        },
        style,
        animatedStyle,
      ]}
    />
  );
};

/** Rounded pill placeholder, used for chips/filters. */
export const SkeletonPill = ({
  width = 84,
  height = 32,
}: {
  width?: DimensionValue;
  height?: number;
}) => <SkeletonBox width={width} height={height} radius={height / 2} />;

/** Text-line placeholder. */
export const SkeletonLine = ({
  width = '100%',
  height = 12,
}: {
  width?: DimensionValue;
  height?: number;
}) => <SkeletonBox width={width} height={height} radius={height / 2} />;

/**
 * Poster placeholder matching `ContentCard`'s geometry so a grid doesn't jump
 * when the real cards arrive.
 */
export const SkeletonPoster = ({ width }: { width: number }) => (
  <SkeletonBox
    width={width}
    height={Math.round(width * POSTER_ASPECT_RATIO)}
    radius={6}
  />
);
