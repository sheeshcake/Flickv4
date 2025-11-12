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
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Movie, TVShow, TMDBResponse, AppError, WatchProgress } from '../types';
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

type DetailScreenProps = RootStackScreenProps<'Detail'>;

const tmdbService = new TMDBService();

const { height: screenHeight } = Dimensions.get('window');
const VIDEO_HEIGHT = screenHeight * 0.33; // 16:9 aspect ratio

const DetailScreen: React.FC<DetailScreenProps> = ({ route, navigation }) => {
  const { content } = route.params;
  const {
    state,
    addLikedContent,
    removeLikedContent,
    isContentLiked,
    updateWatchProgress,
  } = useAppState();
  const [similarContent, setSimilarContent] = useState<(Movie | TVShow)[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string>('');
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
    return 'title' in item;
  }, []);

  const genreDisplayNames = useMemo(() => {
    const detailedGenres = isMovie(content)
      ? (content as any).genres
      : tvShowDetails?.genres;

    if (Array.isArray(detailedGenres) && detailedGenres.length > 0) {
      return detailedGenres
        .map((genre: any) => genre?.name)
        .filter((name: string | undefined): name is string => Boolean(name));
    }

    if (Array.isArray(content.genre_ids) && content.genre_ids.length > 0) {
      const mapped = content.genre_ids
        .map(id => getGenreNameById(id))
        .filter((name): name is string => Boolean(name));
      return Array.from(new Set(mapped));
    }

    return [];
  }, [content, tvShowDetails, isMovie]);

  // Check if content is liked
  const contentType = isMovie(content) ? 'movie' : 'tv';
  const isLiked = isContentLiked(content.id, contentType);

  // Toggle like function
  const toggleLike = useCallback(async () => {
    try {
      if (isLiked) {
        await removeLikedContent(content.id, contentType);
      } else {
        await addLikedContent(content.id, contentType);
      }
    } catch (error) {
      console.error('Failed to toggle like:', error);
      Alert.alert('Error', 'Failed to update your liked content');
    }
  }, [isLiked, content.id, contentType, addLikedContent, removeLikedContent]);

  // Get saved watch progress for continue watching
  const watchProgress = useContentWatchProgress(
    content.id,
    isMovie(content) ? 'movie' : 'tv',
  );

  useEffect(() => {
    hasAppliedWatchProgressRef.current = false;
  }, [content.id]);

  // Get content title
  const getContentTitle = (item: Movie | TVShow): string => {
    return isMovie(item) ? item.title : item.name;
  };

  // Get content release date
  const getContentReleaseDate = (item: Movie | TVShow): string => {
    return isMovie(item) ? item.release_date : item.first_air_date;
  };

  // Fetch similar content
  const fetchSimilarContent = useCallback(
    async (item: Movie | TVShow) => {
      if (!item) {
        return;
      }

      setLoadingSimilar(true);
      try {
        let response: TMDBResponse<Movie | TVShow>;

        if (isMovie(item)) {
          response = await tmdbService.getSimilarMovies(item.id);
        } else {
          response = await tmdbService.getSimilarTVShows(item.id);
        }

        setSimilarContent(response.results.slice(0, 10)); // Limit to 10 items
      } catch (error) {
        console.error('Error fetching similar content:', error);
        const appError = error as AppError;
        Alert.alert(
          'Error',
          appError.message || 'Failed to load similar content',
        );
        setSimilarContent([]);
      } finally {
        setLoadingSimilar(false);
      }
    },
    [isMovie],
  );

  // Handle similar content item press
  const handleSimilarItemPress = useCallback(
    (item: Movie | TVShow) => {
      // Navigate to a new detail screen with the selected content
      navigation.push('Detail', { content: item });
    },
    [navigation],
  );

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
      if (!isMovie(content)) {
        fetchSeasonEpisodes(content.id, seasonNumber);
      }
    },
    [content, fetchSeasonEpisodes, isMovie],
  );

  // Handle episode selection
  const handleEpisodeChange = useCallback(
    (episodeNumber: number, _episodeName: string) => {
      hasAppliedWatchProgressRef.current = true;
      setSelectedEpisode(episodeNumber);
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
    if (autoplayEnabled && !showVideoPlayer && !currentVideoUrl) {
      setShowScrapper(true);
      setScrapingVideo(true);
      setScrapingError(null);
    }
  }, [autoplayEnabled, showVideoPlayer, currentVideoUrl]);

  // Handle video data extracted from WebViewScrapper
  const handleVideoExtracted = useCallback(
    (data: { videoUrl: string; isWebM: boolean }) => {
      console.log('Video extracted successfully:', { 
        videoUrl: data.videoUrl.substring(0, 100),
        isWebM: data.isWebM,
        contentId: content.id,
        contentType: isMovie(content) ? 'movie' : 'tv',
        season: selectedSeason,
        episode: selectedEpisode
      })
      
      setCurrentVideoUrl(data.videoUrl);
      setShowVideoPlayer(true);
      setShowScrapper(false);
      setScrapingVideo(false);

      // Force save an initial watch progress entry to ensure continue watching works
      const initialProgress: WatchProgress = {
        contentId: content.id,
        contentType: isMovie(content) ? 'movie' : 'tv',
        progress: 0,
        lastWatched: new Date(),
        duration: 0, // Will be updated when video loads
        season: !isMovie(content) ? selectedSeason : undefined,
        episode: !isMovie(content) ? selectedEpisode ?? undefined : undefined,
        selectedSubtitle: null,
      };

      try {
        updateWatchProgress(initialProgress);
        console.log('Saved initial watch progress for continue watching:', {
          contentId: content.id,
          contentType: isMovie(content) ? 'movie' : 'tv',
          season: !isMovie(content) ? selectedSeason : undefined,
          episode: !isMovie(content) ? selectedEpisode ?? undefined : undefined,
        });
      } catch (error) {
        console.error('Failed to save initial watch progress:', error);
      }

      // If there was a pending download, clear the flag
      // The DownloadButton will automatically detect the new videoUrl and user can try again
      if (pendingDownload) {
        setPendingDownload(false);
        Alert.alert(
          'Video Ready',
          'The video is now ready. You can now tap the download button to start downloading.',
          [{ text: 'OK' }],
        );
      }
    },
    [
      pendingDownload,
      content,
      isMovie,
      selectedSeason,
      selectedEpisode,
      updateWatchProgress,
    ],
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
      isMovie(content) ||
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
          await fetchSeasonEpisodes(content.id, targetSeason, {
            autoSelectEpisode: targetEpisode,
          });
        } else {
          const matchedEpisode = episodes.find(
            (episode: any) => episode.episode_number === targetEpisode,
          );

          if (matchedEpisode) {
            setSelectedEpisode(matchedEpisode.episode_number);
          } else {
            await fetchSeasonEpisodes(content.id, selectedSeason, {
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
    content,
    episodes,
    fetchSeasonEpisodes,
    isMovie,
    seasons,
    selectedSeason,
    watchProgress,
  ]);

  // Effect to fetch similar content and TV show details when component mounts
  useEffect(() => {
    if (content) {
      fetchSimilarContent(content);

      // If it's a TV show, fetch detailed information including seasons
      if (!isMovie(content)) {
        fetchTVShowDetails(content.id);
      }
    }
  }, [content, fetchSimilarContent, fetchTVShowDetails, isMovie]);

  const contentTitle = getContentTitle(content);
  const contentReleaseDate = getContentReleaseDate(content);
  const releaseYear = contentReleaseDate
    ? new Date(contentReleaseDate).getFullYear()
    : 'Unknown';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.videoSection}>
        {showVideoPlayer && currentVideoUrl ? (
          <MediaPlayer
            videoUrl={currentVideoUrl}
            title={contentTitle}
            imageUrl={`https://image.tmdb.org/t/p/w500${
              content.backdrop_path || content.poster_path
            }`}
            contentType={isMovie(content) ? 'movie' : 'tv'}
            contentId={content.id}
            autoplay={autoplayEnabled}
            initialProgress={
              watchProgress
                ? (watchProgress.progress / 100) * watchProgress.duration
                : 0
            }
            season={!isMovie(content) ? selectedSeason : undefined}
            episode={
              !isMovie(content) ? selectedEpisode ?? undefined : undefined
            }
            onEnd={handleCloseVideo}
            onNext={
              !isMovie(content) && selectedEpisode !== null
                ? () => handleEpisodeChange(selectedEpisode + 1, '')
                : undefined
            }
            navigation={navigation}
            onFullscreenChange={setIsVideoFullscreen}
          />
        ) : (
          <ImageBackground
            source={{
              uri: `https://image.tmdb.org/t/p/w500${
                content.backdrop_path || content.poster_path
              }`,
            }}
            resizeMode="cover"
          >
            <TouchableOpacity
              style={[styles.playButtonContainer]}
              onPress={() => {
                if (!isMovie(content)) {
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
          </ImageBackground>
        )}
      </View>
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
                />
                <TouchableOpacity
                  style={styles.likeButton}
                  onPress={toggleLike}
                  activeOpacity={0.7}
                >
                  <Icon
                    name={isLiked ? 'favorite' : 'favorite-border'}
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
                ★ {content.vote_average.toFixed(1)}
              </Text>
              {isLiked && <Text style={styles.likedIndicator}>• Liked</Text>}
            </View>
          </View>

          {/* Content Overview */}
          {content.overview ? (
            <View style={styles.overviewContainer}>
              <Text style={styles.sectionTitle}>Overview</Text>
              <Text style={styles.overview}>{content.overview}</Text>
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
                {content.popularity.toFixed(0)}
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
            />
          </View>

          {/* Add some bottom padding for better scrolling */}
          <View style={styles.bottomPadding} />
        </ScrollView>
      )}

      {/* WebViewScrapper for video extraction */}
      {showScrapper && (
        <WebViewScrapper
          tmdbId={content.id}
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
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 16,
    fontWeight: '500',
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
});

export default DetailScreen;
