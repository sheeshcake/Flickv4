import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Library as LibraryIcon, Film, SlidersHorizontal, X } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { Center } from '@/components/ui/center';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { Input, InputField } from '@/components/ui/input';
import { Focusable } from '@/src/components/Focusable';
import { ContentCard } from '@/src/components/ContentCard';
import { EmptyState } from '@/src/components/EmptyState';
import { ErrorState } from '@/src/components/ErrorState';
import { GridSkeleton } from '@/src/components/GridSkeleton';
import { TMDBService } from '@/src/services/TMDBService';
import { tagMedia } from '@/src/services/categories';
import { interleaveByPopularity } from '@/src/services/categories';
import { useDeviceKind } from '@/src/hooks/useDeviceKind';
import { getGridColumns, getHorizontalPadding } from '@/src/utils/responsive';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';
import type { DiscoverFilters, MediaItem } from '@/src/types';
import type { RootStackParamList } from '@/src/navigation/types';

type MediaType = 'all' | 'movie' | 'tv';
type Language = 'all' | 'ar' | 'en';

const MEDIA_OPTIONS: { value: MediaType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'TV Shows' },
];

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'ar', label: 'Arabic' },
  { value: 'en', label: 'English' },
];

const keyOf = (i: MediaItem) => `${i.media_type ?? ''}-${i.id}`;

type Nav = NativeStackNavigationProp<RootStackParamList>;

