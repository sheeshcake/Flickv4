import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  Image,
  ActivityIndicator,
  ImageBackground,
  Modal,
  Alert,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Movie, TVShow, TMDBResponse, AppError } from '../../types';
import { COLORS } from '../../utils/constants';
import { TMDBService } from '../../services';
import WebViewScrapper from '../../components/WebViewScrapper';
import { useAppState } from '../../hooks/useAppState';
import { useContentWatchProgress } from '../../hooks/useAppSelectors';
import { getGenreNameById } from '../../utils/genreMap';
import { TVContentCard } from '../../components/tv/TVContentCard';
import { TVButton } from '../../components/tv/TVButton';

const tmdbService = new TMDBService();

// ─────────────────────────────────────────────────────────────────
// Episode Card – own component so onFocus/onBlur reliably updates
// ─────────────────────────────────────────────────────────────────
interface EpisodeCardProps {
  ep: any;
  isSelected: boolean;
  onPress: (episodeNumber: number) => void;
}

const EpisodeCard: React.FC<EpisodeCardProps> = ({ ep, isSelected, onPress }) => {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      style={[
        episodeStyles.card,
        isSelected && episodeStyles.cardActive,
        focused && episodeStyles.cardFocused,
      ]}
      onPress={() => onPress(ep.episode_number)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      focusable={true}
      accessible={true}
      accessibilityLabel={`Episode ${ep.episode_number}: ${ep.name}`}
    >
      <View style={episodeStyles.inner}>
        {ep.still_path ? (
          <Image
            source={{ uri: `https://image.tmdb.org/t/p/w300${ep.still_path}` }}
            style={episodeStyles.thumb}
            resizeMode="cover"
          />
        ) : (
          <View style={episodeStyles.thumbPlaceholder}>
            <Icon name="television-play" size={28} color="#555555" />
          </View>
        )}
        {isSelected && (
          <View style={episodeStyles.playingBadge}>
            <Text style={episodeStyles.playingBadgeText}>Playing</Text>
          </View>
        )}
        <View style={episodeStyles.info}>
          <Text style={episodeStyles.num}>Ep {ep.episode_number}</Text>
          <Text
            style={[episodeStyles.name, isSelected && episodeStyles.nameActive]}
            numberOfLines={2}
          >
            {ep.name}
          </Text>
          {ep.runtime ? (
            <Text style={episodeStyles.runtime}>{ep.runtime} min</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
};

const episodeStyles = StyleSheet.create({
  card: {
    width: 220,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#333333',
    marginRight: 16,
  },
  cardActive: {
    borderColor: COLORS.NETFLIX_RED,
  },
  cardFocused: {
    borderColor: '#E50914',
    backgroundColor: '#2A2A2A',
    shadowColor: '#E50914',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 12,
    transform: [{ scale: 1.04 }],
  },
  inner: {
    borderRadius: 6,
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: 110,
  },
  thumbPlaceholder: {
    width: '100%',
    height: 110,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playingBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: COLORS.NETFLIX_RED,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  playingBadgeText: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 11,
    fontWeight: '700',
  },
  info: {
    padding: 10,
  },
  num: {
    fontSize: 12,
    color: '#888888',
    marginBottom: 2,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.NETFLIX_LIGHT_GRAY,
  },
  nameActive: {
    color: COLORS.NETFLIX_WHITE,
  },
  runtime: {
    fontSize: 12,
    color: '#888888',
    marginTop: 2,
  },
});

const isMovieContent = (item: Movie | TVShow | null): item is Movie =>
  !!item && 'title' in item;

const getContentTitle = (item: Movie | TVShow | null): string => {
  if (!item) return '';
  return isMovieContent(item) ? item.title : (item as any).name;
};

const getContentReleaseDate = (item: Movie | TVShow | null): string => {
  if (!item) return '';
  return isMovieContent(item)
    ? item.release_date || ''
    : (item as any).first_air_date || '';
};

interface TVDetailScreenProps {
  content: Movie | TVShow;
  onBack: () => void;
  onNavigateToDetail: (content: Movie | TVShow) => void;
}

export const TVDetailScreen: React.FC<TVDetailScreenProps> = ({
  content,
  onBack,
  onNavigateToDetail,
}) => {
  const validContent = content && typeof content === 'object' ? content : null;

  const { state, addLikedContent, removeLikedContent, isContentLiked } =
    useAppState();

  const isMovie = useMemo(() => isMovieContent(validContent), [validContent]);
  const contentType = isMovie ? 'movie' : 'tv';
  const contentTitle = useMemo(
    () => getContentTitle(validContent),
    [validContent],
  );
  const contentReleaseDate = useMemo(
    () => getContentReleaseDate(validContent),
    [validContent],
  );
  const releaseYear = useMemo(
    () =>
      contentReleaseDate
        ? new Date(contentReleaseDate).getFullYear()
        : 'Unknown',
    [contentReleaseDate],
  );

  const watchProgress = useContentWatchProgress(
    validContent?.id ?? 0,
    contentType,
  );

  const [similarContent, setSimilarContent] = useState<(Movie | TVShow)[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [currentVideoUrl, setCurrentVideoUrl] = useState('');
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [initialProgress, setInitialProgress] = useState(0);
  const [tvState, setTvState] = useState<{
    seasons: any[];
    selectedSeason: number;
    selectedEpisode: number | null;
    episodes: any[];
    loading: boolean;
    details: any;
  }>({
    seasons: [],
    selectedSeason: 1,
    selectedEpisode: null,
    episodes: [],
    loading: false,
    details: null,
  });
  const [scraping, setScraping] = useState<{
    active: boolean;
    error: string | null;
    show: boolean;
  }>({ active: false, error: null, show: false });

  const hasAppliedProgressRef = useRef(false);

  const isLiked = validContent
    ? isContentLiked(validContent.id, contentType)
    : false;

  const imageUrl = useMemo(
    () =>
      `https://image.tmdb.org/t/p/w1280${validContent?.backdrop_path || validContent?.poster_path}`,
    [validContent?.backdrop_path, validContent?.poster_path],
  );

  const genreDisplayNames = useMemo(() => {
    if (!validContent) return [];
    const genres = isMovie
      ? (validContent as any).genres
      : tvState.details?.genres;
    if (Array.isArray(genres) && genres.length > 0)
      return genres.map((g: any) => g?.name).filter(Boolean);
    if (Array.isArray(validContent?.genre_ids) && validContent?.genre_ids.length > 0)
      return Array.from(
        new Set(
          validContent.genre_ids
            .map((id: any) => getGenreNameById(id))
            .filter(Boolean),
        ),
      );
    return [];
  }, [validContent, tvState.details, isMovie]);

  // ── Fetch similar content ──────────────────────────────────────────────────
  const fetchSimilarContent = useCallback(async (item: Movie | TVShow) => {
    if (!item) return;
    setLoadingSimilar(true);
    try {
      const response: TMDBResponse<Movie | TVShow> = isMovieContent(item)
        ? await tmdbService.getSimilarMovies(item.id)
        : await tmdbService.getSimilarTVShows(item.id);
      setSimilarContent(response.results.slice(0, 12));
    } catch {
      setSimilarContent([]);
    } finally {
      setLoadingSimilar(false);
    }
  }, []);

  // ── Fetch TV show details & episodes ──────────────────────────────────────
  const fetchSeasonEpisodes = useCallback(
    async (
      tvShowId: number,
      seasonNumber: number,
      opts?: { autoSelectEpisode?: number },
    ) => {
      try {
        const seasonDetails = await tmdbService.getSeasonDetails(
          tvShowId,
          seasonNumber,
        );
        const episodes: any[] = seasonDetails.episodes || [];
        setTvState(prev => {
          const update: any = { ...prev, episodes };
          if (opts?.autoSelectEpisode) {
            const matched = episodes.find(
              (ep: any) => ep.episode_number === opts.autoSelectEpisode,
            );
            if (matched) update.selectedEpisode = matched.episode_number;
          }
          return update;
        });
      } catch {
        setTvState(prev => ({ ...prev, episodes: [] }));
      }
    },
    [],
  );

  const fetchTVShowDetails = useCallback(
    async (tvShowId: number) => {
      if (!tvShowId) return;
      setTvState(prev => ({ ...prev, loading: true }));
      try {
        const details = await tmdbService.getTVShowDetails(tvShowId);
        const seasons = details.number_of_seasons
          ? Array.from({ length: details.number_of_seasons }, (_, i) => ({
              season_number: i + 1,
              name: `Season ${i + 1}`,
            }))
          : [];
        setTvState(prev => ({ ...prev, details, seasons, loading: false }));
        if (details.number_of_seasons > 0)
          await fetchSeasonEpisodes(tvShowId, 1);
      } catch {
        Alert.alert('Error', 'Failed to load TV show details');
        setTvState(prev => ({ ...prev, loading: false }));
      }
    },
    [fetchSeasonEpisodes],
  );

  useEffect(() => {
    if (!validContent) return;
    fetchSimilarContent(validContent);
    if (!isMovie) fetchTVShowDetails(validContent.id);
    hasAppliedProgressRef.current = false;
  }, [validContent, fetchSimilarContent, fetchTVShowDetails, isMovie]);

  // ── Auto-scrape on mount to pre-fetch video URL ──────────────────────────
  useEffect(() => {
    if (currentVideoUrl || scraping.active || scraping.show) return;
    if (!isMovie) {
      if (tvState.episodes.length === 0) return;
      if (
        tvState.selectedSeason === 1 &&
        (tvState.selectedEpisode === 1 || tvState.selectedEpisode === null)
      ) {
        if (tvState.selectedEpisode === null)
          setTvState(prev => ({ ...prev, selectedEpisode: 1 }));
        setScraping({ show: true, active: true, error: null });
      }
    } else {
      setScraping({ show: true, active: true, error: null });
    }
  }, [currentVideoUrl, scraping.active, scraping.show, isMovie, tvState]);

  const handleSeasonChange = useCallback(
    (seasonNumber: number) => {
      hasAppliedProgressRef.current = true;
      setTvState(prev => ({
        ...prev,
        selectedSeason: seasonNumber,
        selectedEpisode: null,
      }));
      if (validContent && !isMovie)
        fetchSeasonEpisodes(validContent.id, seasonNumber);
    },
    [validContent, fetchSeasonEpisodes, isMovie],
  );

  const handleEpisodeChange = useCallback(
    (episodeNumber: number) => {
      hasAppliedProgressRef.current = true;
      setTvState(prev => ({ ...prev, selectedEpisode: episodeNumber }));
      setInitialProgress(0);
      setCurrentVideoUrl('');
      setShowPlayerModal(false);
      setScraping({ show: true, active: true, error: null });
    },
    [],
  );

  const handleVideoExtracted = useCallback(
    (data: { videoUrl: string; isWebM: boolean }) => {
      setCurrentVideoUrl(data.videoUrl);
      setScraping({ show: false, active: false, error: null });

      const shouldApplyProgress =
        !hasAppliedProgressRef.current &&
        (watchProgress?.progress ?? 0) > 0 &&
        isMovie;
      setInitialProgress(
        shouldApplyProgress && watchProgress
          ? (watchProgress.progress / 100) * watchProgress.duration
          : 0,
      );
    },
    [isMovie, watchProgress],
  );

  const handleScrapingError = useCallback((error: string) => {
    setScraping({ active: false, error, show: false });
    Alert.alert('Video Error', `Failed to load video: ${error}`);
  }, []);

  const toggleLike = useCallback(async () => {
    if (!validContent) return;
    try {
      if (isLiked) await removeLikedContent(validContent.id, contentType);
      else await addLikedContent(validContent.id, contentType);
    } catch {
      Alert.alert('Error', 'Failed to update liked content');
    }
  }, [isLiked, validContent, contentType, addLikedContent, removeLikedContent]);

  if (!validContent) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Content not found.</Text>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Full-screen backdrop with gradient */}
      <ImageBackground
        source={{ uri: imageUrl }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0.65)', 'rgba(10,10,10,0.97)']}
          locations={[0, 0.45, 0.85]}
          style={StyleSheet.absoluteFill}
        />
      </ImageBackground>

      {/* Back button – always sticky */}
      <TVButton
        title="Back"
        icon="arrow-left"
        variant="ghost"
        size="small"
        onPress={onBack}
        style={styles.backBtn}
      />

      {/* ── Content info scrollable ───────────────────────────────────────── */}
      <ScrollView
        style={styles.infoScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.infoContent}
      >
        {/* Title & Actions */}
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{contentTitle}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.year}>{releaseYear}</Text>
              <Text style={styles.rating}>
                ★ {validContent.vote_average?.toFixed(1)}
              </Text>
              <Text style={styles.type}>
                {isMovie ? 'Movie' : 'TV Show'}
              </Text>
              {genreDisplayNames.length > 0 && (
                <Text style={styles.genres}>
                  • {genreDisplayNames.slice(0, 3).join(', ')}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.actionBtns}>
            <TVButton
              title={
                scraping.active
                  ? 'Loading…'
                  : currentVideoUrl
                  ? 'Play'
                  : 'Loading…'
              }
              icon={scraping.active ? 'progress-clock' : 'play-circle'}
              variant="primary"
              size="small"
              disabled={scraping.active || !currentVideoUrl}
              onPress={() => setShowPlayerModal(true)}
            />
            <TVButton
              title={isLiked ? 'Liked' : 'Like'}
              icon={isLiked ? 'cards-heart' : 'cards-heart-outline'}
              variant={isLiked ? 'primary' : 'outline'}
              size="small"
              onPress={toggleLike}
            />
          </View>
        </View>

        {/* Overview */}
        {validContent.overview ? (
          <Text style={styles.overview}>{validContent.overview}</Text>
        ) : null}

        {/* ── TV Episode Selector ──────────────────────────────────────────── */}
        {!isMovie && tvState.details && (
          <View style={styles.episodeSection}>
            {/* Season Selector */}
            {tvState.seasons.length > 1 && (
              <View style={styles.seasonRow}>
                <Text style={styles.sectionLabel}>Season</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.seasonScroll}
                >
                  {tvState.seasons.map(season => (
                    <TVButton
                      key={season.season_number}
                      title={String(season.season_number)}
                      variant={tvState.selectedSeason === season.season_number ? 'primary' : 'secondary'}
                      size="small"
                      onPress={() => handleSeasonChange(season.season_number)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Episode List */}
            {tvState.episodes.length > 0 && (
              <View>
                <Text style={styles.sectionLabel}>Episodes</Text>
                <FlatList
                  horizontal
                  data={tvState.episodes}
                  keyExtractor={ep => String(ep.episode_number)}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.episodeScroll}
                  renderItem={({ item: ep }) => (
                    <EpisodeCard
                      ep={ep}
                      isSelected={tvState.selectedEpisode === ep.episode_number}
                      onPress={handleEpisodeChange}
                    />
                  )}
                />
              </View>
            )}

            {tvState.loading && (
              <ActivityIndicator color={COLORS.NETFLIX_RED} style={{ marginTop: 12 }} />
            )}
          </View>
        )}

        {/* Scraping error */}
        {scraping.error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>
              Failed to load video: {scraping.error}
            </Text>
          </View>
        )}

        {/* Similar / More Like This */}
        {similarContent.length > 0 && (
          <View style={styles.similarSection}>
            <Text style={styles.sectionLabel}>More Like This</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.similarScroll}
            >
              {similarContent.map(item => (
                <TVContentCard
                  key={`${item.id}-${isMovieContent(item) ? 'movie' : 'tv'}`}
                  item={item}
                  onPress={onNavigateToDetail}
                  width={220}
                  height={130}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {loadingSimilar && (
          <ActivityIndicator color={COLORS.NETFLIX_RED} style={{ marginTop: 16 }} />
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ── Fullscreen Player Modal ──────────────────────────────────────── */}
      <Modal
        visible={showPlayerModal}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowPlayerModal(false)}
      >
        {showPlayerModal && currentVideoUrl
          ? (() => {
              const TVMediaPlayer =
                require('../../components/tv/TVMediaPlayer').default;
              return (
                <TVMediaPlayer
                  key={`${validContent.id}-${tvState.selectedSeason}-${tvState.selectedEpisode}`}
                  videoUrl={currentVideoUrl}
                  title={contentTitle}
                  contentId={validContent.id}
                  contentType={contentType}
                  initialProgress={initialProgress}
                  season={!isMovie ? tvState.selectedSeason : undefined}
                  episode={
                    !isMovie ? tvState.selectedEpisode ?? undefined : undefined
                  }
                  onEnd={() => setShowPlayerModal(false)}
                  onBack={() => setShowPlayerModal(false)}
                />
              );
            })()
          : null}
      </Modal>

      {/* WebViewScrapper */}
      {scraping.show && (
        <WebViewScrapper
          tmdbId={validContent?.id}
          type={contentType}
          seasonNumber={!isMovie ? tvState.selectedSeason : undefined}
          episodeNumber={!isMovie ? tvState.selectedEpisode ?? undefined : undefined}
          onDataExtracted={handleVideoExtracted}
          onLoading={loading => setScraping(prev => ({ ...prev, active: loading }))}
          onError={handleScrapingError}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  // Positional only – TVButton ghost variant handles bg/border/focus visuals
  backBtn: {
    position: 'absolute',
    top: 20,
    left: 40,
    zIndex: 50,
  },
  infoScroll: {
    flex: 1,
  },
  infoContent: {
    paddingHorizontal: 60,
    paddingTop: 80,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  actionBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleBlock: {
    flex: 1,
    marginRight: 24,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: COLORS.NETFLIX_WHITE,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  year: {
    fontSize: 16,
    color: COLORS.NETFLIX_LIGHT_GRAY,
  },
  rating: {
    fontSize: 16,
    color: '#FFD700',
    fontWeight: '600',
  },
  type: {
    fontSize: 16,
    color: COLORS.NETFLIX_LIGHT_GRAY,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  genres: {
    fontSize: 15,
    color: COLORS.NETFLIX_LIGHT_GRAY,
  },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  likeBtnActive: {
    backgroundColor: 'rgba(229,9,20,0.15)',
    borderColor: COLORS.NETFLIX_RED,
  },
  likeBtnText: {
    fontSize: 16,
    color: COLORS.NETFLIX_WHITE,
    fontWeight: '600',
  },
  likeBtnTextActive: {
    color: COLORS.NETFLIX_RED,
  },
  overview: {
    fontSize: 16,
    color: COLORS.NETFLIX_LIGHT_GRAY,
    lineHeight: 24,
    marginBottom: 28,
  },
  episodeSection: {
    marginBottom: 28,
  },
  seasonRow: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.NETFLIX_WHITE,
    marginBottom: 12,
  },
  seasonScroll: {
    gap: 12,
    paddingRight: 20,
  },
  seasonBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#333333',
  },
  seasonBtnActive: {
    backgroundColor: COLORS.NETFLIX_RED,
    borderColor: COLORS.NETFLIX_RED,
  },
  seasonBtnText: {
    fontSize: 17,
    color: COLORS.NETFLIX_LIGHT_GRAY,
    fontWeight: '600',
  },
  seasonBtnTextActive: {
    color: COLORS.NETFLIX_WHITE,
  },
  episodeScroll: {
    paddingBottom: 8,
  },
  errorBanner: {
    backgroundColor: 'rgba(255,0,0,0.15)',
    borderColor: '#FF4444',
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginBottom: 20,
  },
  errorBannerText: {
    color: '#FF4444',
    fontSize: 15,
  },
  similarSection: {
    marginBottom: 20,
  },
  similarScroll: {
    gap: 16,
    paddingRight: 20,
  },
  errorText: {
    color: '#FF4444',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 60,
  },
});

export default TVDetailScreen;
