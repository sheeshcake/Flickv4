import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from 'react-native';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { HeroBanner } from '@/src/components/HeroBanner';
import type { MediaItem } from '@/src/types';
import type { DeviceKind } from '@/src/utils/responsive';

interface HeroCarouselProps {
  items: MediaItem[];
  deviceKind: DeviceKind;
  height: number;
  width: number;
  isInList: (item: MediaItem) => boolean;
  onPlay: (item: MediaItem) => void;
  onToggleList: (item: MediaItem) => void;
  onPress: (item: MediaItem) => void;
  /**
   * When set, returning a non-empty string for an item switches its hero
   * Play button to a "Coming {date}" stand-in. Home passes this in based
   * on `getReleaseDate(item)`.
   */
  getComingSoonLabel?: (item: MediaItem) => string | undefined;
}

const AUTO_ADVANCE_MS = 6000;

export const HeroCarousel = ({
  items,
  deviceKind,
  height,
  width,
  isInList,
  onPlay,
  onToggleList,
  onPress,
  getComingSoonLabel,
}: HeroCarouselProps) => {
  const listRef = useRef<FlatList<MediaItem>>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  indexRef.current = index;

  const scrollTo = useCallback(
    (next: number) => {
      if (!items.length) return;
      const clamped = ((next % items.length) + items.length) % items.length;
      listRef.current?.scrollToIndex({ index: clamped, animated: true });
      setIndex(clamped);
    },
    [items.length],
  );

  useEffect(() => {
    if (items.length < 2) return;
    const timer = setInterval(() => {
      scrollTo(indexRef.current + 1);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [items.length, scrollTo]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== index && next >= 0 && next < items.length) {
      setIndex(next);
    }
  };

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (first?.index != null) setIndex(first.index);
    },
  ).current;

  if (!items.length) return null;

  return (
    <Box style={{ height }} className="w-full">
      <FlatList
        ref={listRef}
        data={items}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => `hero-${item.media_type ?? 'm'}-${item.id}`}
        getItemLayout={(_data, i) => ({
          length: width,
          offset: width * i,
          index: i,
        })}
        onMomentumScrollEnd={onMomentumEnd}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item }) => (
          <Box style={{ width, height }}>
            <HeroBanner
              item={item}
              deviceKind={deviceKind}
              height={height}
              inMyList={isInList(item)}
              onPlay={onPlay}
              onToggleList={onToggleList}
              onPress={onPress}
              comingSoonLabel={getComingSoonLabel?.(item)}
            />
          </Box>
        )}
      />
      {items.length > 1 && (
        <HStack
          space="sm"
          className="absolute bottom-3 left-0 right-0 items-center justify-center"
          pointerEvents="none"
        >
          {items.map((item, i) => (
            <Box
              key={`dot-${item.id}-${i}`}
              className={
                i === index
                  ? 'h-1.5 w-4 rounded-full bg-primary'
                  : 'h-1.5 w-1.5 rounded-full bg-muted-foreground/60'
              }
            />
          ))}
        </HStack>
      )}
    </Box>
  );
};
