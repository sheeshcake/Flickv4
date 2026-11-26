import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell,
  BellRing,
  CalendarDays,
  Clock3,
  Coffee,
  Film,
  Flame,
  Sparkles,
  Tv,
  X,
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
import { buildRecentlyAddedQuery } from '@/src/config/categoriesCatalog';
import { useCatalogRegion } from '@/src/hooks/useCatalogRegion';
import { useDeviceKind } from '@/src/hooks/useDeviceKind';
import { useReleaseReminders } from '@/src/hooks/useReleaseReminders';
import type { RootStackParamList } from '@/src/navigation/types';
import {
  removeReleaseReminder,
  type ReleaseReminder,
} from '@/src/services/ReleaseReminderService';
import { TMDBService } from '@/src/services/TMDBService';
import { sortByReleaseDateDesc, tagMedia } from '@/src/services/categories';
import { getReleaseDate, type MediaItem } from '@/src/types';
import { getHorizontalPadding } from '@/src/utils/responsive';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const SECTIONS = [
  { key: 'recent', label: 'Recently Added', icon: Clock3 },
  { key: 'coming', label: 'Coming Soon', icon: CalendarDays },
  { key: 'reminders', label: 'My Reminders', icon: Bell },
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
  recentlyAdded: MediaItem[];
  comingSoon: MediaItem[];
  everyone: MediaItem[];
  topSeries: MediaItem[];
  topFilms: MediaItem[];
}

const EMPTY_FEED: NewFeed = {
  recentlyAdded: [],
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

const reminderDateLabel = (reminder: ReleaseReminder): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(reminder.releaseDate);
  if (!match) return reminder.releaseDate;
  const months = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ];
  return `${Number(match[3])} ${months[Number(match[2]) - 1] ?? ''} ${match[1]}`;
};

interface SectionHeadingProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

const SectionHeading = ({
  icon: SectionIcon,
  title,
  subtitle,
  action,
}: SectionHeadingProps) => (
  <HStack className="mb-3 items-center justify-between">
    <HStack space="sm" className="items-center">
      <LinearGradient
        colors={['#D32F2F', '#7A1414']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: 32,
          height: 32,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 12,
        }}
      >
        <Icon as={SectionIcon} size="sm" className="text-primary-foreground" />
      </LinearGradient>
      <VStack>
        <Heading size="lg" bold className="text-foreground">
          {title}
        </Heading>
        {subtitle ? (
          <Text size="2xs" className="text-muted-foreground">
            {subtitle}
          </Text>
        ) : null}
      </VStack>
    </HStack>
    {action}
  </HStack>
);

