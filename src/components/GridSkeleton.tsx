import { useWindowDimensions } from 'react-native';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { SkeletonLine, SkeletonPoster } from '@/src/components/Skeleton';
import { useDeviceKind } from '@/src/hooks/useDeviceKind';
import {
  getGridColumns,
  getHorizontalPadding,
} from '@/src/utils/responsive';

interface GridSkeletonProps {
  /** How many placeholder rows to render. */
  rows?: number;
  /** Extra top padding when the grid sits under a header/input. */
  paddingTop?: number;
}

/**
 * Poster-grid placeholder matching `ContentCard` geometry, used by Search and
 * "View More" while the first page is in flight.
 */
export const GridSkeleton = ({ rows = 4, paddingTop = 0 }: GridSkeletonProps) => {
  const { width } = useWindowDimensions();
  const deviceKind = useDeviceKind();
  const columns = getGridColumns(deviceKind);
  const padding = getHorizontalPadding(deviceKind);
  const gap = 12;
  const cardWidth = (width - padding * 2 - gap * (columns - 1)) / columns;

  return (
    <VStack
      space="lg"
      style={{
        paddingHorizontal: padding,
        paddingTop,
        paddingBottom: 16,
      }}
    >
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <HStack key={rowIndex} space="md">
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <VStack key={columnIndex} space="xs">
              <SkeletonPoster width={cardWidth} />
              <SkeletonLine width={Math.round(cardWidth * 0.8)} />
            </VStack>
          ))}
        </HStack>
      ))}
    </VStack>
  );
};
