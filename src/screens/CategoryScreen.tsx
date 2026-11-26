import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Coffee, Sparkles } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ContentRow } from '@/src/components/ContentRow';
import { ErrorState } from '@/src/components/ErrorState';
import { Focusable } from '@/src/components/Focusable';
import {
  buildCategoryRows,
  buildScopeTrendingRow,
  getCategoryById,
  type BrowseScope,
  type CategoryRowSpec,
} from '@/src/config/categoriesCatalog';
import { useCatalogRegion } from '@/src/hooks/useCatalogRegion';
import { useDeviceKind } from '@/src/hooks/useDeviceKind';
import type { RootStackParamList, RootStackScreenProps } from '@/src/navigation/types';
import { fetchCategoryPage } from '@/src/services/categories';
import { getReleaseDate, type MediaItem } from '@/src/types';
import { getHorizontalPadding } from '@/src/utils/responsive';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface RowState {
  items: MediaItem[];
  loading: boolean;
  error?: unknown;
}

const titleForScope = (scope: BrowseScope): string =>
  scope === 'series' ? 'Series' : scope === 'films' ? 'Films' : 'All';

export const CategoryScreen = ({
  route,
}: RootStackScreenProps<'Category'>) => {
  const { scope, categoryId } = route.params;
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const deviceKind = useDeviceKind();
  const { region } = useCatalogRegion();

  const category = useMemo(() => getCategoryById(categoryId), [categoryId]);
  const rows = useMemo(() => {
    const recipes = buildCategoryRows(scope, category);
    const trending = category ? null : buildScopeTrendingRow(scope);
    return trending ? [trending, ...recipes] : recipes;
  }, [scope, category]);
  const rowsSignature = useMemo(
    () => JSON.stringify(rows.map((row) => row.query)),
    [rows],
  );

  const [states, setStates] = useState<Record<string, RowState>>({});

  const loadRow = useCallback(async (row: CategoryRowSpec) => {
    setStates((prev) => ({
      ...prev,
      [row.id]: { items: prev[row.id]?.items ?? [], loading: true },
    }));
    try {
      const items = await fetchCategoryPage(row.query, 1);
      setStates((prev) => ({
        ...prev,
        [row.id]: { items, loading: false },
      }));
    } catch (error) {
      setStates((prev) => ({
        ...prev,
        [row.id]: {
          items: prev[row.id]?.items ?? [],
          loading: false,
          error,
        },
      }));
    }
  }, []);

  useEffect(() => {
    rows.forEach((row) => void loadRow(row));
  }, [rowsSignature, loadRow]); // eslint-disable-line react-hooks/exhaustive-deps

  const headerTitle = category?.name ?? titleForScope(scope);
  const padding = getHorizontalPadding(deviceKind);

  const openDetail = (item: MediaItem) => navigation.navigate('Detail', { item });
  const openViewMore = (row: CategoryRowSpec) =>
    navigation.navigate('ViewMore', { title: row.title, query: row.query });

  return (
    <Box className="flex-1 bg-background">
      <LinearGradient
        colors={['#2A1A12', '#120C08', '#0C0907']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: insets.top }}
      >
        <HStack space="md" className="items-center px-4 py-3">
          <Focusable
            onPress={() => navigation.goBack()}
            hitSlop={12}
            className="rounded-full border border-border/70 bg-card/70 p-1.5"
            focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
          >
            <Icon as={ArrowLeft} size="lg" className="text-foreground" />
          </Focusable>
          <LinearGradient
            colors={['#C47C48', '#6B3D22']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="h-10 w-10 items-center justify-center rounded-2xl"
          >
            <Icon as={Coffee} size="sm" className="text-primary-foreground" />
          </LinearGradient>
          <VStack className="flex-1">
            <Text size="2xs" bold className="text-primary">
              COFFE HOUSE PICKS
            </Text>
            <Heading size="xl" bold className="text-foreground" numberOfLines={1}>
              {headerTitle}
            </Heading>
          </VStack>
          <Icon as={Sparkles} size="lg" className="text-primary/80" />
        </HStack>
        <HStack className="px-4 pb-3">
          <Box className="rounded-full border border-border/70 bg-card/70 px-3 py-1">
            <Text size="2xs" className="text-muted-foreground">
              {category ? `${titleForScope(scope)} · ${region}` : region}
            </Text>
          </Box>
        </HStack>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false}>
        {rows.map((row) => {
          const state = states[row.id];
          return (
            <Box key={row.id}>
              <ContentRow
                title={row.title}
                data={state?.items ?? []}
                deviceKind={deviceKind}
                screenWidth={width}
                onItemPress={openDetail}
                getCaption={
                  row.id === 'new'
                    ? (item) => getReleaseDate(item)
                    : undefined
                }
                onViewMore={() => openViewMore(row)}
              />
              {state?.loading && !state.items.length ? (
                <Text
                  size="sm"
                  className="px-4 text-muted-foreground"
                  style={{ paddingHorizontal: padding }}
                >
                  Loading…
                </Text>
              ) : null}
              {state?.error && !state.items.length ? (
                <Box style={{ paddingHorizontal: padding }}>
                  <ErrorState
                    compact
                    title={`Couldn't load ${row.title}`}
                    error={state.error}
                    onRetry={() => void loadRow(row)}
                    retrying={state.loading}
                  />
                </Box>
              ) : null}
            </Box>
          );
        })}
        <Box style={{ height: insets.bottom + 24 }} />
      </ScrollView>
    </Box>
  );
};