export const LibraryScreen = () => {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const deviceKind = useDeviceKind();

  // Draft filter state (edited in the bar).
  const [mediaType, setMediaType] = useState<MediaType>('all');
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [language, setLanguage] = useState<Language>('all');
  const [country, setCountry] = useState('');

  // Applied filter state (drives fetching).
  const [applied, setApplied] = useState<DiscoverFilters>({ mediaType: 'all' });

  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [loadMoreError, setLoadMoreError] = useState<unknown>(null);
  const seenRef = useRef<Set<string>>(new Set());

  const parseYear = (v: string): number | undefined => {
    const t = v.trim();
    if (!/^\d{4}$/.test(t)) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  };
  const buildFilters = (): DiscoverFilters => ({
    mediaType,
    yearFrom: parseYear(yearFrom),
    yearTo: parseYear(yearTo),
    language,
    originCountry: country.trim() ? country.trim().toUpperCase() : undefined,
  });

  const applyFilters = useCallback(() => {
    seenRef.current = new Set();
    setItems([]);
    setPage(1);
    setReachedEnd(false);
    setError(null);
    setLoadMoreError(null);
    setApplied(buildFilters());
  }, [mediaType, yearFrom, yearTo, language, country]);

  const resetFilters = useCallback(() => {
    setMediaType('all');
    setYearFrom('');
    setYearTo('');
    setLanguage('all');
    setCountry('');
    seenRef.current = new Set();
    setItems([]);
    setPage(1);
    setReachedEnd(false);
    setError(null);
    setLoadMoreError(null);
    setApplied({ mediaType: 'all' });
  }, []);

  const loadPage = useCallback(
    async (nextPage: number) => {
      const f = applied;
      const mt = f.mediaType ?? 'all';
      try {
        let fresh: MediaItem[] = [];
        if (mt === 'movie' || mt === 'all') {
          const res = await TMDBService.discoverMoviesFiltered(f, nextPage);
          fresh = [...fresh, ...tagMedia(res.results, 'movie')];
        }
        if (mt === 'tv' || mt === 'all') {
          const res = await TMDBService.discoverTVFiltered(f, nextPage);
          const tvTagged = tagMedia(res.results, 'tv');
          if (mt === 'all') {
            // Re-merge the two pages by popularity instead of concatenating.
            const movieItems = fresh;
            fresh = interleaveByPopularity(movieItems, tvTagged);
          } else {
            fresh = [...fresh, ...tvTagged];
          }
        }

        if (nextPage === 1) seenRef.current = new Set();
        const deduped = fresh.filter((i) => !seenRef.current.has(keyOf(i)));
        deduped.forEach((i) => seenRef.current.add(keyOf(i)));
        if (nextPage === 1) setItems(deduped);
        else setItems((prev) => [...prev, ...deduped]);
        if (!fresh.length) setReachedEnd(true);
      } catch (err) {
        if (nextPage === 1) setError(err);
        else setLoadMoreError(err);
      }
    },
    [applied],
  );

  useEffect(() => {
    setLoading(true);
    void loadPage(1).finally(() => setLoading(false));
  }, [applied, loadPage]);

  const retry = useCallback(() => {
    seenRef.current = new Set();
    setItems([]);
    setPage(1);
    setReachedEnd(false);
    setError(null);
    setLoadMoreError(null);
    setLoading(true);
    void loadPage(1).finally(() => setLoading(false));
  }, [loadPage]);

  const onEndReached = useCallback(() => {
    if (loading || loadingMore || reachedEnd || loadMoreError) return;
    setLoadingMore(true);
    const next = page + 1;
    setPage(next);
    loadPage(next).finally(() => setLoadingMore(false));
  }, [loading, loadingMore, reachedEnd, loadMoreError, page, loadPage]);

  const retryMore = useCallback(() => {
    setLoadMoreError(null);
    setLoadingMore(true);
    const next = page + 1;
    setPage(next);
    loadPage(next).finally(() => setLoadingMore(false));
  }, [page, loadPage]);

  const columns = getGridColumns(deviceKind);
  const padding = getHorizontalPadding(deviceKind);
  const gap = 12;
  const cardWidth = (width - padding * 2 - gap * (columns - 1)) / columns;

  const hasActiveFilters =
    (applied.mediaType && applied.mediaType !== 'all') ||
    applied.yearFrom != null ||
    applied.yearTo != null ||
    (applied.language && applied.language !== 'all') ||
    !!applied.originCountry;

  return (
    <Box className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <HStack space="md" className="items-center px-4 py-3">
        <Icon as={LibraryIcon} size="xl" className="text-primary" />
        <Heading size="xl" bold className="flex-1 text-foreground">
          Library
        </Heading>
      </HStack>

      {/* Filter bar */}
      <VStack space="sm" className="px-4 pb-3">
        <HStack space="sm" className="flex-wrap">
          {MEDIA_OPTIONS.map((opt) => {
            const active = mediaType === opt.value;
            return (
              <Focusable
                key={opt.value}
                onPress={() => setMediaType(opt.value)}
                className={`rounded-full border px-3 py-1.5 ${
                  active ? 'border-primary bg-primary/20' : 'border-border bg-card'
                }`}
                focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
              >
                <Text
                  size="sm"
                  className={active ? 'font-semibold text-foreground' : 'text-foreground'}
                >
                  {opt.label}
                </Text>
              </Focusable>
            );
          })}
        </HStack>

        <HStack space="sm" className="flex-wrap">
          {LANGUAGE_OPTIONS.map((opt) => {
            const active = language === opt.value;
            return (
              <Focusable
                key={opt.value}
                onPress={() => setLanguage(opt.value)}
                className={`rounded-full border px-3 py-1.5 ${
                  active ? 'border-primary bg-primary/20' : 'border-border bg-card'
                }`}
                focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
              >
                <Text
                  size="sm"
                  className={active ? 'font-semibold text-foreground' : 'text-foreground'}
                >
                  {opt.label}
                </Text>
              </Focusable>
            );
          })}
        </HStack>

        <HStack space="sm" className="items-center">
          <Input className="h-10 flex-1 rounded-full bg-card">
            <InputField
              placeholder="From year"
              value={yearFrom}
              onChangeText={setYearFrom}
              keyboardType="numeric"
              className="text-foreground"
            />
          </Input>
          <Input className="h-10 flex-1 rounded-full bg-card">
            <InputField
              placeholder="To year"
              value={yearTo}
              onChangeText={setYearTo}
              keyboardType="numeric"
              className="text-foreground"
            />
          </Input>
          <Input className="h-10 flex-1 rounded-full bg-card">
            <InputField
              placeholder="Country (e.g. EG)"
              value={country}
              onChangeText={setCountry}
              autoCapitalize="characters"
              maxLength={2}
              className="text-foreground"
            />
          </Input>
        </HStack>

        <HStack space="sm" className="items-center">
          <Focusable
            onPress={applyFilters}
            className="rounded-full bg-primary px-4 py-2"
            focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
          >
            <HStack space="xs" className="items-center">
              <Icon as={SlidersHorizontal} size="sm" className="text-primary-foreground" />
              <Text size="sm" className="font-semibold text-primary-foreground">
                Apply
              </Text>
            </HStack>
          </Focusable>
          {hasActiveFilters ? (
            <Focusable
              onPress={resetFilters}
              className="rounded-full border border-border bg-card px-4 py-2"
              focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
            >
              <HStack space="xs" className="items-center">
                <Icon as={X} size="sm" className="text-foreground" />
                <Text size="sm" className="text-foreground">
                  Reset
                </Text>
              </HStack>
            </Focusable>
          ) : null}
        </HStack>
      </VStack>

      {loading ? (
        <GridSkeleton rows={5} paddingTop={4} />
      ) : error && !items.length ? (
        <ErrorState title="Couldn't load library" error={error} onRetry={retry} retrying={loading} />
      ) : (
        <FlatList
          data={items}
          key={columns}
          numColumns={columns}
          style={{ flex: 1 }}
          keyExtractor={keyOf}
          columnWrapperStyle={{ gap }}
          contentContainerStyle={{
            gap,
            paddingHorizontal: padding,
            paddingBottom: insets.bottom + 16,
          }}
          showsVerticalScrollIndicator={false}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => (
            <ContentCard
              item={item}
              width={cardWidth}
              onPress={(i) => navigation.navigate('Detail', { item: i })}
            />
          )}
          ListFooterComponent={
            loadingMore ? (
              <Center className="py-6">
                <GridSkeleton rows={1} />
              </Center>
            ) : loadMoreError ? (
              <ErrorState compact title="Couldn't load more" error={loadMoreError} onRetry={retryMore} retrying={loadingMore} />
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon={Film}
              title="Nothing matches"
              description="Try different filters, or reset to browse everything."
              actionLabel="Reset filters"
              onAction={resetFilters}
              compact
            />
          }
        />
      )}
    </Box>
  );
};
