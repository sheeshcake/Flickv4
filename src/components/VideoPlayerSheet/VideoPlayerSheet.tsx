import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  BackHandler,
  Pressable,
  ScrollView,
  ActivityIndicator,
  ImageBackground,
  Alert,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {COLORS} from '../../utils/constants';
import {useVideoPlayer} from '../../context';
import {useAppState} from '../../hooks/useAppState';
import {TMDBService} from '../../services';
import {Movie, TVShow, TMDBResponse} from '../../types';
import MediaPlayer from '../MediaPlayer';
import WebViewScrapper from '../WebViewScrapper';
import HorizontalScrollList from '../HorizontalScrollList';

const tmdbService = new TMDBService();

const {height: SCREEN_HEIGHT} = Dimensions.get('window');
const VIDEO_HEIGHT = SCREEN_HEIGHT * 0.33;
const MINI_PLAYER_HEIGHT = 60;
const MINIMIZE_THRESHOLD = 100;

const VideoPlayerSheet: React.FC = () => {
  const {playerState, closeDetailSheet, setPlaybackState, setVideoUrl, setEpisodeInfo} =
    useVideoPlayer();

  const {state, addLikedContent, removeLikedContent, isContentLiked} = useAppState();

  const [shouldClose, setShouldClose] = useState(false);
  const [similarContent, setSimilarContent] = useState<(Movie | TVShow)[]>([]);

  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [selectedSeason] = useState<number>(1);
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [showScrapper, setShowScrapper] = useState(false);

  const translationY = useSharedValue(0);
  const context = useSharedValue({y: 0});

  const content = playerState.content;
  const videoUrl = playerState.videoUrl;
  const autoplayEnabled = state.user.preferences.autoplay;

  const isMovie = useCallback((item: any): item is {title: string} => {
    return item && 'title' in item;
  }, []);

  const getContentTitle = () => {
    if (!content) return '';
    return isMovie(content) ? content.title : content.name;
  };

  const contentType = content && isMovie(content) ? 'movie' : 'tv';
  const isLiked = content ? isContentLiked(content.id, contentType) : false;

  const fetchSimilarContent = useCallback(
    async (item: Movie | TVShow) => {
      if (!item) return;
      setLoadingSimilar(true);
      try {
        let response: TMDBResponse<Movie | TVShow>;
        if (isMovie(item)) {
          response = await tmdbService.getSimilarMovies(item.id);
        } else {
          response = await tmdbService.getSimilarTVShows(item.id);
        }
        setSimilarContent(response.results.slice(0, 10));
      } catch (error) {
        console.error('Error fetching similar content:', error);
        setSimilarContent([]);
      } finally {
        setLoadingSimilar(false);
      }
    },
    [isMovie],
  );

  const fetchTVShowDetails = useCallback(async (tvShowId: number) => {
    if (!tvShowId) return;
    try {
      const details = await tmdbService.getTVShowDetails(tvShowId);
      if (details.number_of_seasons && details.number_of_seasons > 0) {
        const seasonDetails = await tmdbService.getSeasonDetails(tvShowId, 1);
        setEpisodes(seasonDetails.episodes || []);
      }
    } catch (error) {
      console.error('Error fetching TV show details:', error);
    }
  }, []);

  const handleVideoExtracted = useCallback(
    (data: {videoUrl: string; isWebM: boolean}) => {
      setVideoUrl(data.videoUrl);
      setShowScrapper(false);
      setPlaybackState(autoplayEnabled, 0, 0);
    },
    [autoplayEnabled, setVideoUrl, setPlaybackState],
  );

  useEffect(() => {
    if (content) {
      fetchSimilarContent(content);
      if (!isMovie(content)) {
        fetchTVShowDetails(content.id);
      }
    }
  }, [content, fetchSimilarContent, fetchTVShowDetails, isMovie]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      context.value = {y: translationY.value};
    })
    .onUpdate(event => {
      translationY.value = event.translationY + context.value.y;
      translationY.value = Math.max(0, translationY.value);
    })
    .onEnd(() => {
      if (translationY.value > MINIMIZE_THRESHOLD) {
        translationY.value = withSpring(SCREEN_HEIGHT - MINI_PLAYER_HEIGHT, {damping: 50});
      } else {
        translationY.value = withSpring(0, {damping: 50});
      }

      if (translationY.value > SCREEN_HEIGHT - 80) {
        translationY.value = withSpring(SCREEN_HEIGHT, {damping: 50});
        setShouldClose(true);
      }
    });

  useEffect(() => {
    if (shouldClose) {
      closeDetailSheet();
      setShouldClose(false);
    }
  }, [shouldClose, closeDetailSheet]);

  const enlargePlayer = useCallback(() => {
    translationY.value = withSpring(0, {damping: 50});
  }, [translationY]);

  const closeMiniPlayer = useCallback(() => {
    translationY.value = withSpring(SCREEN_HEIGHT, {damping: 50});
    setShouldClose(true);
  }, [translationY]);

  const togglePlayPause = useCallback(() => {
    setPlaybackState(!playerState.isPlaying, playerState.currentTime, playerState.duration);
  }, [playerState.isPlaying, playerState.currentTime, playerState.duration, setPlaybackState]);

  useEffect(() => {
    const handleBackPress = () => {
      if (translationY.value < MINIMIZE_THRESHOLD) {
        translationY.value = withSpring(SCREEN_HEIGHT - MINI_PLAYER_HEIGHT, {damping: 50});
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => backHandler.remove();
  }, [translationY]);

  const screenTranslationY = useAnimatedStyle(() => ({
    transform: [{translateY: translationY.value}],
  }));

  const interpolateScreenOpacity = useAnimatedStyle(() => {
    const opacity = interpolate(translationY.value, [0, 350, 600], [1, 0.5, 0], Extrapolation.CLAMP);
    return {opacity};
  });

  const interpolateVideoHeight = useAnimatedStyle(() => {
    const height = interpolate(
      translationY.value,
      [0, SCREEN_HEIGHT - 300, SCREEN_HEIGHT - 80],
      [VIDEO_HEIGHT, 150, MINI_PLAYER_HEIGHT],
      Extrapolation.CLAMP,
    );
    return {height};
  });

  const interpolateVideoWidth = useAnimatedStyle(() => {
    const width = interpolate(
      translationY.value,
      [0, 500, SCREEN_HEIGHT - 80],
      [100, 100, 30],
      Extrapolation.CLAMP,
    );
    return {width: `${width}%`};
  });

  const interpolateMiniPlayerContainerX = useAnimatedStyle(() => {
    const translateX = interpolate(
      translationY.value,
      [0, 500, SCREEN_HEIGHT - 80],
      [500, 500, 125],
      Extrapolation.CLAMP,
    );
    return {transform: [{translateX}]};
  });

  const interpolateMiniPlayerOpacity = useAnimatedStyle(() => {
    const opacity = interpolate(
      translationY.value,
      [0, 500, SCREEN_HEIGHT - 120, SCREEN_HEIGHT - 80],
      [0, 0, 0.5, 1],
      Extrapolation.CLAMP,
    );
    return {opacity};
  });

  if (!content) {
    return null;
  }

  const contentTitle = getContentTitle();

  return (
    <Animated.View style={[styles.container, screenTranslationY]}>
      <View style={styles.innerContainer}>
        <GestureDetector gesture={panGesture}>
          <View style={styles.videoPlayerContainer}>
            <TouchableOpacity activeOpacity={0.8} onPress={enlargePlayer}>
              <Animated.View
                style={[interpolateVideoHeight, interpolateVideoWidth, {minHeight: VIDEO_HEIGHT}]}>
                {videoUrl ? (
                  <MediaPlayer
                    videoUrl={videoUrl}
                    title={contentTitle}
                    imageUrl={`https://image.tmdb.org/t/p/w500${
                      content.backdrop_path || content.poster_path
                    }`}
                    contentType={isMovie(content) ? 'movie' : 'tv'}
                    contentId={content.id}
                    autoplay={true}
                    season={playerState.selectedSeason}
                    episode={playerState.selectedEpisode}
                  />
                ) : (
                  <ImageBackground
                    source={{
                      uri: `https://image.tmdb.org/t/p/w500${
                        content.backdrop_path || content.poster_path
                      }`,
                    }}
                    style={styles.placeholder}
                    resizeMode="cover">
                    <ActivityIndicator size="large" color={COLORS.NETFLIX_WHITE} />
                  </ImageBackground>
                )}
              </Animated.View>

              <Animated.View
                style={[
                  styles.miniPlayerContainer,
                  interpolateMiniPlayerContainerX,
                  interpolateMiniPlayerOpacity,
                ]}>
                <View style={styles.miniPlayerInfo}>
                  <Text style={styles.miniPlayerTitle} numberOfLines={1}>
                    {contentTitle.length > 30
                      ? `${contentTitle.substring(0, 27)}...`
                      : contentTitle}
                  </Text>
                  {playerState.selectedSeason && playerState.selectedEpisode && (
                    <Text style={styles.miniPlayerSubtitle}>
                      S{playerState.selectedSeason} E{playerState.selectedEpisode}
                    </Text>
                  )}
                </View>
                <View style={styles.miniPlayerControls}>
                  <Pressable onPress={togglePlayPause} style={styles.miniPlayerButton}>
                    <Icon
                      name={playerState.isPlaying ? 'pause' : 'play-arrow'}
                      size={28}
                      color={COLORS.NETFLIX_WHITE}
                    />
                  </Pressable>
                  <TouchableOpacity onPress={closeMiniPlayer} style={styles.miniPlayerButton}>
                    <Icon name="close" size={24} color={COLORS.NETFLIX_WHITE} />
                  </TouchableOpacity>
                </View>
              </Animated.View>
            </TouchableOpacity>
          </View>
        </GestureDetector>

        <View style={styles.contentContainer}>
          <Animated.View style={interpolateScreenOpacity}>
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
              <View style={styles.detailsSection}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>{contentTitle}</Text>
                  <TouchableOpacity
                    style={styles.likeButton}
                    onPress={() => {
                      if (!content) return;
                      if (isLiked) {
                        removeLikedContent(content.id, contentType);
                      } else {
                        addLikedContent(content.id, contentType);
                      }
                    }}
                    activeOpacity={0.7}>
                    <Icon
                      name={isLiked ? 'favorite' : 'favorite-border'}
                      size={28}
                      color={isLiked ? COLORS.NETFLIX_RED : COLORS.NETFLIX_WHITE}
                    />
                  </TouchableOpacity>
                </View>
                <Text style={styles.overview}>{content.overview}</Text>

                {!isMovie(content) && episodes.length > 0 && (
                  <View style={styles.episodesSection}>
                    <Text style={styles.sectionTitle}>Episodes</Text>
                    {episodes.slice(0, 5).map(episode => (
                      <TouchableOpacity
                        key={episode.episode_number}
                        style={styles.episodeItem}
                        onPress={() => {
                          setSelectedEpisode(episode.episode_number);
                          setEpisodeInfo(selectedSeason, episode.episode_number);
                          setShowScrapper(true);
                        }}>
                        <Text style={styles.episodeTitle}>
                          {episode.episode_number}. {episode.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <View style={styles.similarSection}>
                  <HorizontalScrollList
                    title="More Like This"
                    data={similarContent}
                    onItemPress={item => {
                      closeDetailSheet();
                      setTimeout(() => {
                        const {openDetailSheet} = require('../../context').useVideoPlayer();
                        openDetailSheet(item);
                      }, 100);
                    }}
                    loading={loadingSimilar}
                  />
                </View>
              </View>
            </ScrollView>
          </Animated.View>
        </View>

        {showScrapper && content && (
          <WebViewScrapper
            tmdbId={content.id}
            type={isMovie(content) ? 'movie' : 'tv'}
            seasonNumber={!isMovie(content) ? selectedSeason : undefined}
            episodeNumber={!isMovie(content) ? selectedEpisode ?? undefined : undefined}
            onDataExtracted={handleVideoExtracted}
            onLoading={() => {}}
            onError={error => {
              setShowScrapper(false);
              Alert.alert('Video Error', `Failed to load video: ${error}`);
            }}
          />
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.NETFLIX_BLACK,
  },
  innerContainer: {
    flex: 1,
    backgroundColor: COLORS.NETFLIX_BLACK,
  },
  videoPlayerContainer: {
    position: 'relative',
    width: '100%',
    backgroundColor: COLORS.NETFLIX_BLACK,
  },
  placeholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniPlayerContainer: {
    position: 'absolute',
    backgroundColor: COLORS.NETFLIX_DARK_GRAY,
    height: MINI_PLAYER_HEIGHT,
    width: '100%',
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  miniPlayerInfo: {
    flex: 1,
    marginRight: 12,
  },
  miniPlayerTitle: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 14,
    fontWeight: '600',
  },
  miniPlayerSubtitle: {
    color: COLORS.NETFLIX_GRAY,
    fontSize: 12,
    marginTop: 2,
  },
  miniPlayerControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniPlayerButton: {
    padding: 8,
    marginLeft: 4,
  },
  contentContainer: {
    flex: 1,
    backgroundColor: COLORS.NETFLIX_BLACK,
  },
  scrollView: {
    flex: 1,
  },
  detailsSection: {
    padding: 16,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 24,
    fontWeight: 'bold',
    flex: 1,
  },
  likeButton: {
    padding: 8,
  },
  overview: {
    color: COLORS.NETFLIX_LIGHT_GRAY,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  episodesSection: {
    marginTop: 20,
  },
  sectionTitle: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  episodeItem: {
    backgroundColor: COLORS.NETFLIX_DARK_GRAY,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  episodeTitle: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 14,
  },
  similarSection: {
    marginTop: 20,
  },
});

export default VideoPlayerSheet;
