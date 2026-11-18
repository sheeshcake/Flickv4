import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Film } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { Center } from '@/components/ui/center';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import { ContentCard } from '@/src/components/ContentCard';
import { EmptyState } from '@/src/components/EmptyState';
import { ErrorState } from '@/src/components/ErrorState';
import { Focusable } from '@/src/components/Focusable';
import { GridSkeleton } from '@/src/components/GridSkeleton';
import { fetchCategoryPage } from '@/src/services/categories';
import { useDeviceKind } from '@/src/hooks/useDeviceKind';
import { getGridColumns, getHorizontalPadding } from '@/src/utils/responsive';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';
import type { MediaItem } from '@/src/types';
import type { RootStackScreenProps } from '@/src/navigation/types';

export const ViewMoreScreen = ({
  route,
  navigation,
}: RootStackScreenProps<'ViewMore'>) => {
  const { title, query } = route.params;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const deviceKind = useDeviceKind();

  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  // Page-1 failure gets a full-screen retry; later pages get a footer retry so
  // already-loaded results stay on screen.
  const [error, setError] = useState<unknown>(null);
  const [loadMoreError, setLoadMoreError] = useState<unknown>(null);
  const seenRef = useRef<Set<string>>(new Set());

  const keyOf = (i: MediaItem) => `${i.media_type ?? ''}-${i.id}`;

  const loadPage = useCallback(
    async (nextPage: number) => {
      try {
        const results = await fetchCategoryPage(query, nextPage);
        if (!results.length) {
          setReachedEnd(true);
          return;
        }
        const fresh = results.filter((i) => !seenRef.current.has(keyOf(i)));
        fresh.forEach((i) => seenRef.current.add(keyOf(i)));
        setItems((prev) => [...prev, ...fresh]);
      } catch (err) {
        if (nextPage === 1) setError(err);
        else setLoadMoreError(err);
      }
    },
    [query],
  );

  useEffect(() => {
    loadPage(1).finally(() => setLoading(false));
  }, [loadPage]);

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

  return (
    <Box className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <HStack space="md" className="items-center px-4 py-3">
        <Focusable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          className="rounded-full"
          focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
        >
          <Icon as={ArrowLeft} size="xl" className="text-foreground" />
        </Focusable>
        <Heading size="xl" bold className="flex-1 text-foreground" numberOfLines={1}>
          {title}
        </Heading>
      </HStack>

      {loading ? (
        <GridSkeleton rows={5} paddingTop={4} />
      ) : error && !items.length ? (
        <ErrorState
          title="Couldn't load this list"
          error={error}
          onRetry={retry}
          retrying={loading}
        />
      ) : (
        <FlatList
          data={items}
          key={columns}
          numColumns={columns}
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
              onPress={(i) => navigation.push('Detail', { item: i })}
            />
          )}
          ListFooterComponent={
            loadingMore ? (
              <Center className="py-6">
                <Spinner color="#E50914" />
              </Center>
            ) : loadMoreError ? (
              <ErrorState
                compact
                title="Couldn't load more"
                error={loadMoreError}
                onRetry={retryMore}
                retrying={loadingMore}
              />
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon={Film}
              title="Nothing here yet"
              description="This category has no titles right now. Try another row from Home."
              actionLabel="Try again"
              onAction={retry}
              compact
            />
          }
        />
      )}
    </Box>
  );
};
