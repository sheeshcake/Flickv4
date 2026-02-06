import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  TouchableOpacity,
  SafeAreaView,
  Image,
  ActivityIndicator,
  ImageBackground,
} from 'react-native';
import RNFS from 'react-native-fs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Movie, TVShow, TMDBResponse, AppError } from '../types';
import { COLORS } from '../utils/constants';
import { TMDBService } from '../services';
import HorizontalScrollList from '../components/HorizontalScrollList';
import MediaPlayer from '../components/MediaPlayer';
import WebViewScrapper from '../components/WebViewScrapper';
import { DownloadButton } from '../components/DownloadComponents';
import { useAppState } from '../hooks/useAppState';
import { useContentWatchProgress } from '../hooks/useAppSelectors';
import type { RootStackScreenProps } from '../types/navigation';
import { getGenreNameById } from '../utils/genreMap';
import LinearGradient from 'react-native-linear-gradient';
import { colors, sizes } from '../constants/theme';
import { styles } from './DetailScreen.styles';

type DetailScreenProps = RootStackScreenProps<'Detail'>;

const tmdbService = new TMDBService();

const isMovieContent = (item: Movie | TVShow | null): item is Movie => {
  return !!item && typeof item === 'object' && 'title' in item;
};

const getContentTitle = (item: Movie | TVShow | null): string => {
  if (!item) return '';
  return isMovieContent(item) ? item.title : item.name;
};

const getContentReleaseDate = (item: Movie | TVShow | null): string => {
  if (!item) return '';
  return isMovieContent(item) ? item.release_date || '' : item.first_air_date || '';
};

