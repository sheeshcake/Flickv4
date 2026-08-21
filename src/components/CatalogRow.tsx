import { ContentRow } from '@/src/components/ContentRow';
import { TopTenRow } from '@/src/components/TopTenRow';
import type { HomeRow } from '@/src/hooks/useHomeData';
import type { MediaItem } from '@/src/types';
import type { DeviceKind } from '@/src/utils/responsive';

interface CatalogRowProps {
  row: HomeRow;
  deviceKind: DeviceKind;
  screenWidth: number;
  onItemPress: (item: MediaItem) => void;
  onViewMore: () => void;
}

export const CatalogRow = ({
  row,
  deviceKind,
  screenWidth,
  onItemPress,
  onViewMore,
}: CatalogRowProps) =>
  row.variant === 'topTen' ? (
    <TopTenRow
      title={row.title}
      data={row.data}
      deviceKind={deviceKind}
      screenWidth={screenWidth}
      onItemPress={onItemPress}
      onViewMore={onViewMore}
    />
  ) : (
    <ContentRow
      title={row.title}
      data={row.data}
      deviceKind={deviceKind}
      screenWidth={screenWidth}
      onItemPress={onItemPress}
      onViewMore={onViewMore}
    />
  );
