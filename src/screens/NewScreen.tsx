import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CalendarDays,
  Film,
  Flame,
  Sparkles,
  Tv,
  type LucideIcon,
} from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ContentRow } from '@/src/components/ContentRow';
import { ErrorState } from '@/src/components/ErrorState';
import { Focusable } from '@/src/components/Focusable';
import { TopTenRow } from '@/src/components/TopTenRow';
import { UpcomingCard } from '@/src/components/UpcomingCard';
import { useCatalogRegion } from '@/src/hooks/useCatalogRegion';
import { useDeviceKind } from '@/src/hooks/useDeviceKind';
import type { RootStackParamList } from '@/src/navigation/types';
import { TMDBService } from '@/src/services/TMDBService';
import { tagMedia } from '@/src/services/categories';
import { getReleaseDate, type MediaItem } from '@/src/types';
import { getHorizontalPadding } from '@/src/utils/responsive';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const SECTIONS = [
  { key: 'coming', label: 'Coming Soon', icon: CalendarDays },
  { key: 'everyone', label: 'Everyone Watching', icon: Flame },
  { key: 'series', label: 'Top 10 Series', icon: Tv },
  { key: 'films', label: 'Top 10 Films', icon: Film },
] as const satisfies readonly {
  key: string;
  label: string;
  icon: LucideIcon;
}[];

type SectionKey = (typeof SECTIONS)[number]['key'];

interface NewFeed {
  comingSoon: MediaItem[];
  everyone: MediaItem[];
  topSeries: MediaItem[];
  topFilms: MediaItem[];
}

const EMPTY_FEED: NewFeed = {
  comingSoon: [],
  everyone: [],
  topSeries: [],
  topFilms: [],
};

const isoAfterDays = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
};

