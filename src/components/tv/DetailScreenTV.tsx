import { useCallback } from 'react';
import {
  ImageBackground,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { ScrollView } from '@/components/ui/scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  Play,
  Plus,
  Share2,
} from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { Center } from '@/components/ui/center';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { Image } from '@/components/ui/image';
import { Spinner } from '@/components/ui/spinner';
import { Button, ButtonIcon, ButtonText } from '@/components/ui/button';
import { Focusable } from '@/src/components/Focusable';
import { ContentCard } from '@/src/components/ContentCard';
import { SeasonEpisodePicker } from '@/src/components/SeasonEpisodePicker';
import {
  DownloadQualitySheet,
  type DownloadQualityChoice,
} from '@/src/components/DownloadQualitySheet';
import {
  ActionIcon,
  MovieDownloadButton,
  TabButton,
  type Tab,
} from '@/src/screens/DetailScreen';
import type { EpisodeDownloadState } from '@/src/components/SeasonEpisodePicker';
import type { ComingSoonResult } from '@/src/utils/comingSoon';
import type { DownloadJob } from '@/src/services/DownloadService';
import type { Variant } from '@/src/utils/hlsVariants';
import { getGridColumns } from '@/src/utils/responsive';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';
import {
  getTitle,
  type CastMember,
  type Episode,
  type MediaItem,
  type Season,
} from '@/src/types';

interface DetailScreenTVProps {
  item: MediaItem;
  movie: boolean;
  coming: ComingSoonResult;
  typeLabel: string;
  starring: string;
  creators: string;
  cast: CastMember[];
  year: number | string;
  certification?: string | null;
  logoUrl?: string | null;
  backdrop?: string | null;
  onBack: () => void;
  onPlay: (opts?: { season?: number; episode?: number; label?: string }) => void;
  onShare: () => void;
  isInList: (item: MediaItem) => boolean;
  onToggleList: (item: MediaItem) => void;
  movieJob?: DownloadJob;
  moviePct: number;
  resolvingDownload: boolean;
  onDownloadMovie: () => void;
  onPauseMovie: () => void;
  onResumeMovie: () => void;
  onPlayLocalMovie: () => void;
  onDeleteLocalMovie: () => void;
  tab: Tab;
  setTab: (tab: Tab) => void;
  loading: boolean;
  error: string | null;
  seasons: Season[];
  selectedSeason: number | null;
  onSelectSeason: (season: number) => void;
  episodes: Episode[];
  loadingEpisodes: boolean;
  firstEpisode?: Episode;
  onDownloadEpisode: (episode: Episode) => void;
  episodeDownloadStatus: (episode: Episode) => EpisodeDownloadState | undefined;
  similarItems: MediaItem[];
  similarLoadingMore: boolean;
  onLoadMoreSimilar: () => void;
  onPressSimilar: (item: MediaItem) => void;
  qualitySheet: {
    variants: Variant[];
    onSelect: (choice: DownloadQualityChoice) => void;
  } | null;
  onCloseQualitySheet: () => void;
}

/**
 * TV-only Detail screen: same data/handlers as the phone `DetailScreen`, just
 * laid out for the 10-foot experience — a taller cinematic hero, a
 * horizontal action row instead of stacked full-width buttons, and text
 * constrained to a readable column instead of stretching edge-to-edge.
 */
