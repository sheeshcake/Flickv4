import { useState, type RefObject } from 'react';
import { useWindowDimensions } from 'react-native';
import { RefreshControl } from 'react-native';
import Animated, {
  clamp,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Center } from '@/components/ui/center';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { AppHeader } from '@/src/components/AppHeader';
import { HeroCarousel } from '@/src/components/HeroCarousel';
import { ContentRow } from '@/src/components/ContentRow';
import { CatalogRow } from '@/src/components/CatalogRow';
import { BrowseChips } from '@/src/components/BrowseChips';
import { HomeScreenTV } from '@/src/components/tv/HomeScreenTV';
import type { TVSideNavHandle } from '@/src/components/tv/TVSideNav';
import { useHomeData } from '@/src/hooks/useHomeData';
import { useMyList } from '@/src/hooks/useMyList';
import { useContinueWatching } from '@/src/hooks/useContinueWatching';
import { useDeviceKind } from '@/src/hooks/useDeviceKind';
import { getReleaseDate, getTitle, type MediaItem } from '@/src/types';
import { getComingSoon } from '@/src/utils/comingSoon';
import type { RootStackParamList } from '@/src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Scroll distance (px) over which the sticky AppHeader fades from fully
 * transparent (over the hero) to a solid backdrop. */
const HEADER_FADE_DISTANCE = 140;

interface HomeScreenProps {
  /**
   * TV-only: ref to the sidebar rail, forwarded down to `HomeScreenTV`'s
   * hero so it can hand D-pad focus back to the sidebar on a dead-end
   * "Left" press. Undefined on phone/tablet (`TabNavigator` renders
   * `HomeScreen` with no props).
   */
  sidebarRef?: RefObject<TVSideNavHandle | null>;
}