export const NewScreen = () => {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const deviceKind = useDeviceKind();
  const { region } = useCatalogRegion();
  const { reminders } = useReleaseReminders();

  const [feed, setFeed] = useState<NewFeed>(EMPTY_FEED);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>('recent');

  const scrollRef = useRef<ScrollView>(null);
  const offsetsRef = useRef<Partial<Record<SectionKey, number>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const tomorrow = isoAfterDays(1);
    const horizon = isoAfterDays(120);

    const [
      moviesPage1,
      moviesPage2,
      shows,
      nowPlaying,
      recentShows,
      trendingAll,
      trendingShows,
      trendingFilms,
    ] = await Promise.all([
      TMDBService.getUpcomingMovies(1, region).catch(() => null),
      TMDBService.getUpcomingMovies(2, region).catch(() => null),
      TMDBService.discoverUpcomingTV().catch(() => null),
      TMDBService.getNowPlayingMovies(1, region).catch(() => null),
      TMDBService.discoverRecentlyAddedTV().catch(() => null),
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

    const recentlyAdded = sortByReleaseDateDesc(
      dedupe([
        ...tagMedia(nowPlaying?.results ?? [], 'movie'),
        ...tagMedia(recentShows?.results ?? [], 'tv'),
      ]),
    )
      .filter((item) => Boolean(getReleaseDate(item)))
      .slice(0, 20);

    const everyone = dedupe(
      (trendingAll?.results ?? []).filter(
        (item) =>
          (item.media_type === 'movie' || item.media_type === 'tv') &&
          Boolean(item.backdrop_path),
      ),
    ).slice(0, 10);

    const next: NewFeed = {
      recentlyAdded,
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
      const y = event.nativeEvent.contentOffset.y + 112;
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
  const contentWidth = width - padding * 2;

  return (
    <Box className="flex-1 bg-background">
      <LinearGradient
        colors={['#2A1A12', '#120C08', '#0C0907']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: insets.top }}
      >
        <HStack className="items-center px-4 py-4">
          <LinearGradient
            colors={['#D32F2F', '#7A1414']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: 44,
              height: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 16,
            }}
          >
            <Icon as={Coffee} size="lg" className="text-primary-foreground" />
          </LinearGradient>
          <VStack className="ml-3 flex-1">
            <Text size="2xs" bold className="text-primary">
              COFFE HOUSE
            </Text>
            <Heading size="2xl" bold className="text-foreground">
              New
            </Heading>
            <Text size="xs" className="text-muted-foreground">
              Fresh drops, trends & release alerts
            </Text>
          </VStack>
          <Icon as={Sparkles} size="lg" className="text-primary/80" />
        </HStack>
      </LinearGradient>

      <View className="mb-2 mt-3">
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
                  active
                    ? 'border-primary/60 bg-primary/20'
                    : 'border-border bg-card/70'
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
                  bold={active}
                  className={
                    active ? 'text-foreground' : 'text-muted-foreground'
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
            Brewing your new releases…
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
          <View onLayout={onSectionLayout('recent')}>
            <VStack
              space="md"
              className="mb-8"
              style={{ paddingHorizontal: padding }}
            >
              <SectionHeading
                icon={Clock3}
                title="Recently Added"
                subtitle="Fresh movies and series, newest first"
              />
              <ContentRow
                title=""
                data={feed.recentlyAdded}
                deviceKind={deviceKind}
                screenWidth={width}
                onItemPress={openDetail}
                getCaption={getReleaseDate}
                onViewMore={() =>
                  navigation.navigate('ViewMore', {
                    title: 'Recently Added',
                    query: buildRecentlyAddedQuery('mixed', region),
                  })
                }
              />
              {!feed.recentlyAdded.length ? (
                <Box className="rounded-2xl border border-dashed border-border bg-card/60 p-4">
                  <Text size="sm" className="text-muted-foreground">
                    No recent titles available right now.
                  </Text>
                </Box>
              ) : null}
            </VStack>
          </View>

          <View onLayout={onSectionLayout('coming')}>
            <VStack
              space="md"
              className="mb-8"
              style={{ paddingHorizontal: padding }}
            >
              <SectionHeading
                icon={CalendarDays}
                title="Coming Soon"
                subtitle="Set a local reminder for release day"
              />
              {feed.comingSoon.slice(0, 12).map((item) => (
                <UpcomingCard
                  key={`${item.media_type ?? ''}-${item.id}`}
                  item={item}
                  width={contentWidth}
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

          <View onLayout={onSectionLayout('reminders')}>
            <VStack
              space="sm"
              className="mb-8"
              style={{ paddingHorizontal: padding }}
            >
              <SectionHeading
                icon={BellRing}
                title="My Release Calendar"
                subtitle={`${reminders.length} local reminder${reminders.length === 1 ? '' : 's'} on this device`}
              />
              {reminders.length ? (
                reminders.map((reminder) => (
                  <Focusable
                    key={reminder.key}
                    onPress={() => void removeReleaseReminder(reminder.key)}
                    className="rounded-2xl border border-border/70 bg-card/80 px-3 py-3"
                    focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
                  >
                    <HStack className="items-center justify-between">
                      <HStack space="sm" className="flex-1 items-center">
                        <LinearGradient
                          colors={['#D32F2F', '#7A1414']}
                          style={{
                            width: 6,
                            height: 36,
                            borderRadius: 999,
                          }}
                        />
                        <VStack className="flex-1">
                          <Text bold className="text-foreground" numberOfLines={1}>
                            {reminder.title}
                          </Text>
                          <Text size="2xs" className="text-muted-foreground">
                            {reminder.mediaType === 'movie' ? 'Film' : 'Series'} ·{' '}
                            {reminderDateLabel(reminder)}
                          </Text>
                        </VStack>
                      </HStack>
                      <HStack space="xs" className="items-center">
                        <Text size="2xs" className="text-primary">
                          Cancel
                        </Text>
                        <Icon as={X} size="xs" className="text-muted-foreground" />
                      </HStack>
                    </HStack>
                  </Focusable>
                ))
              ) : (
                <Box className="rounded-2xl border border-dashed border-border bg-card/60 p-4">
                  <Text size="xs" className="text-muted-foreground">
                    Tap “Remind me on release day” on any Coming Soon title and it
                    will appear here.
                  </Text>
                </Box>
              )}
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
