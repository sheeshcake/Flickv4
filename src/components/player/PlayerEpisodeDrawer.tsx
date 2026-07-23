import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { Center } from '@/components/ui/center';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Image } from '@/components/ui/image';
import { Text } from '@/components/ui/text';
import { Spinner } from '@/components/ui/spinner';
import { Focusable } from '@/src/components/Focusable';
import { useSeasonEpisodes } from '@/src/hooks/useDetailData';
import { TMDBService } from '@/src/services/TMDBService';
import type { Episode, MediaItem, Season, TVShowDetails } from '@/src/types';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

interface PlayerEpisodeDrawerProps {
  visible: boolean;
  item: MediaItem;
  currentSeason?: number;
  currentEpisode?: number;
  onSelect: (season: number, episode: Episode) => void;
  onClose: () => void;
}

/**
 * Right-side drawer used inside the player to switch season/episode for TV
 * shows. Loads seasons directly from TMDB (avoiding the heavy DetailData
 * fetch), reuses `useSeasonEpisodes` to load per-season episode lists.
 */
export const PlayerEpisodeDrawer = ({
  visible,
  item,
  currentSeason,
  currentEpisode,
  onSelect,
  onClose,
}: PlayerEpisodeDrawerProps) => {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonsLoading, setSeasonsLoading] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(
    currentSeason ?? null,
  );

  // Fetch season list once (per item). Filter specials (season_number 0).
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setSeasonsLoading(true);
    TMDBService.getTVShowDetails(item.id)
      .then((details: TVShowDetails) => {
        if (cancelled) return;
        const filtered = (details.seasons ?? []).filter(
          (s) => s.season_number > 0,
        );
        setSeasons(filtered);
        setSelectedSeason((prev) => {
          if (prev != null) return prev;
          if (currentSeason != null) return currentSeason;
          return filtered[0]?.season_number ?? null;
        });
      })
      .catch(() => {
        if (!cancelled) setSeasons([]);
      })
      .finally(() => {
        if (!cancelled) setSeasonsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, visible, currentSeason]);

  const { episodes, loading: episodesLoading } = useSeasonEpisodes(
    item.id,
    selectedSeason,
  );

  if (!visible) return null;

  return (
    <Box style={StyleSheet.absoluteFill} className="z-50">
      {/* Scrim: closes the drawer on tap. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Box className="h-full w-full bg-background/70" />
      </Pressable>

      <Box className="absolute bottom-0 right-0 top-0 w-[45%] bg-card">
        <HStack className="items-center justify-between px-4 py-3">
          <Heading size="md" className="text-foreground">
            Episodes
          </Heading>
          <Focusable
            onPress={onClose}
            className="rounded-full p-1"
            focusedClassName={`bg-primary ${TV_FOCUS_BORDER_CLASSNAME}`}
          >
            <Icon as={X} className="text-foreground" />
          </Focusable>
        </HStack>

        {/* Season chips */}
        <Box className="px-4 pb-2">
          {seasonsLoading && !seasons.length ? (
            <Center className="py-4">
              <Spinner color="#E50914" />
            </Center>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {seasons.map((season) => {
                const active = season.season_number === selectedSeason;
                return (
                  <Focusable
                    key={season.id}
                    onPress={() => setSelectedSeason(season.season_number)}
                    className={`rounded-full px-3 py-1.5 ${active ? 'bg-primary' : 'bg-secondary'}`}
                    focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
                  >
                    <Text
                      size="xs"
                      className={
                        active
                          ? 'text-primary-foreground'
                          : 'text-foreground'
                      }
                    >
                      {season.name}
                    </Text>
                  </Focusable>
                );
              })}
            </ScrollView>
          )}
        </Box>

        {/* Episode list */}
        <ScrollView className="flex-1 px-4 pb-6">
          {episodesLoading ? (
            <Center className="py-10">
              <Spinner color="#E50914" />
            </Center>
          ) : (
            <VStack space="md">
              {episodes.map((ep) => {
                const active =
                  currentSeason === ep.season_number &&
                  currentEpisode === ep.episode_number;
                const still = TMDBService.getImageUrl(ep.still_path, 'w300');
                return (
                  <Focusable
                    key={ep.id}
                    onPress={() => onSelect(ep.season_number, ep)}
                    className={`rounded-lg ${active ? 'border border-primary' : ''}`}
                    focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
                  >
                    <HStack space="sm" className="items-center">
                      <Box className="h-16 w-24 overflow-hidden rounded-md bg-background">
                        {still ? (
                          <Image
                            source={{ uri: still }}
                            alt={ep.name}
                            resizeMode="cover"
                            className="h-full w-full"
                          />
                        ) : (
                          <Center className="h-full w-full">
                            <Text
                              size="2xs"
                              className="text-muted-foreground"
                            >
                              {ep.episode_number}
                            </Text>
                          </Center>
                        )}
                      </Box>
                      <VStack className="flex-1">
                        <Text
                          size="sm"
                          className={
                            active
                              ? 'font-semibold text-foreground'
                              : 'text-foreground'
                          }
                          numberOfLines={1}
                        >
                          {ep.episode_number}. {ep.name}
                        </Text>
                        {!!ep.runtime && (
                          <Text
                            size="2xs"
                            className="text-muted-foreground"
                          >
                            {ep.runtime} min
                          </Text>
                        )}
                      </VStack>
                    </HStack>
                  </Focusable>
                );
              })}
              {!episodesLoading && !episodes.length && (
                <Text size="sm" className="py-4 text-muted-foreground">
                  No episodes for this season.
                </Text>
              )}
            </VStack>
          )}
        </ScrollView>
      </Box>
    </Box>
  );
};