export const HomeScreen = ({ sidebarRef }: HomeScreenProps = {}) => {
  const navigation = useNavigation<Nav>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const deviceKind = useDeviceKind();
  const { hero, rows, loading, error, refreshing, refresh } = useHomeData();
  const { items: myList, isInList, toggle } = useMyList();
  const { entries: continueWatching, remove: removeContinue } =
    useContinueWatching();

  // Row-scoped selection mode: long-pressing a card in "Continue Watching"
  // only affects that row (and same for "My List"). Users tap "Done" in the
  // header to exit selection mode without deleting anything.
  const [cwSelecting, setCwSelecting] = useState(false);
  const [myListSelecting, setMyListSelecting] = useState(false);

  // Drives the sticky AppHeader's fade-in backdrop + logo shrink as the hero
  // scrolls out of view — see AppHeader's `progress` prop.
  const headerProgress = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    headerProgress.value = clamp(
      event.contentOffset.y / HEADER_FADE_DISTANCE,
      0,
      1,
    );
  });

  const openDetail = (item: MediaItem) => navigation.navigate('Detail', { item });

  const play = (item: MediaItem, resumeFrom?: number) =>
    navigation.navigate('Player', {
      item,
      title: getTitle(item),
      resumeFrom,
    });

  const playContinue = (item: MediaItem) => {
    const entry = continueWatching.find(
      (e) =>
        e.item.id === item.id &&
        (e.item.media_type ?? 'movie') === (item.media_type ?? 'movie'),
    );
    // For TV, hand the Player the latest watched season/episode so it resumes
    // that exact episode. For movies, `entry.season`/`entry.episode` are
    // undefined and Player treats it as a movie source.
    navigation.navigate('Player', {
      item,
      title: getTitle(item),
      season: entry?.season,
      episode: entry?.episode,
      subtitle:
        entry?.season != null && entry?.episode != null
          ? `S${entry.season} E${entry.episode}`
          : undefined,
      resumeFrom: entry?.position,
    });
  };

  if (loading) {
    return (
      <Center className="flex-1 bg-background">
        <Spinner size="large" color="#E50914" />
      </Center>
    );
  }

  if (error && !rows.length) {
    return (
      <Center className="flex-1 bg-background px-8">
        <VStack space="lg" className="items-center">
          <Text className="text-center text-muted-foreground">{error}</Text>
          <Button variant="outline" onPress={refresh} isDisabled={refreshing}>
            <ButtonText>{refreshing ? 'Retrying…' : 'Try again'}</ButtonText>
          </Button>
        </VStack>
      </Center>
    );
  }

  const heroHeight = height * 0.6;
  const continueItems = continueWatching.map((e) => e.item);
  const findContinueEntry = (item: MediaItem) =>
    continueWatching.find(
      (e) =>
        e.item.id === item.id &&
        (e.item.media_type ?? 'movie') === (item.media_type ?? 'movie'),
    );
  const continueProgress = (item: MediaItem) => {
    const entry = findContinueEntry(item);
    if (!entry || entry.duration <= 0) return undefined;
    return entry.position / entry.duration;
  };
  const continueCaption = (item: MediaItem) => {
    if ((item.media_type ?? 'movie') !== 'tv') return undefined;
    const entry = findContinueEntry(item);
    if (!entry || entry.season == null || entry.episode == null) return undefined;
    return `S${entry.season} E${entry.episode}`;
  };

  // Trending / Popular endpoints only return `MediaItem` (no TMDB `status`)
  // so we detect "coming soon" purely from the release/first-air date here.
  // The Detail screen re-checks with `status` once details are fetched.
  const getHeroComingSoonLabel = (item: MediaItem): string | undefined => {
    const c = getComingSoon({ releaseDate: getReleaseDate(item) });
    return c.comingSoon ? c.label : undefined;
  };

  if (deviceKind === 'tv') {
    return (
      <HomeScreenTV
        hero={hero}
        rows={rows}
        continueItems={continueItems}
        myList={myList}
        isInList={isInList}
        onPlay={(item) => play(item)}
        onToggleList={toggle}
        onPress={openDetail}
        getComingSoonLabel={getHeroComingSoonLabel}
        onPlayContinue={playContinue}
        getContinueProgress={continueProgress}
        getContinueCaption={continueCaption}
        onRemoveContinue={removeContinue}
        cwSelecting={cwSelecting}
        setCwSelecting={setCwSelecting}
        myListSelecting={myListSelecting}
        setMyListSelecting={setMyListSelecting}
        onViewMore={(row) =>
          navigation.navigate('ViewMore', { title: row.title, query: row.query })
        }
        sidebarRef={sidebarRef}
      />
    );
  }

  return (
    <Box className="flex-1 bg-background">
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor="#E50914"
          />
        }
      >
        <Box className="relative">
          <HeroCarousel
            items={hero}
            deviceKind={deviceKind}
            height={heroHeight}
            width={width}
            isInList={isInList}
            onPlay={(item) => play(item)}
            onToggleList={toggle}
            onPress={openDetail}
            getComingSoonLabel={getHeroComingSoonLabel}
          />
        </Box>

        <Box className="mt-4">
          <BrowseChips
            deviceKind={deviceKind}
            onSelect={(title, query) =>
              navigation.navigate('ViewMore', { title, query })
            }
            onRegionPress={() => navigation.navigate('RegionSettings')}
          />

          {continueItems.length > 0 && (
            <ContentRow
              title="Continue Watching"
              data={continueItems}
              deviceKind={deviceKind}
              screenWidth={width}
              onItemPress={playContinue}
              getProgress={continueProgress}
              getCaption={continueCaption}
              selectionEnabled={cwSelecting}
              onEnterSelection={() => setCwSelecting(true)}
              onExitSelection={() => setCwSelecting(false)}
              onConfirmDelete={(item) => removeContinue(item)}
              confirmTitle="Remove from Continue Watching?"
            />
          )}

          {myList.length > 0 && (
            <ContentRow
              title="My List"
              data={myList}
              deviceKind={deviceKind}
              screenWidth={width}
              onItemPress={openDetail}
              selectionEnabled={myListSelecting}
              onEnterSelection={() => setMyListSelecting(true)}
              onExitSelection={() => setMyListSelecting(false)}
              onConfirmDelete={(item) => toggle(item)}
              confirmTitle="Remove from My List?"
            />
          )}

          {rows.map((row) => (
            <CatalogRow
              key={row.id}
              row={row}
              deviceKind={deviceKind}
              screenWidth={width}
              onItemPress={openDetail}
              onViewMore={() =>
                navigation.navigate('ViewMore', {
                  title: row.title,
                  query: row.query,
                })
              }
            />
          ))}
        </Box>
        <Box style={{ height: insets.bottom + 16 }} />
      </Animated.ScrollView>

      <Box className="absolute left-0 right-0 top-0" pointerEvents="box-none">
        <AppHeader
          paddingHorizontal={16}
          progress={headerProgress}
          topInset={insets.top}
        />
      </Box>
    </Box>
  );
};
