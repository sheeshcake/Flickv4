import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Play, Trash2 } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { Center } from '@/components/ui/center';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Image } from '@/components/ui/image';
import { Text } from '@/components/ui/text';
import { Focusable } from '@/src/components/Focusable';
import {
  useFinishedMovies,
  type FinishedMovieEntry,
} from '@/src/hooks/useFinishedMovies';
import { TMDBService } from '@/src/services/TMDBService';
import { getTitle } from '@/src/types';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';
import type { RootStackParamList } from '@/src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const formatFinishedAt = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

export const FinishedMoviesScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { entries, remove } = useFinishedMovies();

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
        <Heading size="xl" bold className="flex-1 text-foreground">
          Finished Movies
        </Heading>
      </HStack>

      {entries.length === 0 ? (
        <Center className="flex-1 px-8">
          <Text className="text-center text-muted-foreground">
            No finished movies yet. Movies you watch all the way through
            will show up here.
          </Text>
        </Center>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(entry) => `${entry.item.media_type ?? 'movie'}-${entry.item.id}`}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 24,
            gap: 12,
          }}
          renderItem={({ item: entry }) => (
            <FinishedMovieRow
              entry={entry}
              onPress={() =>
                navigation.navigate('Detail', { item: entry.item })
              }
              onPlay={() =>
                navigation.navigate('Player', {
                  item: entry.item,
                  title: getTitle(entry.item),
                })
              }
              onDelete={() => remove(entry.item)}
            />
          )}
        />
      )}
    </Box>
  );
};

const FinishedMovieRow = ({
  entry,
  onPress,
  onPlay,
  onDelete,
}: {
  entry: FinishedMovieEntry;
  onPress: () => void;
  onPlay: () => void;
  onDelete: () => void;
}) => {
  const poster = TMDBService.getImageUrl(entry.item.poster_path, 'w300');
  const title = getTitle(entry.item);

  return (
    <Box className="rounded-lg bg-card p-3">
      <HStack space="md" className="items-center">
        <Focusable
          onPress={onPress}
          className="rounded-md"
          focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
        >
          <Box className="h-24 w-16 overflow-hidden rounded-md bg-background">
            {poster ? (
              <Image
                source={{ uri: poster }}
                alt={title}
                resizeMode="cover"
                className="h-full w-full"
              />
            ) : null}
          </Box>
        </Focusable>
        <VStack className="flex-1">
          <Heading size="sm" className="text-foreground" numberOfLines={2}>
            {title}
          </Heading>
          <Text size="xs" className="mt-0.5 text-muted-foreground">
            Finished {formatFinishedAt(entry.finishedAt)}
          </Text>
        </VStack>

        <VStack space="xs" className="items-center">
          <Focusable
            onPress={onPlay}
            className="rounded-full bg-primary p-2"
            focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
          >
            <Icon as={Play} className="text-primary-foreground" />
          </Focusable>

          <Focusable
            onPress={onDelete}
            className="rounded-full bg-background/40 p-2"
            focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
          >
            <Icon as={Trash2} className="text-foreground" />
          </Focusable>
        </VStack>
      </HStack>
    </Box>
  );
};