export const DetailScreenTV = ({
  item,
  movie,
  coming,
  typeLabel,
  starring,
  creators,
  year,
  certification,
  logoUrl,
  backdrop,
  onBack,
  onPlay,
  onShare,
  isInList,
  onToggleList,
  movieJob,
  moviePct,
  resolvingDownload,
  onDownloadMovie,
  onPauseMovie,
  onResumeMovie,
  onPlayLocalMovie,
  onDeleteLocalMovie,
  tab,
  setTab,
  loading,
  error,
  seasons,
  selectedSeason,
  onSelectSeason,
  episodes,
  loadingEpisodes,
  firstEpisode,
  onDownloadEpisode,
  episodeDownloadStatus,
  similarItems,
  similarLoadingMore,
  onLoadMoreSimilar,
  onPressSimilar,
  qualitySheet,
  onCloseQualitySheet,
}: DetailScreenTVProps) => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const heroHeight = height * 0.5;
  const contentPadding = 64;

  const columns = getGridColumns('tv');
  const gridGap = 20;
  const similarCardWidth =
    (width - contentPadding * 3 - gridGap * (columns - 1)) / columns;

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (tab !== 'similar') return;
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      const distanceToEnd =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      if (distanceToEnd < 400) onLoadMoreSimilar();
    },
    [tab, onLoadMoreSimilar],
  );

  return (
    <Box className="flex-1 bg-background">
      <ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {/* Hero */}
        <Box style={{ height: heroHeight }} className="w-full">
          <ImageBackground
            source={{ uri: backdrop ?? undefined }}
            resizeMode="cover"
            style={{ flex: 1, justifyContent: 'flex-end' }}
          >
            <LinearGradient
              colors={['rgba(0,0,0,0.35)', 'transparent', 'rgba(0,0,0,1)']}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
              }}
              pointerEvents="none"
            />
            <Focusable
              onPress={onBack}
              className="absolute rounded-full bg-background/60 p-3"
              focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
              style={{ top: insets.top + 24, left: contentPadding }}
            >
              <Icon as={ArrowLeft} size="xl" className="text-foreground" />
            </Focusable>

            <VStack
              space="sm"
              style={{ paddingHorizontal: contentPadding, paddingBottom: 40, maxWidth: 900 }}
            >
              {logoUrl ? (
                <Image
                  source={{ uri: logoUrl }}
                  alt={getTitle(item)}
                  resizeMode="contain"
                  className="h-24 w-full"
                  style={{ alignSelf: 'flex-start' }}
                />
              ) : (
                <Heading size="4xl" bold className="text-foreground" numberOfLines={2}>
                  {getTitle(item)}
                </Heading>
              )}

              <HStack space="sm" className="items-center">
                {!!year && (
                  <Text size="md" className="text-muted-foreground">
                    {year}
                  </Text>
                )}
                {!!certification && (
                  <Box className="rounded-sm border border-muted-foreground px-1.5 py-0.5">
                    <Text size="sm" className="text-muted-foreground">
                      {certification}
                    </Text>
                  </Box>
                )}
                <Text size="md" className="text-muted-foreground">
                  {typeLabel}
                </Text>
              </HStack>
            </VStack>
          </ImageBackground>
        </Box>

        {/* Actions + metadata */}
        <VStack space="lg" style={{ paddingHorizontal: contentPadding }} className="mt-6">
          <HStack space="md" className="items-center">
            {coming.comingSoon ? (
              <Button size="lg" className="w-64 bg-secondary" isDisabled>
                <ButtonIcon as={CalendarClock} className="text-secondary-foreground" />
                <ButtonText className="text-secondary-foreground">
                  {coming.label}
                </ButtonText>
              </Button>
            ) : (
              <Button
                size="lg"
                className="w-64 bg-foreground"
                hasTVPreferredFocus
                onPress={() =>
                  onPlay(
                    !movie && selectedSeason != null && firstEpisode
                      ? {
                          season: selectedSeason,
                          episode: firstEpisode.episode_number,
                          label: `${getTitle(item)} — ${firstEpisode.name}`,
                        }
                      : undefined,
                  )
                }
              >
                <ButtonIcon as={Play} className="text-background" />
                <ButtonText className="text-background">Play</ButtonText>
              </Button>
            )}

            {movie && !coming.comingSoon && (
              <Box style={{ width: 260 }}>
                <MovieDownloadButton
                  status={movieJob?.status}
                  progress={moviePct}
                  resolving={resolvingDownload}
                  onDownload={onDownloadMovie}
                  onPause={onPauseMovie}
                  onResume={onResumeMovie}
                  onPlayLocal={onPlayLocalMovie}
                  onDelete={onDeleteLocalMovie}
                />
              </Box>
            )}

            <ActionIcon
              icon={isInList(item) ? Check : Plus}
              label="My List"
              onPress={() => onToggleList(item)}
            />
            <ActionIcon icon={Share2} label="Share" onPress={onShare} />
          </HStack>

          <VStack space="sm" style={{ maxWidth: 720 }}>
            <Text className="text-foreground">{item.overview}</Text>

            {!!starring && (
              <Text size="sm" className="text-muted-foreground">
                <Text size="sm" className="text-muted-foreground">
                  Starring:{' '}
                </Text>
                <Text size="sm" className="text-foreground">
                  {starring}
                </Text>
              </Text>
            )}

            {!!creators && (
              <Text size="sm" className="text-muted-foreground">
                {movie ? 'Director' : 'Creators'}:{' '}
                <Text size="sm" className="text-foreground">
                  {creators}
                </Text>
              </Text>
            )}
          </VStack>
        </VStack>

        {/* Tabs */}
        <HStack
          space="xl"
          className="mt-8 border-b border-border"
          style={{ paddingHorizontal: contentPadding }}
        >
          {!movie && (
            <TabButton
              label="Episodes"
              active={tab === 'episodes'}
              onPress={() => setTab('episodes')}
            />
          )}
          <TabButton
            label="More Like This"
            active={tab === 'similar'}
            onPress={() => setTab('similar')}
          />
        </HStack>

        <Box className="mt-6" style={{ paddingBottom: insets.bottom + 40 }}>
          {loading && (
            <Center className="py-10">
              <Spinner size="large" color="#E50914" />
            </Center>
          )}

          {!loading && error && (
            <Center className="py-10 px-8">
              <Text className="text-center text-muted-foreground">{error}</Text>
            </Center>
          )}

          {!loading && !error && tab === 'episodes' && !movie && (
            <SeasonEpisodePicker
              seasons={seasons}
              selectedSeason={selectedSeason}
              onSelectSeason={onSelectSeason}
              episodes={episodes}
              loadingEpisodes={loadingEpisodes}
              onPlayEpisode={(ep: Episode) =>
                onPlay({
                  season: ep.season_number,
                  episode: ep.episode_number,
                  label: `${getTitle(item)} — ${ep.name}`,
                })
              }
              onDownloadEpisode={onDownloadEpisode}
              downloadStatusFor={episodeDownloadStatus}
            />
          )}

          {!loading && !error && tab === 'similar' && (
            <VStack space="md" style={{ paddingHorizontal: contentPadding }}>
              <Box className="flex-row flex-wrap" style={{ gap: gridGap }}>
                {similarItems.map((i) => (
                  <ContentCard
                    key={`${i.media_type ?? ''}-${i.id}`}
                    item={i}
                    width={similarCardWidth}
                    onPress={onPressSimilar}
                  />
                ))}
              </Box>
              {similarItems.length === 0 && (
                <Center className="py-10 px-8">
                  <Text className="text-center text-muted-foreground">
                    Nothing similar found.
                  </Text>
                </Center>
              )}
              {similarLoadingMore && (
                <Center className="py-4">
                  <Spinner color="#E50914" />
                </Center>
              )}
            </VStack>
          )}
        </Box>
      </ScrollView>

      <DownloadQualitySheet
        visible={qualitySheet != null}
        variants={qualitySheet?.variants ?? []}
        onSelect={(choice) => qualitySheet?.onSelect(choice)}
        onClose={onCloseQualitySheet}
      />
    </Box>
  );
};
