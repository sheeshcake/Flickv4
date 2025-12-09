import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  Image,
  ActivityIndicator,
  ImageBackground,
} from 'react-native';
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

type DetailScreenProps = RootStackScreenProps<'Detail'>;

const tmdbService = new TMDBService();

const { height: screenHeight } = Dimensions.get('window');
const VIDEO_HEIGHT = screenHeight * 0.33; // 16:9 aspect ratio

const DetailScreen: React.FC<DetailScreenProps> = ({ route, navigation }) => {
  const { content, video: localVideoPath, isLocal, autoPlay } = route.params || {};
  // Defensive: fallback if content is not an object
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
    // Check if local file exists (if playing local)
    useEffect(() => {
      if (isLocal && localVideoPath) {
        // Use RNFS or Expo FileSystem to check file existence
        const checkFile = async () => {
          try {
            // Dynamically require to avoid breaking web builds
            const RNFS = require('react-native-fs');
            const exists = await RNFS.exists(localVideoPath);
            setLocalFileExists(!!exists);
            if (exists) {
              setCurrentVideoUrl(localVideoPath);
              setShowVideoPlayer(true);
            } else {
              setCurrentVideoUrl('');
              setShowVideoPlayer(false);
            }
          } catch (e) {
            setLocalFileExists(false);
            setCurrentVideoUrl('');
            setShowVideoPlayer(false);
          }
        };
        checkFile();
      }
    }, [isLocal, localVideoPath]);
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [tvShowDetails, setTvShowDetails] = useState<any>(null);
  const [scrapingVideo, setScrapingVideo] = useState(false);
  const [scrapingError, setScrapingError] = useState<string | null>(null);
  const [showScrapper, setShowScrapper] = useState(false);
  const [pendingDownload, setPendingDownload] = useState(false);
  const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);
  const hasAppliedWatchProgressRef = useRef(false);

  // Get autoplay preference from user settings
  const autoplayEnabled = state.user.preferences.autoplay;

  // Determine if content is a movie or TV show
  const isMovie = useCallback((item: Movie | TVShow): item is Movie => {
    return !!item && typeof item === 'object' && 'title' in item;
  }, []);

  const genreDisplayNames = useMemo(() => {
    if (!validContent) return [];
    const detailedGenres = isMovie(validContent)
      ? (validContent as any).genres
      : tvShowDetails?.genres;

    if (Array.isArray(detailedGenres) && detailedGenres.length > 0) {
      return detailedGenres
        .map((genre: any) => genre?.name)
        .filter((name: string | undefined): name is string => Boolean(name));
    }

    if (Array.isArray(validContent?.genre_ids) && validContent?.genre_ids.length > 0) {
      const mapped = validContent?.genre_ids
        .map((id: any) => getGenreNameById(id))
        .filter((name: string | undefined): name is string => Boolean(name));
      return Array.from(new Set(mapped));
    }

    return [];
  }, [validContent, tvShowDetails, isMovie]);

  // Check if content is liked
  const contentType = isMovie(validContent) ? 'movie' : 'tv';
  const isLiked = validContent ? isContentLiked(validContent?.id, contentType) : false;

  // Toggle like function
  const toggleLike = useCallback(async () => {
    if (!validContent) return;
    try {
      if (isLiked) {
        await removeLikedContent(validContent?.id, contentType);
      } else {
        await addLikedContent(validContent?.id, contentType);
      }
    } catch (error) {
      console.error('Failed to toggle like:', error);
      Alert.alert('Error', 'Failed to update your liked content');
    }
  }, [isLiked, validContent, contentType, addLikedContent, removeLikedContent]);

  // Get saved watch progress for continue watching
  const watchProgress = validContent
    ? useContentWatchProgress(
        validContent?.id,
        isMovie(validContent) ? 'movie' : 'tv',
      )
    : undefined;

  useEffect(() => {
    if (validContent) {
      hasAppliedWatchProgressRef.current = false;
    }
  }, [validContent]);

  // Hide tab bar when video is in fullscreen
  useEffect(() => {
    // Try to find and hide the tab navigator
    let currentNavigator: any = navigation;
    let tabNavigator = null;
    
    // Traverse up the navigation tree to find the tab navigator
    while (currentNavigator) {
      const parent = currentNavigator.getParent();
      if (parent && parent.getState()?.type === 'tab') {
        tabNavigator = parent;
        break;
      }
      if (!parent) break;
      currentNavigator = parent;
    }
    
    if (tabNavigator) {
      tabNavigator.setOptions({
        tabBarStyle: { display: isVideoFullscreen ? 'none' : 'flex' },
      });
    }

    // Cleanup: restore tab bar when component unmounts
    return () => {
      if (tabNavigator) {
        tabNavigator.setOptions({
          tabBarStyle: { display: 'flex' },
        });
      }
    };
  }, [isVideoFullscreen, navigation]);

  // Get content title
  const getContentTitle = (item: Movie | TVShow): string => {
    if (!item) return '';
    return isMovie(item) ? item.title : item.name;
  };

  // Get content release date
  const getContentReleaseDate = (item: Movie | TVShow): string => {
    if (!item) return '';
    return isMovie(item) ? item.release_date : item.first_air_date;
  };

  // Fetch similar content
  const fetchSimilarContent = useCallback(
    async (item: Movie | TVShow, page: number = 1, isLoadMore: boolean = false) => {
      if (!item) {
        return;
      }

      if (isLoadMore) {
        setLoadingMoreSimilar(true);
      } else {
        setLoadingSimilar(true);
        setSimilarContent([]);
        setSimilarPage(1);
        setHasMoreSimilar(true);
      }

      try {
        let response: TMDBResponse<Movie | TVShow>;

        if (isMovie(item)) {
          response = await tmdbService.getSimilarMovies(item.id, page);
        } else {
          response = await tmdbService.getSimilarTVShows(item.id, page);
        }

        if (isLoadMore) {
          setSimilarContent(prev => [...prev, ...response.results]);
        } else {
          setSimilarContent(response.results);
        }

        setSimilarPage(page);
        setHasMoreSimilar(page < response.total_pages);
      } catch (error) {
        console.error('Error fetching similar content:', error);
        const appError = error as AppError;
        if (!isLoadMore) {
          Alert.alert(
            'Error',
            appError.message || 'Failed to load similar content',
          );
          setSimilarContent([]);
        }
      } finally {
        setLoadingSimilar(false);
        setLoadingMoreSimilar(false);
      }
    },
    [isMovie],
  );

  // Handle similar content item press
  const handleSimilarItemPress = useCallback(
    (item: Movie | TVShow) => {
      if (!item) return;
      navigation.push('Detail', { content: item });
    },
    [navigation],
  );

  // Handle loading more similar content
  const handleLoadMoreSimilar = useCallback(() => {
    if (!loadingMoreSimilar && hasMoreSimilar && !loadingSimilar && validContent) {
      fetchSimilarContent(validContent, similarPage + 1, true);
    }
  }, [loadingMoreSimilar, hasMoreSimilar, loadingSimilar, validContent, similarPage, fetchSimilarContent]);

  // Handle video player close
  const handleCloseVideo = useCallback(() => {
    setShowVideoPlayer(false);
    setCurrentVideoUrl('');
  }, []);

  // Fetch episodes for a specific season
  const fetchSeasonEpisodes = useCallback(
    async (
      tvShowId: number,
      seasonNumber: number,
      options?: { autoSelectEpisode?: number },
    ) => {
      try {
        const seasonDetails = await tmdbService.getSeasonDetails(
          tvShowId,
          seasonNumber,
        );
        const seasonEpisodes: any[] = seasonDetails.episodes || [];
        setEpisodes(seasonEpisodes);

        if (options?.autoSelectEpisode) {
          const matchedEpisode = seasonEpisodes.find(
            (episode: any) =>
              episode.episode_number === options.autoSelectEpisode,
          );

          if (matchedEpisode) {
            setSelectedEpisode(matchedEpisode.episode_number);
          }
        }
      } catch (error) {
        console.error('Error fetching season episodes:', error);
        setEpisodes([]);
      }
    },
    [],
  );

  // Fetch TV show details with seasons
  const fetchTVShowDetails = useCallback(
    async (tvShowId: number) => {
      if (!tvShowId) return;

      setLoadingSeasons(true);
      try {
        const details = await tmdbService.getTVShowDetails(tvShowId);
        setTvShowDetails(details);

        // Generate seasons array based on number_of_seasons
        if (details.number_of_seasons) {
          const seasonsArray = Array.from(
            { length: details.number_of_seasons },
            (_, i) => ({
              season_number: i + 1,
              name: `Season ${i + 1}`,
            }),
          );
          setSeasons(seasonsArray);

          // Fetch episodes for the first season
          if (details.number_of_seasons > 0) {
            await fetchSeasonEpisodes(tvShowId, 1);
          }
        }
      } catch (error) {
        console.error('Error fetching TV show details:', error);
        Alert.alert('Error', 'Failed to load TV show details');
      } finally {
        setLoadingSeasons(false);
      }
    },
    [fetchSeasonEpisodes],
  );

  // Handle season selection
  const handleSeasonChange = useCallback(
    (seasonNumber: number) => {
      hasAppliedWatchProgressRef.current = true;
      setSelectedSeason(seasonNumber);
      setSelectedEpisode(null);
      if (validContent && !isMovie(validContent)) {
        fetchSeasonEpisodes(validContent?.id, seasonNumber);
      }
    },
    [validContent, fetchSeasonEpisodes, isMovie],
  );

  // Handle episode selection
  const handleEpisodeChange = useCallback(
    (episodeNumber: number, _episodeName: string) => {
      hasAppliedWatchProgressRef.current = false;
      setSelectedEpisode(episodeNumber);
      setInitialVideoDuration(0);
      // reset watch progress for new episode
      // If autoplay is enabled, start scraping and playing the new episode
      if (autoplayEnabled) {
        setShowScrapper(true);
        setScrapingVideo(true);
        setScrapingError(null);
        setShowVideoPlayer(false);
      }
    },
    [autoplayEnabled],
  );

  // Auto-start video if autoplay is enabled
  useEffect(() => {
    if (showVideoPlayer || currentVideoUrl) {
      return;
    }
    if (!autoplayEnabled) {
      return;
    }
    if(!isLocal){
      if (!isMovie(content)) {
        if (watchProgress && watchProgress.season && watchProgress.episode) {
          setShowScrapper(true);
          setScrapingVideo(true);
          return;
        }
        if (episodes.length === 0) {
          return;
        }
        if (selectedSeason === 1 && (selectedEpisode === 1 || selectedEpisode === null)) {
          // If episode is not yet selected, select the first episode
          if (selectedEpisode === null) {
            setSelectedEpisode(1);
          }
          setShowScrapper(true);
          setScrapingVideo(true);
          setScrapingError(null);
        }
      } else {
        
          setShowScrapper(true);
          setScrapingVideo(true);
          setScrapingError(null);
      }
    }
  }, [autoplayEnabled, showVideoPlayer, currentVideoUrl, content, isMovie, watchProgress, episodes.length, selectedSeason, selectedEpisode, isLocal]);

  // Handle video data extracted from WebViewScrapper
  const handleVideoExtracted = useCallback(
    (data: { videoUrl: string; isWebM: boolean }) => {
      console.log('Video extracted successfully:', { 
        videoUrl: data.videoUrl.substring(0, 100),
        isWebM: data.isWebM,
        contentId: content?.id,
        contentType: isMovie(content) ? 'movie' : 'tv',
        season: selectedSeason,
        episode: selectedEpisode
      });
      setCurrentVideoUrl(data.videoUrl);
      setShowVideoPlayer(true);
      setShowScrapper(false);
      setScrapingVideo(false);

      setInitialVideoDuration(watchProgress ? (watchProgress.progress / 100) * watchProgress.duration : 0);

      if (pendingDownload) {
        setPendingDownload(false);
        Alert.alert(
          'Video Ready',
          'The video is now ready. You can now tap the download button to start downloading.',
          [{ text: 'OK' }],
        );
      }
    },
    [pendingDownload, content, isMovie, selectedSeason, selectedEpisode],
  );

  // Handle scraper loading state
  const handleScrapingLoading = useCallback((loading: boolean) => {
    setScrapingVideo(loading);
  }, []);

  // Handle scraper errors
  const handleScrapingError = useCallback((error: string) => {
    setScrapingError(error);
    setScrapingVideo(false);
    setShowScrapper(false);
    Alert.alert('Video Error', `Failed to load video: ${error}`, [
      { text: 'OK', onPress: () => setScrapingError(null) },
    ]);
  }, []);

  useEffect(() => {
    if (
      !validContent ||
      isMovie(validContent) ||
      hasAppliedWatchProgressRef.current ||
      !watchProgress ||
      !watchProgress.season ||
      !watchProgress.episode ||
      seasons.length === 0
    ) {
      return;
    }

    const seasonExists = seasons.some(
      season => season.season_number === watchProgress.season,
    );

    if (!seasonExists) {
      hasAppliedWatchProgressRef.current = true;
      return;
    }

    const targetSeason = watchProgress.season!;
    const targetEpisode = watchProgress.episode!;

    const applyWatchProgressSelection = async () => {
      try {
        if (selectedSeason !== targetSeason) {
          setSelectedSeason(targetSeason);
          await fetchSeasonEpisodes(validContent?.id, targetSeason, {
            autoSelectEpisode: targetEpisode,
          });
        } else {
          const matchedEpisode = episodes.find(
            (episode: any) => episode.episode_number === targetEpisode,
          );

          if (matchedEpisode) {
            setSelectedEpisode(matchedEpisode.episode_number);
          } else {
            await fetchSeasonEpisodes(validContent?.id, selectedSeason, {
              autoSelectEpisode: targetEpisode,
            });
          }
        }
      } finally {
        hasAppliedWatchProgressRef.current = true;
      }
    };

    applyWatchProgressSelection();
  }, [
    validContent,
    episodes,
    fetchSeasonEpisodes,
    isMovie,
    seasons,
    selectedSeason,
    watchProgress,
  ]);

  // Effect to fetch similar content and TV show details when component mounts
  useEffect(() => {
    if (validContent) {
      fetchSimilarContent(validContent);

      // If it's a TV show, fetch detailed information including seasons
      if (!isMovie(validContent)) {
        fetchTVShowDetails(validContent?.id);
      }
    }
  }, [validContent, fetchSimilarContent, fetchTVShowDetails, isMovie]);

  const contentTitle = getContentTitle(validContent);
  const contentReleaseDate = getContentReleaseDate(validContent);
  const releaseYear = contentReleaseDate
    ? new Date(contentReleaseDate).getFullYear()
    : 'Unknown';

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
                imageUrl={`https://image.tmdb.org/t/p/w500${validContent?.backdrop_path || validContent?.poster_path}`}
                contentType={"movie"}
                contentId={content?.id}
                autoplay={autoPlay ?? true}
                initialProgress={0}
                season={!isMovie(validContent) ? selectedSeason : undefined}
                episode={!isMovie(validContent) ? selectedEpisode ?? undefined : undefined}
                onEnd={handleCloseVideo}
                onNext={
                  !isMovie(validContent) && selectedEpisode !== null
                    ? () => handleEpisodeChange(selectedEpisode + 1, '')
                    : undefined
                }
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
                videoUrl={currentVideoUrl}
                title={contentTitle}
                imageUrl={`https://image.tmdb.org/t/p/w500${validContent?.backdrop_path || validContent?.poster_path}`}
                contentType={isMovie(validContent) ? 'movie' : 'tv'}
                contentId={validContent?.id}
                autoplay={autoplayEnabled}
                initialProgress={initialVideoDuration}
                season={!isMovie(validContent) ? selectedSeason : undefined}
                episode={!isMovie(validContent) ? selectedEpisode ?? undefined : undefined}
                onEnd={handleCloseVideo}
                onNext={
                  !isMovie(validContent) && selectedEpisode !== null
                    ? () => handleEpisodeChange(selectedEpisode + 1, '')
                    : undefined
                }
                navigation={navigation}
                onFullscreenChange={setIsVideoFullscreen}
              />
            ) : (
              <ImageBackground
                source={{
                  uri: `https://image.tmdb.org/t/p/w500${validContent?.backdrop_path || validContent?.poster_path}`,
                }}
                resizeMode="cover"
              >
                {/* add back button */}
                <TouchableOpacity
                  onPress={() => navigation.goBack()}
                  style={styles.backButton}
                >
                  <Icon name="arrow-left" size={sizes.width * 0.05} color={colors.white} />
                </TouchableOpacity>
                <LinearGradient
                  colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,1)']}
                  style={styles.videoOverlay}
                >
                  <TouchableOpacity
                    style={[styles.playButtonContainer]}
                    onPress={() => {
                      if (!isMovie(validContent)) {
                        hasAppliedWatchProgressRef.current = true;
                        if (selectedEpisode === null && episodes.length > 0) {
                          setSelectedEpisode(episodes[0].episode_number);
                        }
                      }
                      setShowScrapper(true);
                      setScrapingVideo(true);
                      setScrapingError(null);
                    }}
                    disabled={scrapingVideo}
                  >
                    {scrapingVideo ? (
                      <>
                        <ActivityIndicator
                          size="small"
                          color={COLORS.NETFLIX_WHITE}
                        />
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
          {/* Error Display */}
          {scrapingError && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>
                Failed to load video: {scrapingError}
              </Text>
            </View>
          )}

          {/* Content Header */}
          <View style={styles.contentHeader}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{contentTitle}</Text>
              <View style={styles.actionButtons}>
                { !isLocal && (
                <DownloadButton
                  content={content}
                  videoUrl={currentVideoUrl}
                  season={!isMovie(content) ? selectedSeason : undefined}
                  episode={
                    !isMovie(content) ? selectedEpisode ?? undefined : undefined
                  }
                  episodeTitle={
                    !isMovie(content) && episodes.length > 0
                      ? episodes.find(
                          ep => ep.episode_number === selectedEpisode,
                        )?.name
                      : undefined
                  }
                  size="medium"
                  style={styles.downloadButton}
                  onVideoNeeded={() => {
                    // Trigger video scraping when download is attempted but no URL is available
                    setPendingDownload(true);
                    setShowScrapper(true);
                    setScrapingVideo(true);
                    setScrapingError(null);
                  }}
                  isPreparingVideo={scrapingVideo && pendingDownload}
                />)}
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
              <Text style={styles.rating}>
                ★ {content?.vote_average?.toFixed(1)}
              </Text>
              {isLiked && <Text style={styles.likedIndicator}>• Liked</Text>}
            </View>
          </View>

          {/* Content Overview */}
          {content?.overview ? (
            <View style={styles.overviewContainer}>
              <Text style={styles.sectionTitle}>Overview</Text>
              <Text style={styles.overview}>{content?.overview}</Text>
            </View>
          ) : null}

          {/* Additional Info */}
          <View style={styles.additionalInfo}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Type:</Text>
              <Text style={styles.infoValue}>
                {isMovie(content) ? 'Movie' : 'TV Show'}
              </Text>
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

          {/* Season and Episode Selectors for TV Shows */}
          {!isMovie(content) && tvShowDetails && (
            <View style={styles.episodeSelectorContainer}>
              {/* Season Selector */}
              {seasons.length > 1 && (
                <View style={styles.selectorSection}>
                  <Text style={styles.selectorLabel}>Season:</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.seasonSelector}
                  >
                    {seasons.map(season => (
                      <TouchableOpacity
                        key={season.season_number}
                        style={[
                          styles.seasonButton,
                          selectedSeason === season.season_number &&
                            styles.seasonButtonActive,
                        ]}
                        onPress={() => handleSeasonChange(season.season_number)}
                      >
                        <Text
                          style={[
                            styles.seasonButtonText,
                            selectedSeason === season.season_number &&
                              styles.seasonButtonTextActive,
                          ]}
                        >
                          {season.season_number}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Episode Selector */}
              {episodes.length > 0 && (
                <View style={styles.selectorSection}>
                  <Text style={styles.selectorLabel}>Episodes:</Text>
                  <View style={styles.episodesList}>
                    {episodes.map(episode => (
                      <TouchableOpacity
                        key={episode.episode_number}
                        style={[
                          styles.episodeItem,
                          selectedEpisode === episode.episode_number &&
                            styles.episodeItemActive,
                        ]}
                        onPress={() =>
                          handleEpisodeChange(
                            episode.episode_number,
                            episode.name,
                          )
                        }
                      >
                        <View style={styles.episodeImageContainer}>
                          {episode.still_path ? (
                            <Image
                              source={{
                                uri: `https://image.tmdb.org/t/p/w300${episode.still_path}`,
                              }}
                              style={styles.episodeImage}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={styles.episodePlaceholder}>
                              <Text style={styles.episodePlaceholderText}>
                                No Image Available
                              </Text>
                            </View>
                          )}
                          <View style={styles.episodePlayOverlay}>
                            <View style={styles.episodePlayButton}>
                              <Text style={styles.episodePlayIcon}>▶</Text>
                            </View>
                          </View>
                          {selectedEpisode === episode.episode_number && (
                            <View style={styles.selectedBadge}>
                              <Text style={styles.selectedBadgeText}>
                                Playing
                              </Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.episodeInfo}>
                          <View style={styles.episodeHeader}>
                            <Text style={styles.episodeNumber}>
                              Episode {episode.episode_number}
                            </Text>
                            {episode.runtime && (
                              <Text style={styles.episodeRuntime}>
                                {episode.runtime}min
                              </Text>
                            )}
                          </View>

                          <Text
                            style={[
                              styles.episodeName,
                              selectedEpisode === episode.episode_number &&
                                styles.episodeNameActive,
                            ]}
                            numberOfLines={2}
                          >
                            {episode.name}
                          </Text>

                          {episode.overview && (
                            <Text
                              style={styles.episodeOverview}
                              numberOfLines={3}
                            >
                              {episode.overview}
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {loadingSeasons && (
                <Text style={styles.loadingText}>Loading episodes...</Text>
              )}
            </View>
          )}

          {/* More Like This Section */}
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

          {/* Add some bottom padding for better scrolling */}
          <View style={styles.bottomPadding} />
        </ScrollView>
      )}

      {/* WebViewScrapper for video extraction */}
      {showScrapper && (
        <WebViewScrapper
          tmdbId={content?.id}
          type={isMovie(content) ? 'movie' : 'tv'}
          seasonNumber={!isMovie(content) ? selectedSeason : undefined}
          episodeNumber={
            !isMovie(content) ? selectedEpisode ?? undefined : undefined
          }
          onDataExtracted={handleVideoExtracted}
          onLoading={handleScrapingLoading}
          onError={handleScrapingError}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.NETFLIX_BLACK,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 25,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.NETFLIX_GRAY,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  contentHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 28,
    fontWeight: 'bold',
    lineHeight: 34,
    flex: 1,
    marginRight: 8,
  },
  metaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  year: {
    color: COLORS.NETFLIX_GRAY,
    fontSize: 16,
    marginRight: 20,
  },
  rating: {
    color: COLORS.NETFLIX_GRAY,
    fontSize: 16,
  },
  overviewContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  sectionTitle: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  overview: {
    color: COLORS.NETFLIX_LIGHT_GRAY,
    fontSize: 16,
    lineHeight: 24,
  },
  additionalInfo: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'center',
  },
  infoLabel: {
    color: COLORS.NETFLIX_GRAY,
    fontSize: 14,
    fontWeight: '500',
    width: 80,
  },
  infoValue: {
    color: COLORS.NETFLIX_LIGHT_GRAY,
    fontSize: 14,
    flex: 1,
  },
  moreLikeThisContainer: {
    paddingTop: 12,
  },
  bottomPadding: {
    height: 40,
  },
  // Video Player Styles
  videoSection: {
    height: VIDEO_HEIGHT,
  },
  videoContainer: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  videoPlayer: {
    width: '100%',
    height: VIDEO_HEIGHT,
    backgroundColor: COLORS.NETFLIX_BLACK,
  },
  closeVideoButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  closeVideoText: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 18,
    fontWeight: 'bold',
  },
  playButtonContainer: {
    height: VIDEO_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.NETFLIX_RED,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  playButtonIcon: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 20,
    fontWeight: 'bold',
    marginRight: 12,
  },
  playButtonText: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 18,
    fontWeight: '600',
  },
  loadingContainer: {
    height: VIDEO_HEIGHT,
    backgroundColor: COLORS.NETFLIX_DARK_GRAY,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.NETFLIX_GRAY,
  },
  loadingText: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 16,
    fontWeight: '500',
  },
  // Episode Selector Styles
  episodeSelectorContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  selectorSection: {
    marginBottom: 20,
  },
  selectorLabel: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  seasonSelector: {
    paddingVertical: 8,
  },
  episodeSelector: {
    paddingVertical: 8,
  },
  seasonButton: {
    backgroundColor: COLORS.NETFLIX_DARK_GRAY,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1,
    borderColor: COLORS.NETFLIX_GRAY,
    minWidth: 50,
    alignItems: 'center',
  },
  seasonButtonActive: {
    backgroundColor: COLORS.NETFLIX_RED,
    borderColor: COLORS.NETFLIX_RED,
  },
  seasonButtonText: {
    color: COLORS.NETFLIX_LIGHT_GRAY,
    fontSize: 16,
    fontWeight: '600',
  },
  seasonButtonTextActive: {
    color: COLORS.NETFLIX_WHITE,
  },
  // New Episode List Styles
  episodesList: {
    marginTop: 8,
  },
  episodeItem: {
    flexDirection: 'row',
    backgroundColor: COLORS.NETFLIX_DARK_GRAY,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  episodeItemActive: {
    borderColor: COLORS.NETFLIX_RED,
    backgroundColor: '#1a0000',
  },
  episodeImageContainer: {
    position: 'relative',
    width: 120,
    height: 135,
  },
  episodeImage: {
    width: '100%',
    height: '100%',
  },
  episodePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.NETFLIX_GRAY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodePlaceholderText: {
    fontSize: 24,
  },
  episodePlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodePlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodePlayIcon: {
    color: COLORS.NETFLIX_BLACK,
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 2,
  },
  selectedBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: COLORS.NETFLIX_RED,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  selectedBadgeText: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  episodeInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  episodeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 1,
  },
  episodeNumber: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 14,
    fontWeight: '600',
  },
  episodeRuntime: {
    color: COLORS.NETFLIX_GRAY,
    fontSize: 12,
  },
  episodeName: {
    color: COLORS.NETFLIX_LIGHT_GRAY,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3,
  },
  episodeNameActive: {
    color: COLORS.NETFLIX_WHITE,
  },
  episodeOverview: {
    color: COLORS.NETFLIX_GRAY,
    fontSize: 11,
  },
  // Keep these for backward compatibility
  episodeTitle: {
    color: COLORS.NETFLIX_GRAY,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
  episodeTitleActive: {
    color: COLORS.NETFLIX_LIGHT_GRAY,
  },
  errorContainer: {
    backgroundColor: COLORS.NETFLIX_RED,
    padding: 12,
    marginHorizontal: 20,
    marginVertical: 10,
    borderRadius: 8,
  },
  errorText: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 14,
    textAlign: 'center',
  },
  // Like functionality styles
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  downloadButton: {
    marginRight: 16,
  },
  likeButton: {
    marginRight: 10,
  },
  likeIcon: {
    margin: 0,
    padding: 0,
  },
  likeIconActive: {
    transform: [{ scale: 1.15 }],
  },
  likedIndicator: {
    color: COLORS.NETFLIX_RED,
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 20,
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    zIndex: 10,
  },
  videoOverlay: { 
    width: '100%', 
    height: VIDEO_HEIGHT, 
    justifyContent: 'center', 
    alignItems: 'center' 
  }
});

export default DetailScreen;
