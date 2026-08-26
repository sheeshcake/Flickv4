import { useEffect, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import {
  Baby,
  Clapperboard,
  Compass,
  Drama,
  Ghost,
  Heart,
  Landmark,
  Laugh,
  Music,
  Newspaper,
  Rocket,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Tv,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { Focusable } from '@/src/components/Focusable';
import { TMDBService } from '@/src/services/TMDBService';
import { useCatalogRegion } from '@/src/hooks/useCatalogRegion';
import type { CategoryQuery } from '@/src/services/categories';
import type { Genre } from '@/src/types';
import type { DeviceKind } from '@/src/utils/responsive';
import { getHorizontalPadding } from '@/src/utils/responsive';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

type GenreKind = 'movie' | 'tv';

interface GenreGridProps {
  deviceKind: DeviceKind;
  onSelect: (title: string, query: CategoryQuery) => void;
}

const ICON_BY_NAME: Record<string, LucideIcon> = {
  action: Swords,
  'action & adventure': Swords,
  adventure: Compass,
  animation: Sparkles,
  comedy: Laugh,
  crime: Shield,
  documentary: Landmark,
  drama: Drama,
  family: Users,
  fantasy: Sparkles,
  history: Landmark,
  horror: Ghost,
  music: Music,
  mystery: Skull,
  romance: Heart,
  'science fiction': Rocket,
  'sci-fi & fantasy': Rocket,
  thriller: Skull,
  war: Swords,
  'war & politics': Swords,
  western: Landmark,
  kids: Baby,
  news: Newspaper,
  reality: Tv,
  soap: Drama,
  talk: Newspaper,
  'tv movie': Clapperboard,
};

const iconFor = (name: string): LucideIcon =>
  ICON_BY_NAME[name.trim().toLowerCase()] ?? Clapperboard;

export const GenreGrid = ({ deviceKind, onSelect }: GenreGridProps) => {
  const padding = getHorizontalPadding(deviceKind);
  const { region } = useCatalogRegion();
  const [kind, setKind] = useState<GenreKind>('movie');
  const [movieGenres, setMovieGenres] = useState<Genre[]>([]);
  const [tvGenres, setTvGenres] = useState<Genre[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([TMDBService.getMovieGenres(), TMDBService.getTVGenres()])
      .then(([movies, tv]) => {
        if (cancelled) return;
        setMovieGenres(movies.genres ?? []);
        setTvGenres(tv.genres ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const genres = kind === 'movie' ? movieGenres : tvGenres;
  const columns = useMemo(() => {
    const cols: Genre[][] = [];
    for (let i = 0; i < genres.length; i += 2) {
      cols.push(genres.slice(i, i + 2));
    }
    return cols;
  }, [genres]);

  if (!movieGenres.length && !tvGenres.length) return null;

  return (
    <Box className="mb-6">
      <HStack
        className="mb-3 items-center justify-between"
        style={{ paddingHorizontal: padding }}
      >
        <Heading size="md" className="text-foreground">
          Genres
        </Heading>
        <HStack space="sm">
          <Focusable
            onPress={() => setKind('movie')}
            className={`rounded-full px-3 py-1 ${
              kind === 'movie'
                ? 'border border-primary/40 bg-primary/20'
                : 'border border-border bg-card'
            }`}
            focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
          >
            <Text
              size="sm"
              className={
                kind === 'movie'
                  ? 'font-semibold text-foreground'
                  : 'text-muted-foreground'
              }
            >
              Movies
            </Text>
          </Focusable>
          <Focusable
            onPress={() => setKind('tv')}
            className={`rounded-full px-3 py-1 ${
              kind === 'tv'
                ? 'border border-primary/40 bg-primary/20'
                : 'border border-border bg-card'
            }`}
            focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
          >
            <Text
              size="sm"
              className={
                kind === 'tv'
                  ? 'font-semibold text-foreground'
                  : 'text-muted-foreground'
              }
            >
              TV
            </Text>
          </Focusable>
        </HStack>
      </HStack>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: padding,
          gap: 8,
          flexDirection: 'row',
        }}
      >
        {columns.map((col, colIndex) => (
          <VStack key={`col-${colIndex}`} space="sm" className="w-44">
            {col.map((genre) => (
              <Focusable
                key={genre.id}
                onPress={() =>
                  onSelect(genre.name, {
                    kind: kind === 'movie' ? 'genreMovie' : 'genreTv',
                    genreId: genre.id,
                    region,
                  })
                }
                className="rounded-xl border border-border bg-card px-3 py-3"
                focusedClassName={`bg-primary/20 ${TV_FOCUS_BORDER_CLASSNAME}`}
              >
                <HStack space="sm" className="items-center">
                  <Box className="h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
                    <Icon
                      as={iconFor(genre.name)}
                      size="sm"
                      className="text-primary"
                    />
                  </Box>
                  <Text
                    size="sm"
                    className="flex-1 text-foreground"
                    numberOfLines={1}
                  >
                    {genre.name}
                  </Text>
                </HStack>
              </Focusable>
            ))}
          </VStack>
        ))}
      </ScrollView>
    </Box>
  );
};
