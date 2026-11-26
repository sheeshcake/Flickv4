import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Film, User } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { Center } from '@/components/ui/center';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Image } from '@/components/ui/image';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { ContentCard } from '@/src/components/ContentCard';
import { EmptyState } from '@/src/components/EmptyState';
import { ErrorState } from '@/src/components/ErrorState';
import { Focusable } from '@/src/components/Focusable';
import { GridSkeleton } from '@/src/components/GridSkeleton';
import { useDeviceKind } from '@/src/hooks/useDeviceKind';
import type { RootStackScreenProps } from '@/src/navigation/types';
import { TMDBService } from '@/src/services/TMDBService';
import type { MediaItem, PersonDetails } from '@/src/types';
import {
  getGridColumns,
  getHorizontalPadding,
} from '@/src/utils/responsive';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

type WorkFilter = 'all' | 'movie' | 'tv';

const FILTERS: { value: WorkFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'TV Shows' },
];

export const PersonScreen = ({
  route,
  navigation,
}: RootStackScreenProps<'Person'>) => {
  const { personId, name: initialName, profilePath, knownForDepartment } =
    route.params;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const deviceKind = useDeviceKind();

  const [details, setDetails] = useState<PersonDetails | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [filter, setFilter] = useState<WorkFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Details are cosmetic; a failure there must not hide the works grid.
    const [detailsResult, worksResult] = await Promise.allSettled([
      TMDBService.getPersonDetails(personId),
      TMDBService.getPersonWorks(personId),
    ]);

    if (detailsResult.status === 'fulfilled') {
      setDetails(detailsResult.value);
    }
    if (worksResult.status === 'fulfilled') {
      setItems(worksResult.value);
      setError(null);
    } else {
      setError(worksResult.reason);
    }
    setLoading(false);
  }, [personId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const retry = useCallback(() => setReloadKey((key) => key + 1), []);

  const displayName = details?.name || initialName || 'Artist';
  const department = details?.known_for_department ?? knownForDepartment;
  const photoUrl = TMDBService.getImageUrl(
    details?.profile_path ?? profilePath ?? null,
    'w300',
  );

  const columns = getGridColumns(deviceKind);
  const padding = getHorizontalPadding(deviceKind);
  const gap = 12;
  const cardWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
  const keyOf = (item: MediaItem) => `${item.media_type ?? 'movie'}-${item.id}`;

  const visibleItems = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((item) =>
      filter === 'movie' ? 'title' in item : 'name' in item,
    );
  }, [filter, items]);

  const header = (
    <VStack space="md" className="pb-2">
      <HStack space="md" className="items-center px-4 py-3">
        <Focusable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          className="rounded-full"
          focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
        >
          <Icon as={ArrowLeft} size="xl" className="text-foreground" />
        </Focusable>
        <Heading
          size="xl"
          bold
          className="flex-1 text-foreground"
          numberOfLines={1}
        >
          {displayName}
        </Heading>
      </HStack>

      <HStack space="md" className="items-center px-4">
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            alt={displayName}
            resizeMode="cover"
            style={{ width: 84, height: 84, borderRadius: 42 }}
          />
        ) : (
          <Center
            className="rounded-full bg-muted"
            style={{ width: 84, height: 84 }}
          >
            <Icon as={User} size="xl" className="text-muted-foreground" />
          </Center>
        )}
        <VStack className="flex-1" space="xs">
          <Heading size="lg" bold className="text-foreground" numberOfLines={2}>
            {displayName}
          </Heading>
          {!!department && (
            <Text size="sm" className="text-muted-foreground">
              {department}
            </Text>
          )}
          <Text size="xs" className="text-muted-foreground">
            {items.length} {items.length === 1 ? 'work' : 'works'} · cast & crew
          </Text>
        </VStack>
      </HStack>

      {!!details?.biography && (
        <Text
          size="sm"
          className="px-4 text-muted-foreground"
          numberOfLines={3}
        >
          {details.biography}
        </Text>
      )}

      <HStack space="sm" className="px-4">
        {FILTERS.map((option) => {
          const active = filter === option.value;
          return (
            <Focusable
              key={option.value}
              onPress={() => setFilter(option.value)}
              className={`rounded-full px-4 py-2 ${
                active ? 'bg-primary' : 'bg-card'
              }`}
              focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
            >
              <Text
                size="sm"
                className={active ? 'font-semibold text-white' : 'text-foreground'}
              >
                {option.label}
              </Text>
            </Focusable>
          );
        })}
      </HStack>
    </VStack>
  );

  return (
    <Box className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {loading ? (
        <>
          {header}
          <GridSkeleton rows={4} paddingTop={4} />
        </>
      ) : error && !items.length ? (
        <>
          {header}
          <ErrorState
            title="Couldn't load this artist's works"
            error={error}
            onRetry={retry}
            retrying={false}
          />
        </>
      ) : (
        <FlatList
          data={visibleItems}
          key={`${columns}-${filter}`}
          numColumns={columns}
          keyExtractor={keyOf}
          columnWrapperStyle={{ gap }}
          contentContainerStyle={{
            gap,
            paddingHorizontal: padding,
            paddingBottom: insets.bottom + 16,
          }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <ContentCard
              item={item}
              width={cardWidth}
              onPress={(selected) =>
                navigation.push('Detail', { item: selected })
              }
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon={Film}
              title="No works found"
              description="This artist has no titles in this filter right now."
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
