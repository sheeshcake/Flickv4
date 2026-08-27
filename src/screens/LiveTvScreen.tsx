import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radio, Search as SearchIcon, Star } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { Center } from '@/components/ui/center';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Spinner } from '@/components/ui/spinner';
import { Input, InputField, InputSlot, InputIcon } from '@/components/ui/input';
import { Button, ButtonText } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Focusable } from '@/src/components/Focusable';
import { useDeviceKind } from '@/src/hooks/useDeviceKind';
import { getHorizontalPadding } from '@/src/utils/responsive';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';
import {
  DaddyLiveService,
  formatEventTime,
  friendlyLiveTvError,
  type LiveChannel,
  type LiveEpgDay,
} from '@/src/services/DaddyLiveService';
import type { RootStackParamList } from '@/src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Mode = 'channels' | 'schedule';
type Scope = 'all' | 'favorites' | 'recent';

const Chip = ({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) => (
  <Focusable
    onPress={onPress}
    className={`rounded-full px-4 py-2 ${
      active
        ? 'border border-primary/40 bg-primary/20'
        : 'border border-border bg-card'
    }`}
    focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
  >
    <Text
      size="sm"
      className={active ? 'font-semibold text-foreground' : 'text-foreground'}
    >
      {label}
    </Text>
  </Focusable>
);

export const LiveTvScreen = () => {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const deviceKind = useDeviceKind();
  const padding = getHorizontalPadding(deviceKind);

  const [mode, setMode] = useState<Mode>('channels');
  const [scope, setScope] = useState<Scope>('all');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [days, setDays] = useState<LiveEpgDay[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [recents, setRecents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    try {
      setError(null);
      const [catalog, favIds, recentIds] = await Promise.all([
        DaddyLiveService.getCatalog({ refresh }),
        DaddyLiveService.getFavorites(),
        DaddyLiveService.getRecents(),
      ]);
      setChannels(catalog.channels);
      setDays(catalog.epg.days);
      setCategories(catalog.categories);
      setFavorites(new Set(favIds));
      setRecents(recentIds);
    } catch (e) {
      setError(friendlyLiveTvError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const filteredChannels = useMemo(() => {
    const q = query.trim().toLowerCase();
    return channels.filter((channel) => {
      if (scope === 'favorites' && !favorites.has(channel.id)) return false;
      if (scope === 'recent' && !recents.includes(channel.id)) return false;
      if (category && !channel.categories.includes(category)) return false;
      if (!q) return true;
      const haystack = [
        channel.name,
        ...channel.eventTitles,
        channel.nowPlaying ?? '',
        channel.nextUp ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [channels, scope, favorites, recents, category, query]);

  const orderedChannels = useMemo(() => {
    if (scope !== 'recent') return filteredChannels;
    const byId = new Map(filteredChannels.map((c) => [c.id, c]));
    return recents
      .map((id) => byId.get(id))
      .filter((c): c is LiveChannel => c != null);
  }, [filteredChannels, recents, scope]);

  const scheduleDay = days[dayIndex] ?? days[0];
  const scheduleSections = useMemo(() => {
    if (!scheduleDay) return [];
    const q = query.trim().toLowerCase();
    return scheduleDay.categories
      .filter((section) => !category || section.name === category)
      .map((section) => ({
        ...section,
        events: section.events.filter((event) => {
          if (!q) return true;
          const hay = `${event.title} ${event.channels.map((c) => c.name).join(' ')}`.toLowerCase();
          return hay.includes(q);
        }),
      }))
      .filter((section) => section.events.length > 0);
  }, [scheduleDay, category, query]);

  const playChannel = useCallback(
    async (channel: LiveChannel) => {
      if (resolvingId) return;
      setResolvingId(channel.id);
      setError(null);
      try {
        const stream = await DaddyLiveService.getStream(channel.id);
        const recentIds = await DaddyLiveService.pushRecent(channel.id);
        setRecents(recentIds);
        navigation.navigate('LivePlayer', {
          channel,
          channels,
          stream,
        });
      } catch (e) {
        setError(friendlyLiveTvError(e));
      } finally {
        setResolvingId(null);
      }
    },
    [channels, navigation, resolvingId],
  );

  const openChannel = useCallback(
    (channel: LiveChannel) => {
      void playChannel(channel);
    },
    [playChannel],
  );

  const onToggleFavorite = useCallback(async (channelId: string) => {
    const next = await DaddyLiveService.toggleFavorite(channelId);
    setFavorites(new Set(next));
  }, []);

  const renderChannel = useCallback(
    ({ item }: { item: LiveChannel }) => {
      const resolving = item.id === resolvingId;
      const starred = favorites.has(item.id);
      return (
        <Focusable
          onPress={() => openChannel(item)}
          className="mb-2 rounded-xl bg-card px-4 py-3"
          focusedClassName={`bg-primary/20 ${TV_FOCUS_BORDER_CLASSNAME}`}
        >
          <HStack className="items-center justify-between">
            <VStack className="mr-3 flex-1">
              <Text size="md" bold className="text-foreground" numberOfLines={1}>
                {item.name}
              </Text>
              {item.nowPlaying ? (
                <Text size="sm" className="text-muted-foreground" numberOfLines={1}>
                  Now: {item.nowPlaying}
                </Text>
              ) : item.nextUp ? (
                <Text size="sm" className="text-muted-foreground" numberOfLines={1}>
                  Next: {item.nextUp}
                </Text>
              ) : null}
            </VStack>
            <HStack space="sm" className="items-center">
              {resolving ? <Spinner size="small" color="#E50914" /> : null}
              <Focusable
                onPress={() => void onToggleFavorite(item.id)}
                className="rounded-full p-2"
                focusedClassName={`bg-primary/20 ${TV_FOCUS_BORDER_CLASSNAME}`}
              >
                <Icon
                  as={Star}
                  size="md"
                  className={starred ? 'text-primary' : 'text-muted-foreground'}
                />
              </Focusable>
            </HStack>
          </HStack>
        </Focusable>
      );
    },
    [favorites, onToggleFavorite, openChannel, resolvingId],
  );

  if (loading) {
    return (
      <Center className="flex-1 bg-background">
        <Spinner size="large" color="#E50914" />
      </Center>
    );
  }

  if (error && !channels.length) {
    return (
      <Center className="flex-1 bg-background px-8">
        <VStack space="lg" className="items-center">
          <Icon as={Radio} size="xl" className="text-muted-foreground" />
          <Text className="text-center text-muted-foreground">{error}</Text>
          <Button
            variant="outline"
            onPress={() => {
              setLoading(true);
              void load(true);
            }}
          >
            <ButtonText>Try again</ButtonText>
          </Button>
        </VStack>
      </Center>
    );
  }

  return (
    <Box className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <Box style={{ paddingHorizontal: padding }} className="pb-3 pt-2">
        <Heading size="xl" bold className="text-foreground">
          Live TV
        </Heading>
        <HStack space="sm" className="mt-3">
          <Chip
            label="Channels"
            active={mode === 'channels'}
            onPress={() => setMode('channels')}
          />
          <Chip
            label="Schedule"
            active={mode === 'schedule'}
            onPress={() => setMode('schedule')}
          />
        </HStack>
        <Box className="mt-3">
          <Input>
            <InputSlot className="pl-3">
              <InputIcon as={SearchIcon} className="text-muted-foreground" />
            </InputSlot>
            <InputField
              placeholder={
                mode === 'channels'
                  ? 'Search channels or events'
                  : 'Search schedule'
              }
              value={query}
              onChangeText={setQuery}
            />
          </Input>
        </Box>
        {mode === 'channels' ? (
          <HStack space="sm" className="mt-3">
            <Chip
              label="All"
              active={scope === 'all'}
              onPress={() => setScope('all')}
            />
            <Chip
              label="Favorites"
              active={scope === 'favorites'}
              onPress={() => setScope('favorites')}
            />
            <Chip
              label="Recent"
              active={scope === 'recent'}
              onPress={() => setScope('recent')}
            />
          </HStack>
        ) : null}
      </Box>

      <Box className="mb-3">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: padding,
            gap: 8,
            flexDirection: 'row',
          }}
        >
          <Chip
            label="All categories"
            active={category == null}
            onPress={() => setCategory(null)}
          />
          {categories.map((name) => (
            <Chip
              key={name}
              label={name}
              active={category === name}
              onPress={() => setCategory(name)}
            />
          ))}
        </ScrollView>
      </Box>

      {mode === 'schedule' && days.length > 0 ? (
        <Box className="mb-3">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: padding,
              gap: 8,
              flexDirection: 'row',
            }}
          >
            {days.map((day, index) => (
              <Chip
                key={`${day.date ?? day.label}-${index}`}
                label={day.label || `Day ${index + 1}`}
                active={index === dayIndex}
                onPress={() => setDayIndex(index)}
              />
            ))}
          </ScrollView>
        </Box>
      ) : null}

      {error ? (
        <Text size="sm" className="px-4 pb-2 text-muted-foreground">
          {error}
        </Text>
      ) : null}

      {mode === 'channels' ? (
        <FlatList
          data={orderedChannels}
          keyExtractor={(item) => item.id}
          renderItem={renderChannel}
          contentContainerStyle={{
            paddingHorizontal: padding,
            paddingBottom: insets.bottom + 24,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load(true);
              }}
              tintColor="#E50914"
            />
          }
          ListEmptyComponent={
            <Center className="py-16">
              <Text className="text-muted-foreground">No channels match.</Text>
            </Center>
          }
        />
      ) : (
        <FlatList
          data={scheduleSections}
          keyExtractor={(section) => section.name}
          contentContainerStyle={{
            paddingHorizontal: padding,
            paddingBottom: insets.bottom + 24,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load(true);
              }}
              tintColor="#E50914"
            />
          }
          ListEmptyComponent={
            <Center className="py-16">
              <Text className="text-muted-foreground">No events match.</Text>
            </Center>
          }
          renderItem={({ item: section }) => (
            <Box className="mb-6">
              <Heading size="sm" className="mb-2 text-foreground">
                {section.name}
              </Heading>
              {section.events.map((event) => (
                <Box
                  key={`${event.id ?? event.title}-${event.time}`}
                  className="mb-3 rounded-xl bg-card px-4 py-3"
                >
                  <HStack className="items-baseline justify-between">
                    <Text size="xs" className="text-primary">
                      {formatEventTime(event)}
                    </Text>
                    <Text
                      size="sm"
                      bold
                      className="ml-3 flex-1 text-foreground"
                      numberOfLines={2}
                    >
                      {event.title}
                    </Text>
                  </HStack>
                  <VStack space="xs" className="mt-2">
                    {event.channels.map((ch) => (
                      <Focusable
                        key={ch.id}
                        onPress={() => {
                          const full =
                            channels.find((c) => c.id === ch.id) ?? {
                              id: ch.id,
                              name: ch.name,
                              categories: [],
                              eventTitles: [],
                            };
                          openChannel(full);
                        }}
                        className="rounded-lg py-1"
                        focusedClassName={`bg-primary/20 ${TV_FOCUS_BORDER_CLASSNAME}`}
                      >
                        <Text size="sm" className="text-muted-foreground">
                          {ch.name}
                          {resolvingId === ch.id ? '…' : ''}
                        </Text>
                      </Focusable>
                    ))}
                  </VStack>
                </Box>
              ))}
            </Box>
          )}
        />
      )}
    </Box>
  );
};
