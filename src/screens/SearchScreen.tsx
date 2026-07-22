import { useEffect, useState } from 'react';
import { FlatList, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search as SearchIcon } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { Center } from '@/components/ui/center';
import { Heading } from '@/components/ui/heading';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { Input, InputField, InputSlot, InputIcon } from '@/components/ui/input';
import { ContentCard } from '@/src/components/ContentCard';
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debouncedQuery = useDebounce(query, 300);

  // Load trending movies + TV once for the empty-query state.
  useEffect(() => {
    let cancelled = false;
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
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTrendingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Search failed.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const hasQuery = debouncedQuery.trim().length > 0;
  const showTrending = !hasQuery;
  const data = showTrending ? trending : results;

  const columns = getGridColumns(deviceKind);
  const padding = getHorizontalPadding(deviceKind);
  const gap = 12;
  const cardWidth = (width - padding * 2 - gap * (columns - 1)) / columns;

  return (
    <Box
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top + 8, paddingHorizontal: padding }}
    >
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
      </Input>

      {(loading || (showTrending && trendingLoading)) && (
        <Center className="flex-1">
          <Spinner size="large" color="#E50914" />
        </Center>
      )}

      {!loading && hasQuery && error && (
        <Center className="flex-1">
          <Text className="text-center text-muted-foreground">{error}</Text>
        </Center>
      )}

      {!loading && !(showTrending && trendingLoading) && !(hasQuery && error) && (
        <FlatList
          data={data}
          key={columns}
          numColumns={columns}
          keyExtractor={(item) => `${item.media_type ?? ''}-${item.id}`}
          columnWrapperStyle={{ gap }}
          contentContainerStyle={{ gap, paddingBottom: insets.bottom + 16 }}
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
              <Center className="mt-20">
                <Text className="text-muted-foreground">
                  No results for “{debouncedQuery.trim()}”.
                </Text>
              </Center>
            ) : (
              <Center className="mt-20">
                <Text className="text-muted-foreground">
                  Find something to watch.
                </Text>
              </Center>
            )
          }
        />
      )}
    </Box>
  );
};
