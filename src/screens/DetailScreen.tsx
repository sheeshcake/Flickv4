import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ImageBackground,
  Share,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  runOnJS,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  Check,
  Download,
  Play,
  Plus,
  RefreshCw,
  Share2,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react-native';
import {
  DownloadQualitySheet,
  type DownloadQualityChoice,
} from '@/src/components/DownloadQualitySheet';
import { CastSheet } from '@/src/components/CastSheet';
import { useDownloads } from '@/src/hooks/useDownloads';
import { useServers } from '@/src/hooks/useServers';
import { useSubtitleSettings } from '@/src/hooks/useSubtitleSettings';
import { DownloadService } from '@/src/services/DownloadService';
import { fetchHlsVariants, type Variant } from '@/src/utils/hlsVariants';
import { playbackHeadersFor } from '@/src/services/MovieboxService';
import { ensureDownloadPermissions } from '@/src/utils/downloadPermissions';
import { getComingSoon } from '@/src/utils/comingSoon';
import type { EpisodeDownloadState } from '@/src/components/SeasonEpisodePicker';
import { Box } from '@/components/ui/box';
import { Center } from '@/components/ui/center';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { Image } from '@/components/ui/image';
import { Spinner } from '@/components/ui/spinner';
import {
  Button,
  ButtonText,
  ButtonIcon,
  ButtonSpinner,
} from '@/components/ui/button';
import { TrailerWebView } from '@/src/components/TrailerWebView';
import { ContentCard } from '@/src/components/ContentCard';
import { getGridColumns } from '@/src/utils/responsive';
import { SeasonEpisodePicker } from '@/src/components/SeasonEpisodePicker';
import { Focusable } from '@/src/components/Focusable';
import { useDetailData, useSeasonEpisodes } from '@/src/hooks/useDetailData';
import { useMyList } from '@/src/hooks/useMyList';
import { useDeviceKind } from '@/src/hooks/useDeviceKind';
import { TMDBService } from '@/src/services/TMDBService';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';
import { DetailScreenTV } from '@/src/components/tv/DetailScreenTV';
import {
  getReleaseDate,
  getTitle,
  isMovie,
  type Episode,
  type MediaItem,
  type TVShowDetails,
  type VideoResult,
} from '@/src/types';
import { PartyLobbyModal } from '@/src/components/party/PartyLobbyModal';
import { WatchPartyIntroModal } from '@/src/components/party/WatchPartyIntroModal';
import { partyContentFromItem } from '@/src/party/content';
import { useWatchParty } from '@/src/hooks/useWatchParty';
import type { RootStackScreenProps } from '@/src/navigation/types';

const AnimatedBox = Animated.createAnimatedComponent(Box);

export type Tab = 'episodes' | 'trailers' | 'similar';

