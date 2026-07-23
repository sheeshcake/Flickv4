import { useMemo, useState } from 'react';
import { Modal, StyleSheet } from 'react-native';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Download,
  Pause,
  Play,
} from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { Image } from '@/components/ui/image';
import { Icon } from '@/components/ui/icon';
import { Center } from '@/components/ui/center';
import { Spinner } from '@/components/ui/spinner';
import { Pressable } from '@/components/ui/pressable';
import { ScrollView } from '@/components/ui/scroll-view';
import { Focusable } from '@/src/components/Focusable';
import { TMDBService } from '@/src/services/TMDBService';
import { getComingSoon } from '@/src/utils/comingSoon';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';
import type { Episode, Season } from '@/src/types';

export type EpisodeDownloadState = {
  status: 'queued' | 'resolving' | 'downloading' | 'paused' | 'completed' | 'failed';
  /** 0..1 while downloading/paused. */
  progress?: number;
};

interface SeasonEpisodePickerProps {
  seasons: Season[];
  selectedSeason: number | null;
  onSelectSeason: (seasonNumber: number) => void;
  episodes: Episode[];
  loadingEpisodes: boolean;
  onPlayEpisode: (episode: Episode) => void;
  /** Kick off / act on the per-episode download for this episode row. */
  onDownloadEpisode?: (episode: Episode) => void;
  /** Live download state for the given episode; `undefined` renders "idle". */
  downloadStatusFor?: (episode: Episode) => EpisodeDownloadState | undefined;
}

