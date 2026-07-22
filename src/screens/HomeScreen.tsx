import { useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { RefreshControl, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Center } from '@/components/ui/center';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { AppHeader } from '@/src/components/AppHeader';
import { HeroCarousel } from '@/src/components/HeroCarousel';
import { ContentRow } from '@/src/components/ContentRow';
import { useHomeData } from '@/src/hooks/useHomeData';
import { useMyList } from '@/src/hooks/useMyList';
import { useContinueWatching } from '@/src/hooks/useContinueWatching';
import { useDeviceKind } from '@/src/hooks/useDeviceKind';
import { getTitle, type MediaItem } from '@/src/types';
import type { RootStackParamList } from '@/src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export const HomeScreen = () => {
  const navigation = useNavigation<Nav>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const deviceKind = useDeviceKind();
  const { hero, rows, loading, error, refreshing, refresh } = useHomeData();
  const { items: myList, isInList, toggle } = useMyList();
  const { entries: continueWatching, remove: removeContinue } =
    useContinueWatching();

  // Row-scoped selection mode: long-pressing a card in "Continue Watching"
  // only affects that row (and same for "My List"). Users tap "Done" in the
  // header to exit selection mode without deleting anything.
  const [cwSelecting, setCwSelecting] = useState(false);
  const [myListSelecting, setMyListSelecting] = useState(false);

  const openDetail = (item: MediaItem) => navigation.navigate('Detail', { item });

  const play = (item: MediaItem, resumeFrom?: number) =>
    navigation.navigate('Player', {
      item,
      title: getTitle(item),
      resumeFrom,
    });

  const playContinue = (item: MediaItem) => {
    const entry = continueWatching.find(
      (e) =>
        e.item.id === item.id &&
        (e.item.media_type ?? 'movie') === (item.media_type ?? 'movie'),
    );
    play(item, entry?.position);
  };

  if (loading) {
    return (
      <Center className="flex-1 bg-background">
        <Spinner size="large" color="#E50914" />
      </Center>
    );
  }

  if (error && !rows.length) {
    return (
      <Center className="flex-1 bg-background px-8">
        <VStack space="lg" className="items-center">
          <Text className="text-center text-muted-foreground">{error}</Text>
          <Button variant="outline" onPress={refresh} isDisabled={refreshing}>
            <ButtonText>{refreshing ? 'Retrying…' : 'Try again'}</ButtonText>
          </Button>
        </VStack>
      </Center>
    );
  }

  const heroHeight = height * 0.6;
  const continueItems = continueWatching.map((e) => e.item);
  const findContinueEntry = (item: MediaItem) =>
    continueWatching.find(
      (e) =>
        e.item.id === item.id &&
        (e.item.media_type ?? 'movie') === (item.media_type ?? 'movie'),
    );
  const continueProgress = (item: MediaItem) => {
    const entry = findContinueEntry(item);
    if (!entry || entry.duration <= 0) return undefined;
    return entry.position / entry.duration;
  };
  const continueCaption = (item: MediaItem) => {
    if ((item.media_type ?? 'movie') !== 'tv') return undefined;
    const entry = findContinueEntry(item);
    if (!entry || entry.season == null || entry.episode == null) return undefined;
    return `S${entry.season} E${entry.episode}`;
  };

  return (
    <Box className="flex-1 bg-background">
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor="#E50914"
          />
        }
      >
        <Box className="relative">
          <HeroCarousel
            items={hero}
            deviceKind={deviceKind}
            height={heroHeight}
            width={width}
            isInList={isInList}
            onPlay={(item) => play(item)}
            onToggleList={toggle}
            onPress={openDetail}
          />
          <Box
            className="absolute left-0 right-0"
            style={{ top: insets.top }}
            pointerEvents="box-none"
          >
            <AppHeader paddingHorizontal={16} />
          </Box>
        </Box>

        <Box className="mt-4">
          {continueItems.length > 0 && (
            <ContentRow
              title="Continue Watching"
              data={continueItems}
              deviceKind={deviceKind}
              screenWidth={width}
              onItemPress={playContinue}
              getProgress={continueProgress}
              getCaption={continueCaption}
              selectionEnabled={cwSelecting}
              onEnterSelection={() => setCwSelecting(true)}
              onExitSelection={() => setCwSelecting(false)}
              onConfirmDelete={(item) => removeContinue(item)}
              confirmTitle="Remove from Continue Watching?"
            />
          )}

          {myList.length > 0 && (
            <ContentRow
              title="My List"
              data={myList}
              deviceKind={deviceKind}
              screenWidth={width}
              onItemPress={openDetail}
              selectionEnabled={myListSelecting}
              onEnterSelection={() => setMyListSelecting(true)}
              onExitSelection={() => setMyListSelecting(false)}
              onConfirmDelete={(item) => toggle(item)}
              confirmTitle="Remove from My List?"
            />
          )}

          {rows.map((row) => (
            <ContentRow
              key={row.title}
              title={row.title}
              data={row.data}
              deviceKind={deviceKind}
              screenWidth={width}
              onItemPress={openDetail}
              onViewMore={() =>
                navigation.navigate('ViewMore', {
                  title: row.title,
                  query: row.query,
                })
              }
            />
          ))}
        </Box>
        <Box style={{ height: insets.bottom + 16 }} />
      </ScrollView>
    </Box>
  );
};
