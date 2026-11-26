import { memo, useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Image } from '@/components/ui/image';

export const LOGO_WIDTH_RATIO = 0.84;
export const LOGO_MAX_WIDTH = 360;
export const WORD_REVEAL_MS = 500;
export const TOTAL_MS = 850;

export const splashLogoSize = (windowWidth: number) => {
  const width = Math.min(windowWidth * LOGO_WIDTH_RATIO, LOGO_MAX_WIDTH);
  return { width, height: width };
};

interface FlickSwoopLogoProps {
  onDrawEnd: () => void;
}

export const FlickSwoopLogo = memo(function FlickSwoopLogo({
  onDrawEnd,
}: FlickSwoopLogoProps) {
  const { width: windowWidth } = useWindowDimensions();
  const size = splashLogoSize(windowWidth);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(
      1,
      { duration: TOTAL_MS, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(onDrawEnd)();
      },
    );
  }, [onDrawEnd, progress]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.92 + progress.value * 0.08 }],
  }));

  return (
    <Animated.View
      accessible
      accessibilityLabel="CoFFe House, Developer By Hamandi"
      pointerEvents="none"
      style={[size, logoStyle]}
    >
      <Image
        size="full"
        source={require('../../../assets/images/coffe-house-splash.png')}
        resizeMode="contain"
        accessibilityLabel="CoFFe House"
      />
    </Animated.View>
  );
});