export const SeasonEpisodePicker = ({
  seasons,
  selectedSeason,
  onSelectSeason,
  episodes,
  loadingEpisodes,
  onPlayEpisode,
  onDownloadEpisode,
  downloadStatusFor,
}: SeasonEpisodePickerProps) => {
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => seasons.find((s) => s.season_number === selectedSeason),
    [seasons, selectedSeason],
  );

  return (
    <VStack space="md" className="px-4">
      <Box>
        <Focusable
          onPress={() => setOpen(true)}
          className="flex-row items-center justify-between rounded-md border border-border bg-secondary px-4 py-3 w-50"
          focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
        >
          <Text className="font-semibold text-foreground">
            {selected?.name ?? 'Select season'}
          </Text>
          <Icon as={ChevronDown} className="text-foreground" />
        </Focusable>

        {/*
          Rendered as its own Modal (matching ConfirmDialog) rather than an
          absolute-positioned sibling: an inline overlay doesn't stop the TV
          focus engine from wandering into the rest of the (still-mounted)
          screen behind it, so D-pad "down" could escape the list before
          reaching the last season and the inner ScrollView would never get
          reliable focus-driven auto-scroll. A real Modal puts the list in
          its own native layer so it's the only focusable content while
          open, which lets the ScrollView scroll the focused row into view
          as expected.
        */}
        <Modal
          visible={open}
          transparent
          animationType="fade"
          onRequestClose={() => setOpen(false)}
        >
          <Box className="flex-1 bg-background/80" style={StyleSheet.absoluteFill}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setOpen(false)}
            />
            <Box className="flex-1 items-center justify-center px-6">
              <Box className="w-full max-w-sm rounded-2xl bg-card p-5 max-h-[30%]">
                <Heading size="md" bold className="mb-3 text-foreground">
                  Select season
                </Heading>
                <ScrollView showsVerticalScrollIndicator>
                  <VStack space="xs">
                    {seasons.map((season) => {
                      const active = season.season_number === selectedSeason;
                      return (
                        <Focusable
                          key={season.id}
                          hasTVPreferredFocus={active}
                          onPress={() => {
                            onSelectSeason(season.season_number);
                            setOpen(false);
                          }}
                          className={`rounded-md px-4 py-3 ${active ? 'bg-primary/20' : ''}`}
                          focusedClassName={`bg-primary ${TV_FOCUS_BORDER_CLASSNAME}`}
                        >
                          <Text
                            className={
                              active
                                ? 'font-semibold text-foreground'
                                : 'text-muted-foreground'
                            }
                          >
                            {season.name}
                            {season.episode_count != null
                              ? ` (${season.episode_count} episodes)`
                              : ''}
                          </Text>
                        </Focusable>
                      );
                    })}
                  </VStack>
                </ScrollView>
              </Box>
            </Box>
          </Box>
        </Modal>
      </Box>

      {loadingEpisodes ? (
        <Center className="py-10">
          <Spinner color="#E50914" />
        </Center>
      ) : (
        <VStack space="lg">
          {episodes.map((ep) => {
            const still = TMDBService.getImageUrl(ep.still_path, 'w300');
            const dl = downloadStatusFor?.(ep);
            // Unreleased episodes get a non-interactive row + "Coming {date}"
            // caption and no download button — there's no stream to fetch.
            const coming = getComingSoon({ releaseDate: ep.air_date });

            const info = (
              <HStack space="md" className="items-center">
                <Box className="h-20 w-32 overflow-hidden rounded-md bg-card">
                  {still ? (
                    <Image
                      source={{ uri: still }}
                      alt={ep.name}
                      resizeMode="cover"
                      className="h-full w-full"
                    />
                  ) : (
                    <Center className="h-full w-full">
                      <Icon as={Play} className="text-muted-foreground" />
                    </Center>
                  )}
                </Box>
                <VStack className="flex-1">
                  <Heading size="sm" className="text-foreground" numberOfLines={1}>
                    {ep.episode_number}. {ep.name}
                  </Heading>
                  {coming.comingSoon ? (
                    <Text size="xs" className="text-muted-foreground">
                      {coming.label}
                    </Text>
                  ) : (
                    !!ep.runtime && (
                      <Text size="xs" className="text-muted-foreground">
                        {ep.runtime} min
                      </Text>
                    )
                  )}
                  {!!ep.overview && (
                    <Text
                      size="xs"
                      className="mt-1 text-muted-foreground"
                      numberOfLines={2}
                    >
                      {ep.overview}
                    </Text>
                  )}
                </VStack>
              </HStack>
            );

            return (
              <HStack key={ep.id} space="md" className="items-center">
                {coming.comingSoon ? (
                  <Box className="flex-1 rounded-lg opacity-70">{info}</Box>
                ) : (
                  <Focusable
                    onPress={() => onPlayEpisode(ep)}
                    className="flex-1 rounded-lg"
                    focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
                  >
                    {info}
                  </Focusable>
                )}
                {onDownloadEpisode && !coming.comingSoon && (
                  <EpisodeDownloadButton
                    state={dl}
                    onPress={() => onDownloadEpisode(ep)}
                  />
                )}
              </HStack>
            );
          })}
        </VStack>
      )}
    </VStack>
  );
};

const EpisodeDownloadButton = ({
  state,
  onPress,
}: {
  state: EpisodeDownloadState | undefined;
  onPress: () => void;
}) => {
  const status = state?.status ?? 'idle';
  const pct =
    state?.progress != null ? Math.round(state.progress * 100) : undefined;

  let iconEl: React.ReactNode;
  let tint = 'text-foreground';
  if (status === 'idle') {
    iconEl = <Icon as={Download} className="text-foreground" />;
  } else if (status === 'queued' || status === 'resolving') {
    iconEl = <Spinner size="small" color="#E50914" />;
  } else if (status === 'downloading') {
    iconEl = <Spinner size="small" color="#E50914" />;
  } else if (status === 'paused') {
    iconEl = <Icon as={Pause} className="text-muted-foreground" />;
    tint = 'text-muted-foreground';
  } else if (status === 'completed') {
    iconEl = <Icon as={CheckCircle2} className="text-primary" />;
    tint = 'text-primary';
  } else {
    iconEl = <Icon as={AlertCircle} className="text-primary" />;
    tint = 'text-primary';
  }

  return (
    <Focusable
      onPress={onPress}
      className="items-center justify-center rounded-full p-2"
      focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
    >
      <VStack className="items-center">
        {iconEl}
        {pct != null && status === 'downloading' ? (
          <Text size="2xs" className={`mt-1 ${tint}`}>
            {pct}%
          </Text>
        ) : null}
      </VStack>
    </Focusable>
  );
};
