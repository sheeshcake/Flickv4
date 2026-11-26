import { useEffect, useState } from 'react';
import { FlatList, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Film, Search as SearchIcon, SearchX, X } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { Input, InputField, InputSlot, InputIcon } from '@/components/ui/input';
import { ContentCard } from '@/src/components/ContentCard';
import { EmptyState } from '@/src/components/EmptyState';
import { ErrorState } from '@/src/components/ErrorState';
import { GridSkeleton } from '@/src/components/GridSkeleton';
import { TMDBService } from '@/src/services/TMDBService';
import { useDebounce } from '@/src/hooks/useDebounce';
import { useDeviceKind } from '@/src/hooks/useDeviceKind';
import {
  getGridColumns,
  getHorizontalPadding,
} from '@/src/utils/responsive';
import type { MediaItem } from '@/src/types';
import type { RootStackParamList } from '@/src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Alternate two lists so the trending grid mixes movies and TV shows. */
const interleave = <T,>(a: T[], b: T[]): T[] => {
  const out: T[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
};

export const SearchScreen = () => {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const deviceKind = useDeviceKind();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MediaItem[]>([]);
  const [trending, setTrending] = useState<MediaItem[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingError, setTrendingError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Bumped by every "Try again" so both effects re-run without duplicating
  // their fetch logic.
  const [attempt, setAttempt] = useState(0);
  const debouncedQuery = useDebounce(query, 300);
  const retry = () => setAttempt((n) => n + 1);

  // Load trending movies + TV once for the empty-query state.
  useEffect(() => {
    let cancelled = false;
    setTrendingError(null);
    setTrendingLoading(true);
    Promise.all([
      TMDBService.getTrendingMovies(),
      TMDBService.getTrendingTVShows(),
    ])
      .then(([movies, tv]) => {
        if (cancelled) return;
        const m: MediaItem[] = movies.results.map((i) => ({
          ...i,
          media_type: 'movie' as const,
        }));
        const t: MediaItem[] = tv.results.map((i) => ({
          ...i,
          media_type: 'tv' as const,
        }));
        setTrending(interleave<MediaItem>(m, t));
      })
      .catch((err) => {
        if (!cancelled) setTrendingError(err);
      })
      .finally(() => {
        if (!cancelled) setTrendingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    const term = debouncedQuery.trim();
    if (!term) {
      setResults([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    TMDBService.searchMulti(term)
      .then((res) => {
        if (!cancelled) setResults(res.results);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, attempt]);

  const hasQuery = debouncedQuery.trim().length > 0;
  const showTrending = !hasQuery;
  const data = showTrending ? trending : results;

  const columns = getGridColumns(deviceKind);
  const padding = getHorizontalPadding(deviceKind);
  const gap = 12;
  const cardWidth = (width - padding * 2 - gap * (columns - 1)) / columns;

  const busy = loading || (showTrending && trendingLoading);

  const renderBody = () => {
    if (busy) return <GridSkeleton rows={4} />;

    if (hasQuery && error) {
      return (
        <ErrorState
          title="Search failed"
          error={error}
          onRetry={retry}
          retrying={loading}
        />
      );
    }

    if (showTrending && trendingError && !trending.length) {
      return (
        <ErrorState
          title="Couldn't load trending"
          error={trendingError}
          onRetry={retry}
          retrying={trendingLoading}
        />
      );
    }

    return (
      <FlatList
        data={data}
        key={columns}
        numColumns={columns}
        keyExtractor={(item) => `${item.media_type ?? ''}-${item.id}`}
        columnWrapperStyle={{ gap }}
        contentContainerStyle={{
          gap,
          paddingHorizontal: padding,
          paddingBottom: insets.bottom + 16,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          showTrending && data.length ? (
            <Heading size="lg" className="mb-3 text-foreground">
              Trending now
            </Heading>
          ) : null
        }
        renderItem={({ item }) => (
          <ContentCard
            item={item}
            width={cardWidth}
            onPress={(i) => navigation.navigate('Detail', { item: i })}
          />
        )}
        ListEmptyComponent={
          hasQuery ? (
            <EmptyState
              icon={SearchX}
              title={`No results for “${debouncedQuery.trim()}”`}
              description="Try a different title, or check the spelling."
              actionLabel="Clear search"
              onAction={() => setQuery('')}
              compact
            />
          ) : (
            <EmptyState
              icon={Film}
              title="Nothing to show yet"
              description="The catalog came back empty. Check your connection and try again."
              actionLabel="Try again"
              onAction={retry}
              compact
            />
          )
        }
      />
    );
  };

  return (
    <Box className="flex-1 bg-background" style={{ paddingTop: insets.top + 8 }}>
      <Box style={{ paddingHorizontal: padding }}>
        <Input className="mb-4 h-12 rounded-full bg-card">
          <InputSlot className="pl-3">
            <InputIcon as={SearchIcon} />
          </InputSlot>
          <InputField
            placeholder="Search movies & TV shows"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
            className="text-foreground"
          />
          {query.length > 0 ? (
            <InputSlot className="pr-3" onPress={() => setQuery('')}>
              <InputIcon as={X} className="text-muted-foreground" />
            </InputSlot>
          ) : null}
        </Input>
      </Box>

      {renderBody()}
    </Box>
  );
};