const dedupe = (items: MediaItem[]): MediaItem[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.media_type ?? ''}-${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const NewScreen = () => {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const deviceKind = useDeviceKind();
  const { region } = useCatalogRegion();

  const [feed, setFeed] = useState<NewFeed>(EMPTY_FEED);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>('coming');

  const scrollRef = useRef<ScrollView>(null);
  const offsetsRef = useRef<Partial<Record<SectionKey, number>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const tomorrow = isoAfterDays(1);
    const horizon = isoAfterDays(120);

    const [moviesPage1, moviesPage2, shows, trendingAll, trendingShows, trendingFilms] =
      await Promise.all([
        TMDBService.getUpcomingMovies(1, region).catch(() => null),
        TMDBService.getUpcomingMovies(2, region).catch(() => null),
        TMDBService.discoverUpcomingTV().catch(() => null),
        TMDBService.getTrendingAll().catch(() => null),
        TMDBService.getTrendingTVShows().catch(() => null),
        TMDBService.getTrendingMovies().catch(() => null),
      ]);

    const upcomingPool = dedupe([
      ...tagMedia(moviesPage1?.results ?? [], 'movie'),
      ...tagMedia(moviesPage2?.results ?? [], 'movie'),
      ...tagMedia(shows?.results ?? [], 'tv'),
    ]);

    const comingSoon = upcomingPool
      .filter((item) => {
        const date = getReleaseDate(item);
        if (!date || date < tomorrow || date > horizon) return false;
        return Boolean(item.backdrop_path || item.poster_path);
      })
      .sort((a, b) => (getReleaseDate(a) ?? '').localeCompare(getReleaseDate(b) ?? ''))
      .slice(0, 24);

    const everyone = dedupe(
      (trendingAll?.results ?? []).filter(
        (item) =>
          (item.media_type === 'movie' || item.media_type === 'tv') &&
          Boolean(item.backdrop_path),
      ),
    ).slice(0, 10);

    const next: NewFeed = {
      comingSoon,
      everyone,
      topSeries: tagMedia(trendingShows?.results ?? [], 'tv').slice(0, 10),
      topFilms: tagMedia(trendingFilms?.results ?? [], 'movie').slice(0, 10),
    };
    setFeed(next);

    const isEmpty = Object.values(next).every((items) => items.length === 0);
    if (isEmpty) setError(new Error('Unable to load the New feed.'));
    setLoading(false);
  }, [region]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSectionLayout = useCallback(
    (key: SectionKey) => (event: LayoutChangeEvent) => {
      offsetsRef.current[key] = event.nativeEvent.layout.y;
    },
    [],
  );

  const scrollToSection = useCallback((key: SectionKey) => {
    setActiveSection(key);
    const y = offsetsRef.current[key];
    if (y == null) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  }, []);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y + 96;
      let current: SectionKey = SECTIONS[0].key;
      for (const section of SECTIONS) {
        const offset = offsetsRef.current[section.key];
        if (offset != null && offset <= y) current = section.key;
      }
      setActiveSection((prev) => (prev === current ? prev : current));
    },
    [],
  );

  const openDetail = (item: MediaItem) => navigation.navigate('Detail', { item });
  const padding = getHorizontalPadding(deviceKind);

  return (
    <Box className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <HStack className="items-center px-4 py-3">
        <Icon as={Sparkles} size="xl" className="text-primary" />
        <Heading size="xl" bold className="ml-3 text-foreground">
          New
        </Heading>
      </HStack>

      <View className="mb-2">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: padding, gap: 8 }}
        >
          {SECTIONS.map((section) => {
            const active = activeSection === section.key;
            return (
              <Focusable
                key={section.key}
                onPress={() => scrollToSection(section.key)}
                className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${
                  active ? 'border-primary bg-primary/20' : 'border-border bg-card'
                }`}
                focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
              >
                <Icon
                  as={section.icon}
                  size="sm"
                  className={active ? 'text-primary' : 'text-muted-foreground'}
                />
                <Text
                  size="sm"
                  className={
                    active
                      ? 'font-semibold text-foreground'
                      : 'text-muted-foreground'
                  }
                >
                  {section.label}
                </Text>
              </Focusable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <VStack space="sm" className="px-4 py-10">
          <Text size="sm" className="text-muted-foreground">
            Loading new releases…
          </Text>
        </VStack>
      ) : error ? (
        <ErrorState
          title="New didn't load"
          error={error}
          onRetry={() => void load()}
          retrying={loading}
        />
      ) : (
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          <View onLayout={onSectionLayout('coming')}>
            <VStack space="md" className="mb-8" style={{ paddingHorizontal: padding }}>
              <Heading size={deviceKind === 'tv' ? '2xl' : 'lg'} className="text-foreground">
                Coming Soon
              </Heading>
              {feed.comingSoon.slice(0, 12).map((item) => (
                <UpcomingCard
                  key={`${item.media_type ?? ''}-${item.id}`}
                  item={item}
                  width={width}
                  onPress={openDetail}
                />
              ))}
              {!feed.comingSoon.length ? (
                <Text size="sm" className="text-muted-foreground">
                  No upcoming dates available right now.
                </Text>
              ) : null}
            </VStack>
          </View>

          <View onLayout={onSectionLayout('everyone')}>
            <ContentRow
              title="Everyone Watching"
              data={feed.everyone}
              deviceKind={deviceKind}
              screenWidth={width}
              onItemPress={openDetail}
              getCaption={getReleaseDate}
              onViewMore={() =>
                navigation.navigate('ViewMore', {
                  title: 'Everyone Watching',
                  query: { kind: 'trendingAll' },
                })
              }
            />
          </View>

          <View onLayout={onSectionLayout('series')}>
            <TopTenRow
              title="Top 10 Series"
              data={feed.topSeries}
              deviceKind={deviceKind}
              screenWidth={width}
              onItemPress={openDetail}
              onViewMore={() =>
                navigation.navigate('ViewMore', {
                  title: 'Top 10 Series',
                  query: { kind: 'trendingTv' },
                })
              }
            />
          </View>

          <View onLayout={onSectionLayout('films')}>
            <TopTenRow
              title="Top 10 Films"
              data={feed.topFilms}
              deviceKind={deviceKind}
              screenWidth={width}
              onItemPress={openDetail}
              onViewMore={() =>
                navigation.navigate('ViewMore', {
                  title: 'Top 10 Films',
                  query: { kind: 'trendingMovies' },
                })
              }
            />
          </View>

          <Box style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      )}
    </Box>
  );
};