export const DetailScreen = ({
  route,
  navigation,
}: RootStackScreenProps<'Detail'>) => {
  const { item } = route.params;
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const deviceKind = useDeviceKind();
  const movie = isMovie(item);

  const {
    loading,
    error,
    details,
    trailerKey,
    videos,
    similar,
    seasons,
    cast,
    crew,
    certification,
    logoPath,
  } = useDetailData(item);
  const { isInList, toggle } = useMyList();
  const { activeServer } = useServers();
  const { enqueue, getJobFor, resume, remove, pause } = useDownloads();
  const { settings: subtitleSettings } = useSubtitleSettings();

  const { enabled: partyEnabled } = useWatchParty();
  const [partyOpen, setPartyOpen] = useState(false);
  const [partyIntroOpen, setPartyIntroOpen] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  // TV has no "Trailers & More" tab (see DetailScreenTV), so a TV movie
  // defaults straight to "More Like This" instead of a tab that doesn't
  // exist there.
  const [tab, setTab] = useState<Tab>(
    movie ? (deviceKind === 'tv' ? 'similar' : 'trailers') : 'episodes',
  );
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState(false);
  const [castSheetOpen, setCastSheetOpen] = useState(false);
  const [qualitySheet, setQualitySheet] = useState<{
    variants: Variant[];
    onSelect: (choice: DownloadQualityChoice) => void;
  } | null>(null);
  const [resolvingDownload, setResolvingDownload] = useState(false);
  /**
   * Which season/episode is currently being resolved (WebView scrape phase,
   * before the job actually lands in DownloadService). `null` for movies /
   * when nothing is resolving. Lets us show a spinner on the correct
   * per-episode Download button in `SeasonEpisodePicker`.
   */
  const [resolvingEpisodeKey, setResolvingEpisodeKey] = useState<
    string | null
  >(null);
  const { episodes, loading: loadingEpisodes } = useSeasonEpisodes(
    item.id,
    selectedSeason,
  );

  useEffect(() => {
    if (!movie && seasons.length && selectedSeason == null) {
      setSelectedSeason(seasons[0].season_number);
    }
  }, [movie, seasons, selectedSeason]);

  const year = (() => {
    const d = getReleaseDate(item);
    return d ? new Date(d).getFullYear() : '';
  })();

  /**
   * Detect whether this title is still upcoming (future release date or a
   * TMDB status like "Planned" / "In Production" / etc). When true, the main
   * Play button is replaced with a disabled "Coming {date}" state and the
   * download affordance is hidden — there's nothing playable yet.
   */
  const coming = useMemo(
    () =>
      getComingSoon({
        releaseDate: getReleaseDate(item),
        status: (details as { status?: string } | null)?.status,
      }),
    [item, details],
  );

  const typeLabel = useMemo(() => {
    if (movie) return 'Movie';
    const tv = details as TVShowDetails | null;
    if (tv?.type === 'Miniseries' || tv?.number_of_seasons === 1) {
      return 'Limited Series';
    }
    return 'TV Series';
  }, [movie, details]);

  const starring = useMemo(() => {
    const names = cast.slice(0, 4).map((c) => c.name);
    return names.join(', ');
  }, [cast]);

  const creators = useMemo(() => {
    if (!movie) {
      const tv = details as TVShowDetails | null;
      const fromCreated = tv?.created_by?.map((c) => c.name) ?? [];
      if (fromCreated.length) return fromCreated.slice(0, 3).join(', ');
    }
    return crew
      .filter((c) => c.job === 'Director' || c.job === 'Creator')
      .slice(0, 3)
      .map((c) => c.name)
      .join(', ');
  }, [movie, details, crew]);

  const firstEpisode = episodes[0];

  const play = (opts?: {
    season?: number;
    episode?: number;
    label?: string;
  }) => {
    navigation.navigate('Player', {
      item,
      title: opts?.label ?? getTitle(item),
      season: opts?.season,
      episode: opts?.episode,
      subtitle:
        opts?.season != null && opts?.episode != null
          ? `S${opts.season} E${opts.episode}`
          : undefined,
    });
  };

  const onShare = async () => {
    try {
      await Share.share({
        message: `Watch ${getTitle(item)} on Flick`,
      });
    } catch {
      // ignored
    }
  };

  /**
   * Kick off a download by (a) resolving the stream URL via the hidden
   * WebViewScraper, (b) fetching the HLS variant list, then (c) presenting
   * the mandatory quality sheet.
   */
  const beginDownload = useCallback(
    async (opts: { season?: number; episode?: number; title: string }) => {
      if (resolvingDownload) return;
      // Ask (or re-ask) for notification permission before we start scraping.
      // The user may have denied it on first launch — this gives them another
      // chance the moment they actually try to download something.
      await ensureDownloadPermissions();
      setResolvingDownload(true);
      if (opts.season != null && opts.episode != null) {
        setResolvingEpisodeKey(`s${opts.season}e${opts.episode}`);
      }
      try {
        const stream = await DownloadService.resolveStream({
          baseUrl: activeServer.url,
          tmdbId: item.id,
          type: movie ? 'movie' : 'tv',
          season: opts.season,
          episode: opts.episode,
          title: getTitle(item),
          resolver: activeServer.resolver,
        });

        const headers = playbackHeadersFor(activeServer);
        const variants = stream.videoUrl.includes('.m3u8')
          ? await fetchHlsVariants(stream.videoUrl, headers)
          : [];

        setQualitySheet({
          variants,
          onSelect: (choice) => {
            // If the user picked a specific HLS variant, hand its child
            // playlist to the service so it downloads exactly that ladder
            // rung. Otherwise reuse the master URL (or the direct MP4 URL
            // for non-HLS streams) so the service doesn't re-resolve.
            const chosenVariant = variants.find(
              (v) => v.height === choice.height,
            );
            const streamUri = chosenVariant?.uri ?? stream.videoUrl;
            void enqueue(item, {
              serverUrl: activeServer.url,
              qualityHeight: choice.height,
              qualityLabel: choice.label,
              season: opts.season,
              episode: opts.episode,
              title: opts.title,
              streamUri,
              subtitleLanguage: subtitleSettings.defaultLanguage || undefined,
              resolver: activeServer.resolver,
            });
          },
        });
      } catch (e) {
        Alert.alert(
          'Download failed',
          e instanceof Error ? e.message : 'Unable to find stream',
        );
      } finally {
        setResolvingDownload(false);
        setResolvingEpisodeKey(null);
      }
    },
    [
      resolvingDownload,
      activeServer,
      item,
      movie,
      enqueue,
      subtitleSettings.defaultLanguage,
    ],
  );

  const onDownloadMovie = useCallback(() => {
    void beginDownload({ title: getTitle(item) });
  }, [beginDownload, item]);

  // Movie download state: a single active job per movie (keyed on qualityHeight
  // internally, but we only surface the first match to the user here).
  const movieJob = movie ? getJobFor(item) : undefined;
  const moviePct = movieJob
    ? movieJob.totalSegments > 0
      ? Math.round(
          (movieJob.completedSegments / movieJob.totalSegments) * 100,
        )
      : movieJob.totalBytes > 0
        ? Math.round((movieJob.bytesWritten / movieJob.totalBytes) * 100)
        : 0
    : 0;

  const onPauseMovie = useCallback(() => {
    if (movieJob) void pause(movieJob.id);
  }, [movieJob, pause]);

  const onResumeMovie = useCallback(() => {
    if (movieJob) void resume(movieJob.id, activeServer.url);
  }, [movieJob, resume, activeServer.url]);

  const onPlayLocalMovie = useCallback(() => {
    if (!movieJob) return;
    navigation.navigate('Player', {
      item,
      title: getTitle(item),
      localSourceId: movieJob.id,
    });
  }, [movieJob, item, navigation]);

  const onDeleteLocalMovie = useCallback(() => {
    if (!movieJob) return;
    Alert.alert(
      'Delete download?',
      `Remove the local copy of ${getTitle(item)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void remove(movieJob.id);
          },
        },
      ],
    );
  }, [movieJob, item, remove]);

  const onDownloadEpisode = useCallback(
    (ep: Episode) => {
      const existing = getJobFor(item, ep.season_number, ep.episode_number);
      if (existing) {
        if (existing.status === 'paused' || existing.status === 'failed') {
          void resume(existing.id, activeServer.url);
          return;
        }
        if (existing.status === 'completed') {
          Alert.alert(
            'Downloaded',
            `S${ep.season_number} E${ep.episode_number} is already saved. Delete the local copy?`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  void remove(existing.id);
                },
              },
            ],
          );
          return;
        }
        // downloading / queued / resolving — no-op tap.
        return;
      }
      void beginDownload({
        season: ep.season_number,
        episode: ep.episode_number,
        title: `${getTitle(item)} — S${ep.season_number} E${ep.episode_number}`,
      });
    },
    [beginDownload, getJobFor, item, resume, remove, activeServer.url],
  );

  const episodeDownloadStatus = useCallback(
    (ep: Episode): EpisodeDownloadState | undefined => {
      // Show the resolving spinner while the WebViewScraper is still hunting
      // for a stream URL (before the job is even queued).
      if (
        resolvingEpisodeKey ===
        `s${ep.season_number}e${ep.episode_number}`
      ) {
        return { status: 'resolving' };
      }
      const job = getJobFor(item, ep.season_number, ep.episode_number);
      if (!job) return undefined;
      const progress =
        job.totalSegments > 0
          ? job.completedSegments / job.totalSegments
          : undefined;
      return { status: job.status, progress };
    },
    [getJobFor, item, resolvingEpisodeKey],
  );

  const heroHeight = deviceKind === 'phone' ? height * 0.30 : height * 0.30;
  const backdrop = TMDBService.getImageUrl(
    item.backdrop_path ?? item.poster_path,
    'w780',
  );
  const logoUrl = TMDBService.getImageUrl(logoPath, 'w500');
  const showTrailer = false;

  const youtubeVideos = videos.filter((v) => v.site === 'YouTube');

  // "More Like This" grid with infinite scroll. Seeded from page 1 (`similar`),
  // more pages are appended as the user scrolls to the bottom.
  const [similarItems, setSimilarItems] = useState<MediaItem[]>([]);
  const [similarPage, setSimilarPage] = useState(1);
  const [similarLoadingMore, setSimilarLoadingMore] = useState(false);
  const [similarHasMore, setSimilarHasMore] = useState(true);

  useEffect(() => {
    setSimilarItems(similar);
    setSimilarPage(1);
    setSimilarHasMore(similar.length > 0);
  }, [similar]);

  const loadMoreSimilar = useCallback(async () => {
    if (similarLoadingMore || !similarHasMore) return;
    setSimilarLoadingMore(true);
    const nextPage = similarPage + 1;
    try {
      let tagged: MediaItem[];
      let page: number;
      let totalPages: number;
      if (movie) {
        const res = await TMDBService.getSimilarMovies(item.id, nextPage);
        tagged = res.results.map((r) => ({ ...r, media_type: 'movie' as const }));
        page = res.page;
        totalPages = res.total_pages;
      } else {
        const res = await TMDBService.getSimilarTVShows(item.id, nextPage);
        tagged = res.results.map((r) => ({ ...r, media_type: 'tv' as const }));
        page = res.page;
        totalPages = res.total_pages;
      }
      setSimilarItems((prev) => {
        const seen = new Set(prev.map((p) => `${p.media_type}-${p.id}`));
        const fresh = tagged.filter((t) => !seen.has(`${t.media_type}-${t.id}`));
        return [...prev, ...fresh];
      });
      setSimilarPage(nextPage);
      setSimilarHasMore(page < totalPages);
    } catch {
      setSimilarHasMore(false);
    } finally {
      setSimilarLoadingMore(false);
    }
  }, [movie, item.id, similarPage, similarLoadingMore, similarHasMore]);

  const columns = getGridColumns(deviceKind);
  const gridPadding = 16;
  const gridGap = 12;
  const similarCardWidth =
    (width - gridPadding * 2 - gridGap * (columns - 1)) / columns;

  const handlePaginationScroll = useCallback(
    (offsetY: number, layoutHeight: number, contentHeight: number) => {
      if (tab !== 'similar') return;
      const distanceToEnd = contentHeight - (offsetY + layoutHeight);
      if (distanceToEnd < 400) loadMoreSimilar();
    },
    [tab, loadMoreSimilar],
  );

  // Sticky back button + scroll-revealed title header: `scrollY` mirrors the
  // ScrollView's offset, `titleY` is the (one-time, via onLayout) content
  // offset of the logo/title block below the hero — once `scrollY` passes
  // it, the sticky header's title fades in and gains a solid backdrop.
  const scrollY = useSharedValue(0);
  const titleY = useSharedValue(Number.MAX_SAFE_INTEGER);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
    runOnJS(handlePaginationScroll)(
      event.contentOffset.y,
      event.layoutMeasurement.height,
      event.contentSize.height,
    );
  });
  const onTitleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      titleY.value = e.nativeEvent.layout.y;
    },
    [titleY],
  );
  const headerProgressStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      scrollY.value,
      [titleY.value - 40, titleY.value],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return { opacity: progress };
  });
  const headerTitleStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      scrollY.value,
      [titleY.value - 40, titleY.value],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity: progress,
      transform: [{ translateY: interpolate(progress, [0, 1], [8, 0]) }],
    };
  });

  if (deviceKind === 'tv') {
    return (
      <>
      <DetailScreenTV
        item={item}
        movie={movie}
        coming={coming}
        typeLabel={typeLabel}
        starring={starring}
        creators={creators}
        cast={cast}
        year={year}
        certification={certification}
        logoUrl={logoUrl}
        backdrop={backdrop}
        onBack={() => navigation.goBack()}
        onPlay={play}
        onShare={onShare}
        onStartParty={partyEnabled && !coming.comingSoon ? () => setPartyIntroOpen(true) : undefined}
        isInList={isInList}
        onToggleList={toggle}
        movieJob={movieJob}
        moviePct={moviePct}
        resolvingDownload={resolvingDownload}
        onDownloadMovie={onDownloadMovie}
        onPauseMovie={onPauseMovie}
        onResumeMovie={onResumeMovie}
        onPlayLocalMovie={onPlayLocalMovie}
        onDeleteLocalMovie={onDeleteLocalMovie}
        tab={tab}
        setTab={setTab}
        loading={loading}
        error={error}
        seasons={seasons}
        selectedSeason={selectedSeason}
        onSelectSeason={setSelectedSeason}
        episodes={episodes}
        loadingEpisodes={loadingEpisodes}
        firstEpisode={firstEpisode}
        onDownloadEpisode={onDownloadEpisode}
        episodeDownloadStatus={episodeDownloadStatus}
        similarItems={similarItems}
        similarLoadingMore={similarLoadingMore}
        onLoadMoreSimilar={loadMoreSimilar}
        onPressSimilar={(picked) => navigation.push('Detail', { item: picked })}
        qualitySheet={qualitySheet}
        onCloseQualitySheet={() => setQualitySheet(null)}
      />
      <WatchPartyIntroModal
        visible={partyIntroOpen}
        onContinue={() => {
          setPartyIntroOpen(false);
          setPartyOpen(true);
        }}
        onDismiss={() => setPartyIntroOpen(false)}
      />
      <PartyLobbyModal
        visible={partyOpen}
        content={
          partyOpen
            ? partyContentFromItem(
                item,
                movie ? undefined : selectedSeason ?? undefined,
                movie ? undefined : firstEpisode?.episode_number,
              )
            : null
        }
        onPlayTogether={() => {
          setPartyOpen(false);
          play(
            !movie && selectedSeason != null && firstEpisode
              ? {
                  season: selectedSeason,
                  episode: firstEpisode.episode_number,
                  label: `${getTitle(item)} — ${firstEpisode.name}`,
                }
              : undefined,
          );
        }}
        onClose={() => setPartyOpen(false)}
      />
    </>
    );
  }

  return (
    <Box className="flex-1 bg-background">
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {/* Hero */}
        <Box style={{ height: heroHeight }} className="w-full">
          {showTrailer ? (
            <TrailerWebView
              youtubeKey={trailerKey!}
              preview
              muted={muted}
            />
          ) : (
            <ImageBackground
              source={{ uri: backdrop }}
              resizeMode="cover"
              style={{ flex: 1 }}
            />
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.4)', 'transparent', 'rgba(0,0,0,1)']}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
            }}
            pointerEvents="none"
          />
          {showTrailer && (
            <Focusable
              onPress={() => setMuted((m) => !m)}
              className="absolute bottom-4 right-4 rounded-full bg-background/60 p-2"
              focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
            >
              <Icon
                as={muted ? VolumeX : Volume2}
                className="text-foreground"
              />
            </Focusable>
          )}
        </Box>

        {/* Metadata + actions */}
        <VStack space="md" className="-mt-8 px-4" onLayout={onTitleLayout}>
          {logoUrl ? (
            <Image
              source={{ uri: logoUrl }}
              alt={getTitle(item)}
              resizeMode="contain"
              className="h-20 w-50"
              style={{ width: '80%', alignSelf: 'flex-start' }}
            />
          ) : (
            <Heading size="3xl" bold className="text-foreground">
              {getTitle(item)}
            </Heading>
          )}

          <HStack space="sm" className="flex-wrap items-center">
            {!!year && (
              <Text size="sm" className="text-muted-foreground">
                {year}
              </Text>
            )}
            {!!certification && (
              <Box className="rounded-sm border border-muted-foreground px-1.5 py-0.5">
                <Text size="xs" className="text-muted-foreground">
                  {certification}
                </Text>
              </Box>
            )}
            <Text size="sm" className="text-muted-foreground">
              {typeLabel}
            </Text>
          </HStack>

          {/* <HStack space="sm" className="items-center">
            <Box className="items-center justify-center rounded-sm bg-primary px-1.5 py-1">
              <Text size="2xs" bold className="text-center text-primary-foreground">
                TOP{'\n'}10
              </Text>
            </Box>
            <Text bold className="text-foreground">
              {movie ? '#1 in Movies Today' : '#1 in TV Shows Today'}
            </Text>
          </HStack> */}

          {coming.comingSoon ? (
            <Button size="lg" className="w-full bg-secondary" isDisabled>
              <ButtonIcon
                as={CalendarClock}
                className="text-secondary-foreground"
              />
              <ButtonText className="text-secondary-foreground">
                {coming.label}
              </ButtonText>
            </Button>
          ) : (
            <Button
              size="lg"
              className="w-full bg-foreground"
              onPress={() =>
                play(
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
          )}

          <Text className="text-foreground">{item.overview}</Text>

          {!!starring && (
            <Text size="sm" className="text-muted-foreground">
              <Text size="sm" className="text-muted-foreground">
                Starring:{' '}
              </Text>
              <Text size="sm" className="text-foreground">
                {starring}
              </Text>
              {cast.length > 4 ? (
                <Text
                  size="sm"
                  className="font-semibold text-primary"
                  onPress={() => setCastSheetOpen(true)}
                  suppressHighlighting
                >
                  {' '}
                  ... more
                </Text>
              ) : null}
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

          <HStack className="mt-2 justify-around">
            <ActionIcon
              icon={isInList(item) ? Check : Plus}
              label="My List"
              onPress={() => toggle(item)}
            />
            <ActionIcon icon={Share2} label="Share" onPress={onShare} />
            {partyEnabled && !coming.comingSoon && (
              <ActionIcon
                icon={Users}
                label="Watch party"
                onPress={() => setPartyIntroOpen(true)}
              />
            )}
          </HStack>
        </VStack>

        {/* Tabs */}
        <HStack space="lg" className="mt-6 border-b border-border px-4">
          {!movie && (
            <TabButton
              label="Episodes"
              active={tab === 'episodes'}
              onPress={() => setTab('episodes')}
            />
          )}
          <TabButton
            label="Trailers & More"
            active={tab === 'trailers'}
            onPress={() => setTab('trailers')}
          />
          <TabButton
            label="More Like This"
            active={tab === 'similar'}
            onPress={() => setTab('similar')}
          />
        </HStack>

        <Box className="mt-4">
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
              onSelectSeason={setSelectedSeason}
              episodes={episodes}
              loadingEpisodes={loadingEpisodes}
              onPlayEpisode={(ep: Episode) =>
                play({
                  season: ep.season_number,
                  episode: ep.episode_number,
                  label: `${getTitle(item)} — ${ep.name}`,
                })
              }
              onDownloadEpisode={onDownloadEpisode}
              downloadStatusFor={episodeDownloadStatus}
            />
          )}

          {!loading && !error && tab === 'trailers' && (
            <TrailersTab videos={youtubeVideos} />
          )}

          {!loading && !error && tab === 'similar' && (
            <VStack space="md" style={{ paddingHorizontal: gridPadding }}>
              <Box className="flex-row flex-wrap" style={{ gap: gridGap }}>
                {similarItems.map((i) => (
                  <ContentCard
                    key={`${i.media_type ?? ''}-${i.id}`}
                    item={i}
                    width={similarCardWidth}
                    onPress={(picked) =>
                      navigation.push('Detail', { item: picked })
                    }
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

        <Box style={{ height: insets.bottom + 24 }} />
      </Animated.ScrollView>

      {/* Sticky header: back button always pinned; title fades/slides in
          once the user scrolls past the logo/title block below the hero. */}
      <Box
        className="absolute left-0 right-0 top-0 z-50"
        pointerEvents="box-none"
      >
        <AnimatedBox
          className="absolute inset-0 border-b border-border bg-background"
          style={headerProgressStyle}
          pointerEvents="none"
        />
        <HStack
          className="items-center justify-between px-4 pb-3"
          style={{ paddingTop: insets.top + 8 }}
        >
          <Focusable
            onPress={() => navigation.goBack()}
            className="rounded-full bg-background/60 p-2"
            focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
          >
            <Icon as={ArrowLeft} className="text-foreground" />
          </Focusable>

          <AnimatedBox
            className="flex-1 items-center px-2"
            style={headerTitleStyle}
            pointerEvents="none"
          >
            {logoUrl ? (
              <Image
                source={{ uri: logoUrl }}
                alt={getTitle(item)}
                resizeMode="contain"
                className="h-8 w-32"
              />
            ) : (
              <Text
                size="md"
                bold
                numberOfLines={1}
                className="text-foreground"
              >
                {getTitle(item)}
              </Text>
            )}
          </AnimatedBox>

          <Box className="h-10 w-10" />
        </HStack>
      </Box>

      <DownloadQualitySheet
        visible={qualitySheet != null}
        variants={qualitySheet?.variants ?? []}
        onSelect={(choice) => qualitySheet?.onSelect(choice)}
        onClose={() => setQualitySheet(null)}
      />

      <CastSheet
        visible={castSheetOpen}
        cast={cast}
        onClose={() => setCastSheetOpen(false)}
      />
      <WatchPartyIntroModal
        visible={partyIntroOpen}
        onContinue={() => {
          setPartyIntroOpen(false);
          setPartyOpen(true);
        }}
        onDismiss={() => setPartyIntroOpen(false)}
      />
      <PartyLobbyModal
        visible={partyOpen}
        content={
          partyOpen
            ? partyContentFromItem(
                item,
                movie ? undefined : selectedSeason ?? undefined,
                movie ? undefined : firstEpisode?.episode_number,
              )
            : null
        }
        onPlayTogether={() => {
          setPartyOpen(false);
          play(
            !movie && selectedSeason != null && firstEpisode
              ? {
                  season: selectedSeason,
                  episode: firstEpisode.episode_number,
                  label: `${getTitle(item)} — ${firstEpisode.name}`,
                }
              : undefined,
          );
        }}
        onClose={() => setPartyOpen(false)}
      />
    </Box>
  );
};

const Badge = ({ label }: { label: string }) => (
  <Box className="rounded-sm border border-muted-foreground px-1 py-0.5">
    <Text size="2xs" className="text-muted-foreground">
      {label}
    </Text>
  </Box>
);

/**
 * Stateful "Download" button for movies. Morphs between:
 *   - idle          → tap to start
 *   - resolving     → spinner + "Finding stream…"
 *   - queued/downloading → progress % + tap to pause
 *   - paused        → tap to resume (progress fill retained)
 *   - completed     → tap to play offline (long-press to delete)
 *   - failed        → tap to retry
 *
 * The downloading / paused states render a semantic `bg-primary/25` fill
 * behind the button contents so the visual progress reads at a glance
 * without needing a separate progress bar row.
 */
export const MovieDownloadButton = ({
  status,
  progress,
  resolving,
  onDownload,
  onPause,
  onResume,
  onPlayLocal,
  onDelete,
}: {
  status?: 'queued' | 'resolving' | 'downloading' | 'paused' | 'completed' | 'failed';
  progress: number;
  resolving: boolean;
  onDownload: () => void;
  onPause: () => void;
  onResume: () => void;
  onPlayLocal: () => void;
  onDelete: () => void;
}) => {
  // Idle — no job at all.
  if (!status) {
    return (
      <Button
        size="lg"
        className="w-full bg-secondary"
        isDisabled={resolving}
        onPress={onDownload}
      >
        {resolving ? (
          <ButtonSpinner color="#E50914" />
        ) : (
          <ButtonIcon as={Download} className="text-secondary-foreground" />
        )}
        <ButtonText className="text-secondary-foreground">
          {resolving ? 'Finding stream…' : 'Download'}
        </ButtonText>
      </Button>
    );
  }

  if (status === 'resolving' || status === 'queued') {
    return (
      <Button size="lg" className="w-full bg-secondary" isDisabled>
        <ButtonSpinner color="#E50914" />
        <ButtonText className="text-secondary-foreground">
          Preparing download…
        </ButtonText>
      </Button>
    );
  }

  if (status === 'completed') {
    return (
      <Button
        size="lg"
        className="w-full bg-primary"
        onPress={onPlayLocal}
        onLongPress={onDelete}
      >
        <ButtonIcon as={Check} className="text-primary-foreground" />
        <ButtonText className="text-primary-foreground">
          Downloaded — Play offline
        </ButtonText>
      </Button>
    );
  }

  if (status === 'failed') {
    return (
      <Button size="lg" className="w-full bg-secondary" onPress={onResume}>
        <ButtonIcon as={AlertCircle} className="text-destructive" />
        <ButtonText className="text-secondary-foreground">
          Download failed — Retry
        </ButtonText>
      </Button>
    );
  }

  // downloading / paused — show fill + %
  const isDownloading = status === 'downloading';
  return (
    // `px-0`: the `lg` size variant bakes in `px-8` on the Button's own
    // root. React Native positions absolute children relative to the
    // PADDING edge (not the border edge), so a percentage-width fill living
    // directly inside that padded root would only ever span the button's
    // inner content box (minus 64px) — making e.g. "45%" visibly cover much
    // less than 45% of the button. Zeroing the root's padding and moving it
    // onto the inner content row instead lets the fill's percentage be
    // measured against the button's true full width.
    <Button
      size="lg"
      className="w-full overflow-hidden bg-secondary px-0"
      onPress={isDownloading ? onPause : onResume}
      onLongPress={onDelete}
    >
      {/* Semantic progress fill behind the button contents. */}
      <Box
        className="absolute bottom-0 left-0 top-0 bg-primary/25"
        style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
        pointerEvents="none"
      />
      <HStack space="sm" className="w-full items-center justify-center px-8">
        {isDownloading ? (
          <ButtonSpinner color="#E50914" />
        ) : (
          <ButtonIcon as={RefreshCw} className="text-secondary-foreground" />
        )}
        <ButtonText className="text-secondary-foreground">
          {isDownloading
            ? `Downloading ${progress}% — Pause`
            : `Paused ${progress}% — Resume`}
        </ButtonText>
      </HStack>
    </Button>
  );
};

export const ActionIcon = ({
  icon,
  label,
  onPress,
  active,
}: {
  icon: typeof Plus;
  label: string;
  onPress: () => void;
  active?: boolean;
}) => (
  <Focusable
    onPress={onPress}
    className="items-center rounded-md px-2"
    focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
  >
    <VStack space="xs" className="items-center">
      <Icon
        as={icon}
        className={active ? 'text-primary' : 'text-foreground'}
      />
      <Text size="xs" className="text-muted-foreground">
        {label}
      </Text>
    </VStack>
  </Focusable>
);

export const TabButton = ({
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
    className="rounded-md pb-3"
    focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
  >
    <Text
      className={
        active
          ? 'border-b-2 border-primary font-semibold text-foreground'
          : 'text-muted-foreground'
      }
    >
      {label}
    </Text>
  </Focusable>
);

export const TrailersTab = ({ videos }: { videos: VideoResult[] }) => {
  if (!videos.length) {
    return (
      <Center className="py-10 px-8">
        <Text className="text-center text-muted-foreground">
          No trailers available.
        </Text>
      </Center>
    );
  }

  return (
    <VStack space="lg" className="px-4">
      {videos.slice(0, 6).map((v) => (
        <VStack key={v.id} space="sm">
          <Text className="text-foreground">{v.name}</Text>
          <Box className="h-48 w-full overflow-hidden rounded-md bg-card">
            <TrailerWebView youtubeKey={v.key} preview={false} muted={false} />
          </Box>
        </VStack>
      ))}
    </VStack>
  );
};
