import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import {
  SkeletonBox,
  SkeletonLine,
  SkeletonPill,
  SkeletonPoster,
} from '@/src/components/Skeleton';
import { useDeviceKind } from '@/src/hooks/useDeviceKind';
import { getCardWidth, getHorizontalPadding } from '@/src/utils/responsive';

/**
 * Full Home placeholder shown while the first feed wave loads.
 *
 * Mirrors the real layout (hero → browse chips → poster rows) so the screen
 * doesn't reflow when data lands, and so the app feels instant instead of
 * showing a lone spinner on a black screen.
 */
export const HomeSkeleton = () => {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const deviceKind = useDeviceKind();
  const padding = getHorizontalPadding(deviceKind);
  const cardWidth = getCardWidth(deviceKind, width);
  const gap = 12;
  const cardsPerRow = Math.max(
    3,
    Math.ceil((width - padding * 2 + gap) / (cardWidth + gap)),
  );

  const isLandscape = width > height;
  const heroHeight = isLandscape
    ? Math.min(height * 0.78, width * 0.52)
    : height * 0.6;

  return (
    <Box className="flex-1 bg-background">
      <SkeletonBox width={width} height={heroHeight} radius={0} />

      <VStack space="lg" style={{ paddingHorizontal: padding, paddingTop: 20 }}>
        <HStack space="sm">
          <SkeletonPill width={68} />
          <SkeletonPill width={92} />
          <SkeletonPill width={80} />
          <SkeletonPill width={64} />
        </HStack>

        {[0, 1].map((row) => (
          <VStack key={row} space="sm">
            <SkeletonLine width={148} height={18} />
            <HStack space="md">
              {Array.from({ length: cardsPerRow }).map((_, index) => (
                <VStack key={index} space="xs">
                  <SkeletonPoster width={cardWidth} />
                  <SkeletonLine width={Math.round(cardWidth * 0.75)} />
                </VStack>
              ))}
            </HStack>
          </VStack>
        ))}
      </VStack>

      <Box style={{ height: insets.bottom + 16 }} />
    </Box>
  );
};
