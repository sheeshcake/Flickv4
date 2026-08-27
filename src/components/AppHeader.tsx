import { HStack } from '@/components/ui/hstack';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { FlickLogo } from '@/src/components/FlickLogo';
import type { ReactNode } from 'react';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
// Display version from `APP_VERSION` in `.env` (via app.config → expoConfig).
import { getAppVersion } from '@/src/utils/appVersion';

interface AppHeaderProps {
  right?: ReactNode;
  paddingHorizontal?: number;
  /**
   * 0 → 1 scroll progress driving the sticky-header reveal: 0 while the
   * header still sits over unscrolled content (fully transparent, no
   * backdrop), 1 once the screen has scrolled past its fade distance (solid
   * backdrop + hairline border, logo slightly shrunk). Omit for a static,
   * always-transparent header (e.g. non-scrolling contexts).
   */
  progress?: SharedValue<number>;
  /**
   * Safe-area top inset (`useSafeAreaInsets().top`), applied as internal
   * padding rather than an external offset so the animated backdrop covers
   * the status bar strip too — otherwise that strip stays transparent while
   * the row below it turns solid, giving a visibly two-toned header.
   */
  topInset?: number;
}

const AnimatedBox = Animated.createAnimatedComponent(Box);
const AnimatedText = Animated.createAnimatedComponent(Text);

// Logo starts slightly oversized (1.3x) while unscrolled/over the hero, and
// settles to its natural size (1x) once fully scrolled — the version text's
// left padding scales by the same factor so its gap from the logo shrinks
// in proportion instead of looking fixed while everything around it moves.
const LOGO_SCALE_RANGE: [number, number] = [1.3, 1];
const VERSION_PADDING_LEFT_BASE = 0; // px, matches Tailwind's `pl-2`

export const AppHeader = ({
  right,
  paddingHorizontal = 16,
  progress,
  topInset = 0,
}: AppHeaderProps) => {
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress?.value ?? 0,
  }));

  const logoStyle = useAnimatedStyle(() => {
    const p = progress?.value ?? 0;
    const scale = interpolate(p, [0, 1], LOGO_SCALE_RANGE, Extrapolation.CLAMP);
    return {
      transform: [
        { scale },
        { translateY: interpolate(p, [0, 1], [0, -2], Extrapolation.CLAMP) },
      ],
    };
  });

  const versionStyle = useAnimatedStyle(() => {
    const p = progress?.value ?? 0;
    const scale = interpolate(p, [0, 1], LOGO_SCALE_RANGE, Extrapolation.CLAMP);
    return {
      paddingLeft: VERSION_PADDING_LEFT_BASE + (scale - 1) * 10,
    };
  });

  return (
    <Box className="relative" style={{ paddingTop: topInset }}>
      <AnimatedBox
        className="absolute inset-0 border-b border-border bg-background"
        style={backdropStyle}
        pointerEvents="none"
      />
      <HStack
        className="items-center space-between pt-3 pb-1"
        style={{ paddingHorizontal }}
      >
        <Animated.View style={[{ width: 64, height: 32 }, logoStyle]}>
          <FlickLogo width={64} height={32} />
        </Animated.View>
        <HStack space="sm" className="items-center">
          <AnimatedText
            size="xs"
            className="text-muted-foreground"
            style={versionStyle}
          >
            v{getAppVersion()}
          </AnimatedText>
          <Box>{right}</Box>
        </HStack>
      </HStack>
    </Box>
  );
};