const DetailScreen: React.FC<DetailScreenProps> = ({ route, navigation }) => {
  const { content, video: localVideoPath, isLocal, autoPlay } = route.params || {};
  const validContent = content && typeof content === 'object' ? content : null;
  
  const {
    state,
    addLikedContent,
    removeLikedContent,
    isContentLiked,
  } = useAppState();

  const [similarContent, setSimilarContent] = useState<(Movie | TVShow)[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [loadingMoreSimilar, setLoadingMoreSimilar] = useState(false);
  const [similarPage, setSimilarPage] = useState(1);
  const [hasMoreSimilar, setHasMoreSimilar] = useState(true);
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string>('');
  const [localFileExists, setLocalFileExists] = useState<boolean>(true);
  const [initialVideoDuration, setInitialVideoDuration] = useState<number>(0);
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const [tvState, setTvState] = useState<{
    seasons: any[];
    selectedSeason: number;
    selectedEpisode: number | null;
    episodes: any[];
    loading: boolean;
    details: any;
  }>({ seasons: [], selectedSeason: 1, selectedEpisode: null, episodes: [], loading: false, details: null });
  const [scraping, setScraping] = useState<{ active: boolean; error: string | null; show: boolean }>({
    active: false, error: null, show: false
  });
  const [pendingDownload, setPendingDownload] = useState(false);
  const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);
  
  const hasAppliedWatchProgressRef = useRef(false);
  const pendingFullscreenRef = useRef(false);

  const isMovie = useMemo(() => isMovieContent(validContent), [validContent]);
  const contentType = isMovie ? 'movie' : 'tv';
  const autoplayEnabled = state.user.preferences.autoplay;
  
  const contentTitle = useMemo(() => getContentTitle(validContent), [validContent]);
  const contentReleaseDate = useMemo(() => getContentReleaseDate(validContent), [validContent]);
  const releaseYear = useMemo(() => 
    contentReleaseDate ? new Date(contentReleaseDate).getFullYear() : 'Unknown',
    [contentReleaseDate]
  );

  const watchProgress = useContentWatchProgress(
    validContent?.id ?? 0,
    contentType,
  );

  const genreDisplayNames = useMemo(() => {
    if (!validContent) return [];
    const detailedGenres = isMovie ? (validContent as any).genres : tvState.details?.genres;
    if (Array.isArray(detailedGenres) && detailedGenres.length > 0) {
      return detailedGenres.map((g: any) => g?.name).filter(Boolean);
    }
    if (Array.isArray(validContent?.genre_ids) && validContent?.genre_ids.length > 0) {
      return Array.from(new Set(validContent.genre_ids.map((id: any) => getGenreNameById(id)).filter(Boolean)));
    }
    return [];
  }, [validContent, tvState.details, isMovie]);

  const isLiked = validContent ? isContentLiked(validContent.id, contentType) : false;

  const imageUrl = useMemo(() => 
    `https://image.tmdb.org/t/p/w500${validContent?.backdrop_path || validContent?.poster_path}`,
    [validContent?.backdrop_path, validContent?.poster_path]
  );

  useEffect(() => {
    if (!isLocal || !localVideoPath) return;
    
    const checkFile = async () => {
      try {
        const exists = await RNFS.exists(localVideoPath);
        setLocalFileExists(!!exists);
        if (exists) {
          setCurrentVideoUrl(localVideoPath);
          setShowVideoPlayer(true);
        } else {
          setCurrentVideoUrl('');
          setShowVideoPlayer(false);
        }
      } catch {
        setLocalFileExists(false);
        setCurrentVideoUrl('');
        setShowVideoPlayer(false);
      }
    };
    checkFile();
  }, [isLocal, localVideoPath]);

  useEffect(() => {
    if (validContent) {
      hasAppliedWatchProgressRef.current = false;
    }
  }, [validContent]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      setShowVideoPlayer(false);
      setCurrentVideoUrl('');
      setIsVideoFullscreen(false);
    });
    
    let tabNavigator: any = null;
    let current: any = navigation;
    while (current) {
      const parent = current.getParent();
      if (parent?.getState()?.type === 'tab') { tabNavigator = parent; break; }
      if (!parent) break;
      current = parent;
    }
    
    if (tabNavigator) {
      tabNavigator.setOptions({ tabBarStyle: { display: isVideoFullscreen ? 'none' : 'flex' } });
    }

    return () => {
      unsubscribe();
      if (tabNavigator) tabNavigator.setOptions({ tabBarStyle: { display: 'flex' } });
    };
  }, [navigation, isVideoFullscreen]);

  const toggleLike = useCallback(async () => {
    if (!validContent) return;
    try {
      if (isLiked) {
        await removeLikedContent(validContent.id, contentType);
      } else {
        await addLikedContent(validContent.id, contentType);
      }
    } catch {
      Alert.alert('Error', 'Failed to update your liked content');
    }
  }, [isLiked, validContent, contentType, addLikedContent, removeLikedContent]);

  const fetchSimilarContent = useCallback(
    async (item: Movie | TVShow, page: number = 1, isLoadMore: boolean = false) => {
      if (!item) return;

      if (isLoadMore) {
        setLoadingMoreSimilar(true);
      } else {
        setLoadingSimilar(true);
        setSimilarContent([]);
        setSimilarPage(1);
        setHasMoreSimilar(true);
      }

      try {
        const response: TMDBResponse<Movie | TVShow> = isMovieContent(item)
          ? await tmdbService.getSimilarMovies(item.id, page)
          : await tmdbService.getSimilarTVShows(item.id, page);

        if (isLoadMore) {
          setSimilarContent(prev => [...prev, ...response.results]);
        } else {
          setSimilarContent(response.results);
        }

        setSimilarPage(page);
        setHasMoreSimilar(page < response.total_pages);
      } catch (error) {
        const appError = error as AppError;
        if (!isLoadMore) {
          Alert.alert('Error', appError.message || 'Failed to load similar content');
          setSimilarContent([]);
        }
      } finally {
        setLoadingSimilar(false);
        setLoadingMoreSimilar(false);
      }
    },
    [],
  );

  const handleSimilarItemPress = useCallback(
    (item: Movie | TVShow) => {
      if (!item) return;
      setShowVideoPlayer(false);
      setCurrentVideoUrl('');
      setIsVideoFullscreen(false);
      navigation.push('Detail', { content: item });
    },
    [navigation],
  );

  const handleLoadMoreSimilar = useCallback(() => {
    if (!loadingMoreSimilar && hasMoreSimilar && !loadingSimilar && validContent) {
      fetchSimilarContent(validContent, similarPage + 1, true);
    }
  }, [loadingMoreSimilar, hasMoreSimilar, loadingSimilar, validContent, similarPage, fetchSimilarContent]);

  const handleCloseVideo = useCallback(() => {
    setShowVideoPlayer(false);
    setCurrentVideoUrl('');
  }, []);

  const fetchSeasonEpisodes = useCallback(
    async (tvShowId: number, seasonNumber: number, options?: { autoSelectEpisode?: number }) => {
      try {
        const seasonDetails = await tmdbService.getSeasonDetails(tvShowId, seasonNumber);
        const seasonEpisodes: any[] = seasonDetails.episodes || [];
        setTvState(prev => {
          const update: any = { ...prev, episodes: seasonEpisodes };
          if (options?.autoSelectEpisode) {
            const matched = seasonEpisodes.find((ep: any) => ep.episode_number === options.autoSelectEpisode);
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
        const seasonsArray = details.number_of_seasons
          ? Array.from({ length: details.number_of_seasons }, (_, i) => ({ season_number: i + 1, name: `Season ${i + 1}` }))
          : [];
        setTvState(prev => ({ ...prev, details, seasons: seasonsArray, loading: false }));
        if (details.number_of_seasons > 0) await fetchSeasonEpisodes(tvShowId, 1);
      } catch {
        Alert.alert('Error', 'Failed to load TV show details');
        setTvState(prev => ({ ...prev, loading: false }));
      }
    },
    [fetchSeasonEpisodes],
  );

  const handleSeasonChange = useCallback(
    (seasonNumber: number) => {
      hasAppliedWatchProgressRef.current = true;
      setTvState(prev => ({ ...prev, selectedSeason: seasonNumber, selectedEpisode: null }));
      if (validContent && !isMovie) fetchSeasonEpisodes(validContent.id, seasonNumber);
    },
    [validContent, fetchSeasonEpisodes, isMovie],
  );

  const handleEpisodeChange = useCallback(
    (episodeNumber: number, _episodeName: string) => {
      hasAppliedWatchProgressRef.current = true;
      pendingFullscreenRef.current = isVideoFullscreen;
      setTvState(prev => ({ ...prev, selectedEpisode: episodeNumber }));
      setInitialVideoDuration(0);
      setCurrentVideoUrl('');
      setShowVideoPlayer(false);
      if (autoplayEnabled) setScraping({ show: true, active: true, error: null });
    },
    [autoplayEnabled, isVideoFullscreen],
  );

  useEffect(() => {
    if (showVideoPlayer || currentVideoUrl || !autoplayEnabled || isLocal) return;
    const { episodes, selectedSeason, selectedEpisode } = tvState;
    
    if (!isMovie) {
      if (watchProgress?.season && watchProgress?.episode) {
        setScraping({ show: true, active: true, error: null });
        return;
      }
      if (episodes.length === 0) return;
      if (selectedSeason === 1 && (selectedEpisode === 1 || selectedEpisode === null)) {
        if (selectedEpisode === null) setTvState(prev => ({ ...prev, selectedEpisode: 1 }));
        setScraping({ show: true, active: true, error: null });
      }
    } else {
      setScraping({ show: true, active: true, error: null });
    }
  }, [autoplayEnabled, showVideoPlayer, currentVideoUrl, isMovie, watchProgress, tvState, isLocal]);

  const handleVideoExtracted = useCallback(
    (data: { videoUrl: string; isWebM: boolean }) => {
      const { selectedSeason, selectedEpisode } = tvState;
      setCurrentVideoUrl(data.videoUrl);
      setShowVideoPlayer(true);
      setScraping({ show: false, active: false, error: null });

      const isTVShowResumingFromProgress = !isMovie && watchProgress?.season && watchProgress?.episode &&
        ((watchProgress.season === selectedSeason && watchProgress.episode === selectedEpisode) || selectedEpisode === null);
      const isManualEpisodeChange = hasAppliedWatchProgressRef.current && !isTVShowResumingFromProgress;
      const shouldApplyProgress = !isManualEpisodeChange && (watchProgress?.progress ?? 0) > 0 && (isMovie || isTVShowResumingFromProgress);

      setInitialVideoDuration(shouldApplyProgress && watchProgress ? (watchProgress.progress / 100) * watchProgress.duration : 0);

      if (pendingDownload) {
        setPendingDownload(false);
        Alert.alert('Video Ready', 'The video is now ready. You can now tap the download button to start downloading.', [{ text: 'OK' }]);
      }
    },
    [pendingDownload, isMovie, tvState, watchProgress],
  );

  const handleScrapingLoading = useCallback((loading: boolean) => {
    setScraping(prev => ({ ...prev, active: loading }));
  }, []);

  const handleScrapingError = useCallback((error: string) => {
    setScraping({ active: false, error, show: false });
    Alert.alert('Video Error', `Failed to load video: ${error}`, [{ text: 'OK', onPress: () => setScraping(prev => ({ ...prev, error: null })) }]);
  }, []);

  useEffect(() => {
    const { seasons, selectedSeason, episodes } = tvState;
    if (!validContent || isMovie || hasAppliedWatchProgressRef.current || !watchProgress?.season || !watchProgress?.episode || seasons.length === 0) return;
    if (!seasons.some(s => s.season_number === watchProgress.season)) { hasAppliedWatchProgressRef.current = true; return; }

    const apply = async () => {
      try {
        if (selectedSeason !== watchProgress.season) {
          setTvState(prev => ({ ...prev, selectedSeason: watchProgress.season! }));
          await fetchSeasonEpisodes(validContent.id, watchProgress.season!, { autoSelectEpisode: watchProgress.episode });
        } else {
          const matched = episodes.find((ep: any) => ep.episode_number === watchProgress.episode);
          if (matched) setTvState(prev => ({ ...prev, selectedEpisode: matched.episode_number }));
          else await fetchSeasonEpisodes(validContent.id, selectedSeason, { autoSelectEpisode: watchProgress.episode });
        }
      } finally { hasAppliedWatchProgressRef.current = true; }
    };
    apply();
  }, [validContent, tvState, fetchSeasonEpisodes, isMovie, watchProgress]);

  useEffect(() => {
    if (!validContent) return;
    
    fetchSimilarContent(validContent);
    if (!isMovie) {
      fetchTVShowDetails(validContent.id);
    }
  }, [validContent, fetchSimilarContent, fetchTVShowDetails, isMovie]);

  return (
    <SafeAreaView style={styles.container}>
      {!validContent ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Content not found or invalid.</Text>
        </View>
      ) : (
        <View style={styles.videoSection}>
          {isLocal ? (
            localFileExists && currentVideoUrl ? (
              <MediaPlayer
                videoUrl={currentVideoUrl}
                title={contentTitle}
                imageUrl={imageUrl}
                contentType="movie"
                contentId={content?.id}
                autoplay={autoPlay ?? true}
                initialProgress={0}
                season={!isMovie ? tvState.selectedSeason : undefined}
                episode={!isMovie ? tvState.selectedEpisode ?? undefined : undefined}
                onEnd={handleCloseVideo}
                onNext={!isMovie && tvState.selectedEpisode !== null ? () => handleEpisodeChange(tvState.selectedEpisode! + 1, '') : undefined}
                navigation={navigation}
                onFullscreenChange={setIsVideoFullscreen}
              />
            ) : (
              <View style={styles.loadingContainer}>
                <Text style={styles.errorText}>Downloaded file not found or cannot be played.</Text>
              </View>
            )
          ) : (
            showVideoPlayer && currentVideoUrl ? (
              <MediaPlayer
                key={`${validContent?.id}-${tvState.selectedSeason}-${tvState.selectedEpisode}`}
                videoUrl={currentVideoUrl}
                title={contentTitle}
                imageUrl={imageUrl}
                contentType={contentType}
                contentId={validContent?.id}
                autoplay={autoplayEnabled}
                initialProgress={initialVideoDuration}
                season={!isMovie ? tvState.selectedSeason : undefined}
                episode={!isMovie ? tvState.selectedEpisode ?? undefined : undefined}
                onEnd={handleCloseVideo}
                onNext={!isMovie && tvState.selectedEpisode !== null ? () => handleEpisodeChange(tvState.selectedEpisode! + 1, '') : undefined}
                navigation={navigation}
                fullscreen={pendingFullscreenRef.current}
                onFullscreenChange={setIsVideoFullscreen}
              />
            ) : (
              <ImageBackground source={{ uri: imageUrl }} resizeMode="cover">
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                  <Icon name="arrow-left" size={sizes.width * 0.05} color={colors.white} />
                </TouchableOpacity>
                <LinearGradient colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,1)']} style={styles.videoOverlay}>
                  <TouchableOpacity
                    style={styles.playButtonContainer}
                    onPress={() => {
                      if (!isMovie) {
                        hasAppliedWatchProgressRef.current = true;
                        if (tvState.selectedEpisode === null && tvState.episodes.length > 0) {
                          setTvState(prev => ({ ...prev, selectedEpisode: tvState.episodes[0].episode_number }));
                        }
                      }
                      setScraping({ show: true, active: true, error: null });
                    }}
                    disabled={scraping.active}
                  >
                    {scraping.active ? (
                      <>
                        <ActivityIndicator size="small" color={COLORS.NETFLIX_WHITE} />
                        <Text style={styles.playButtonText}>Loading video...</Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.playButtonIcon}>▶</Text>
                        <Text style={styles.playButtonText}>Play {contentTitle}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </LinearGradient>
              </ImageBackground>
            )
          )}
        </View>
      )}
      {!isVideoFullscreen && (
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {scraping.error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Failed to load video: {scraping.error}</Text>
            </View>
          )}

          <View style={styles.contentHeader}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{contentTitle}</Text>
              <View style={styles.actionButtons}>
                {!isLocal && (
                  <DownloadButton
                    content={content}
                    videoUrl={currentVideoUrl}
                    season={!isMovie ? tvState.selectedSeason : undefined}
                    episode={!isMovie ? tvState.selectedEpisode ?? undefined : undefined}
                    episodeTitle={!isMovie && tvState.episodes.length > 0 ? tvState.episodes.find(ep => ep.episode_number === tvState.selectedEpisode)?.name : undefined}
                    size="medium"
                    style={styles.downloadButton}
                    onVideoNeeded={() => { setPendingDownload(true); setScraping({ show: true, active: true, error: null }); }}
                    isPreparingVideo={scraping.active && pendingDownload}
                  />
                )}
                <TouchableOpacity
                  style={styles.likeButton}
                  onPress={toggleLike}
                  activeOpacity={0.7}
                >
                  <Icon
                    name={isLiked ? 'cards-heart' : 'cards-heart-outline'}
                    size={28}
                    color={isLiked ? COLORS.NETFLIX_RED : COLORS.NETFLIX_WHITE}
                    style={[styles.likeIcon, isLiked && styles.likeIconActive]}
                  />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.metaInfo}>
              <Text style={styles.year}>{releaseYear}</Text>
              <Text style={styles.rating}>★ {content?.vote_average?.toFixed(1)}</Text>
              {isLiked && <Text style={styles.likedIndicator}>• Liked</Text>}
            </View>
          </View>

          {content?.overview && (
            <View style={styles.overviewContainer}>
              <Text style={styles.sectionTitle}>Overview</Text>
              <Text style={styles.overview}>{content.overview}</Text>
            </View>
          )}

          <View style={styles.additionalInfo}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Type:</Text>
              <Text style={styles.infoValue}>{isMovie ? 'Movie' : 'TV Show'}</Text>
            </View>

            {genreDisplayNames.length > 0 && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Genres:</Text>
                <Text style={styles.infoValue}>
                  {genreDisplayNames.slice(0, 3).join(', ')}
                </Text>
              </View>
            )}

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Popularity:</Text>
              <Text style={styles.infoValue}>
                {content?.popularity?.toFixed(0)}
              </Text>
            </View>
          </View>

          {!isMovie && tvState.details && (
            <View style={styles.episodeSelectorContainer}>
              {tvState.seasons.length > 1 && (
                <View style={styles.selectorSection}>
                  <Text style={styles.selectorLabel}>Season:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.seasonSelector}>
                    {tvState.seasons.map(season => (
                      <TouchableOpacity
                        key={season.season_number}
                        style={[styles.seasonButton, tvState.selectedSeason === season.season_number && styles.seasonButtonActive]}
                        onPress={() => handleSeasonChange(season.season_number)}
                      >
                        <Text style={[styles.seasonButtonText, tvState.selectedSeason === season.season_number && styles.seasonButtonTextActive]}>
                          {season.season_number}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {tvState.episodes.length > 0 && (
                <View style={styles.selectorSection}>
                  <Text style={styles.selectorLabel}>Episodes:</Text>
                  <View style={styles.episodesList}>
                    {tvState.episodes.map(episode => (
                      <TouchableOpacity
                        key={episode.episode_number}
                        style={[styles.episodeItem, tvState.selectedEpisode === episode.episode_number && styles.episodeItemActive]}
                        onPress={() => handleEpisodeChange(episode.episode_number, episode.name)}
                      >
                        <View style={styles.episodeImageContainer}>
                          {episode.still_path ? (
                            <Image source={{ uri: `https://image.tmdb.org/t/p/w300${episode.still_path}` }} style={styles.episodeImage} resizeMode="cover" />
                          ) : (
                            <View style={styles.episodePlaceholder}>
                              <Text style={styles.episodePlaceholderText}>No Image Available</Text>
                            </View>
                          )}
                          <View style={styles.episodePlayOverlay}>
                            <View style={styles.episodePlayButton}>
                              <Text style={styles.episodePlayIcon}>▶</Text>
                            </View>
                          </View>
                          {tvState.selectedEpisode === episode.episode_number && (
                            <View style={styles.selectedBadge}>
                              <Text style={styles.selectedBadgeText}>Playing</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.episodeInfo}>
                          <View style={styles.episodeHeader}>
                            <Text style={styles.episodeNumber}>Episode {episode.episode_number}</Text>
                            {episode.runtime && <Text style={styles.episodeRuntime}>{episode.runtime}min</Text>}
                          </View>
                          <Text style={[styles.episodeName, tvState.selectedEpisode === episode.episode_number && styles.episodeNameActive]} numberOfLines={2}>
                            {episode.name}
                          </Text>
                          {episode.overview && <Text style={styles.episodeOverview} numberOfLines={3}>{episode.overview}</Text>}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {tvState.loading && <Text style={styles.loadingText}>Loading episodes...</Text>}
            </View>
          )}

          <View style={styles.moreLikeThisContainer}>
            <HorizontalScrollList
              title="More Like This"
              data={similarContent}
              onItemPress={handleSimilarItemPress}
              loading={loadingSimilar}
              onEndReached={handleLoadMoreSimilar}
              hasMore={hasMoreSimilar}
              loadingMore={loadingMoreSimilar}
            />
          </View>

          <View style={styles.bottomPadding} />
        </ScrollView>
      )}

      {scraping.show && (
        <WebViewScrapper
          tmdbId={content?.id}
          type={contentType}
          seasonNumber={!isMovie ? tvState.selectedSeason : undefined}
          episodeNumber={!isMovie ? tvState.selectedEpisode ?? undefined : undefined}
          onDataExtracted={handleVideoExtracted}
          onLoading={handleScrapingLoading}
          onError={handleScrapingError}
        />
      )}
    </SafeAreaView>
  );
};

export default DetailScreen;
