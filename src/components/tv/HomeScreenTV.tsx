import { useCallback, useState, type RefObject } from 'react';
import { type LayoutChangeEvent, ScrollView } from 'react-native';
import { Box } from '@/components/ui/box';
import { HeroCarousel } from '@/src/components/HeroCarousel';
import { HeroBannerTV } from '@/src/components/tv/HeroBannerTV';
import { ContentRow } from '@/src/components/ContentRow';
import type { TVSideNavHandle } from '@/src/components/tv/TVSideNav';
import type { HomeRow } from '@/src/hooks/useHomeData';
import type { MediaItem } from '@/src/types';

interface HomeScreenTVProps {
  hero: MediaItem[];
  rows: HomeRow[];
  continueItems: MediaItem[];
  myList: MediaItem[];
  isInList: (item: MediaItem) => boolean;
  onPlay: (item: MediaItem) => void;
  onToggleList: (item: MediaItem) => void;
  onPress: (item: MediaItem) => void;
  getComingSoonLabel: (item: MediaItem) => string | undefined;
  onPlayContinue: (item: MediaItem) => void;
  getContinueProgress: (item: MediaItem) => number | undefined;
  getContinueCaption: (item: MediaItem) => string | undefined;
  onRemoveContinue: (item: MediaItem) => void;
  cwSelecting: boolean;
  setCwSelecting: (value: boolean) => void;
  myListSelecting: boolean;
  setMyListSelecting: (value: boolean) => void;
  onViewMore: (row: HomeRow) => void;
  /** Sidebar handle, forwarded down to `HeroBannerTV` for its Left hand-off. */
  sidebarRef?: RefObject<TVSideNavHandle | null>;
}

// 10-foot hero: since the TV shell puts the sidebar to the left of this pane
// (see TVNavigator), a taller hero reads as cinematic rather than cramped —
// there's no bottom tab bar eating vertical space like on phone.
const HERO_HEIGHT_RATIO = 0.78;

/**
 * TV-only Home layout. Reuses HomeScreen's data/handlers as-is (no invented
 * content) but is laid out for a 10-foot, remote-driven experience:
 * - Measures its own pane (via onLayout) instead of the raw window size,
 *   since the real content width is `window width - sidebar width`, and the
 *   sidebar's width now animates as it collapses/expands.
 * - No RefreshControl (pull-to-refresh needs a touch drag gesture that
 *   doesn't exist on a remote) and no floating AppHeader logo overlay
 *   (TVSideNav already shows the Flick wordmark).
 */
export const HomeScreenTV = ({
  hero,
  rows,
  continueItems,
  myList,
  isInList,
  onPlay,
  onToggleList,
  onPress,
  getComingSoonLabel,
  onPlayContinue,
  getContinueProgress,
  getContinueCaption,
  onRemoveContinue,
  cwSelecting,
  setCwSelecting,
  myListSelecting,
  setMyListSelecting,
  onViewMore,
  sidebarRef,
}: HomeScreenTVProps) => {
  const [paneSize, setPaneSize] = useState({ width: 0, height: 0 });

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setPaneSize((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height },
    );
  }, []);

  const ready = paneSize.width > 0 && paneSize.height > 0;
  const heroHeight = paneSize.height * HERO_HEIGHT_RATIO;

  return (
    <Box className="flex-1 bg-background" onLayout={onLayout}>
      {ready && (
        <ScrollView showsVerticalScrollIndicator={false}>
          <HeroCarousel
            items={hero}
            deviceKind="tv"
            height={heroHeight}
            width={paneSize.width}
            isInList={isInList}
            onPlay={onPlay}
            onToggleList={onToggleList}
            onPress={onPress}
            getComingSoonLabel={getComingSoonLabel}
            renderBanner={(item, common) => (
              <HeroBannerTV
                item={item}
                height={common.height}
                inMyList={common.inMyList}
                onPlay={common.onPlay}
                onToggleList={common.onToggleList}
                comingSoonLabel={common.comingSoonLabel}
                sidebarRef={sidebarRef}
              />
            )}
          />

          <Box className="mt-6">
            {continueItems.length > 0 && (
              <ContentRow
                title="Continue Watching"
                data={continueItems}
                deviceKind="tv"
                screenWidth={paneSize.width}
                onItemPress={onPlayContinue}
                getProgress={getContinueProgress}
                getCaption={getContinueCaption}
                selectionEnabled={cwSelecting}
                onEnterSelection={() => setCwSelecting(true)}
                onExitSelection={() => setCwSelecting(false)}
                onConfirmDelete={onRemoveContinue}
                confirmTitle="Remove from Continue Watching?"
              />
            )}

            {myList.length > 0 && (
              <ContentRow
                title="My List"
                data={myList}
                deviceKind="tv"
                screenWidth={paneSize.width}
                onItemPress={onPress}
                selectionEnabled={myListSelecting}
                onEnterSelection={() => setMyListSelecting(true)}
                onExitSelection={() => setMyListSelecting(false)}
                onConfirmDelete={onToggleList}
                confirmTitle="Remove from My List?"
              />
            )}

            {rows.map((row) => (
              <ContentRow
                key={row.title}
                title={row.title}
                data={row.data}
                deviceKind="tv"
                screenWidth={paneSize.width}
                onItemPress={onPress}
                onViewMore={() => onViewMore(row)}
              />
            ))}
          </Box>
          <Box className="h-10" />
        </ScrollView>
      )}
    </Box>
  );
};
