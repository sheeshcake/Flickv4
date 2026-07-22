import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { Center } from '@/components/ui/center';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { ContentCard } from '@/src/components/ContentCard';
import { fetchCategoryPage } from '@/src/services/categories';
import { useDeviceKind } from '@/src/hooks/useDeviceKind';
import { getGridColumns, getHorizontalPadding } from '@/src/utils/responsive';
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
      } catch {
        setReachedEnd(true);
      }
    },
    [query],
  );

  useEffect(() => {
    loadPage(1).finally(() => setLoading(false));
  }, [loadPage]);

  const onEndReached = useCallback(() => {
    if (loading || loadingMore || reachedEnd) return;
    setLoadingMore(true);
    const next = page + 1;
    setPage(next);
    loadPage(next).finally(() => setLoadingMore(false));
  }, [loading, loadingMore, reachedEnd, page, loadPage]);

  const columns = getGridColumns(deviceKind);
  const padding = getHorizontalPadding(deviceKind);
  const gap = 12;
  const cardWidth = (width - padding * 2 - gap * (columns - 1)) / columns;

  return (
    <Box className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <HStack space="md" className="items-center px-4 py-3">
        <Pressable onPress={() => navigation.goBack()} focusable hitSlop={12}>
          <Icon as={ArrowLeft} size="xl" className="text-foreground" />
        </Pressable>
        <Heading size="xl" bold className="flex-1 text-foreground" numberOfLines={1}>
          {title}
        </Heading>
      </HStack>

      {loading ? (
        <Center className="flex-1">
          <Spinner size="large" color="#E50914" />
        </Center>
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
            ) : null
          }
          ListEmptyComponent={
            <Center className="mt-20">
              <Text className="text-muted-foreground">Nothing to show.</Text>
            </Center>
          }
        />
      )}
    </Box>
  );
};
