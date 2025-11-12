import React, {useEffect, useCallback, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  RefreshControl,
  Alert,
  Dimensions,
  ImageBackground,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import type {MainTabScreenProps} from '../types/navigation';
import {useAppState} from '../hooks/useAppState';
import {useHomeScreenData} from '../hooks/useAppSelectors';
import {useGenreContent} from '../hooks/useGenreContent';
import {TMDBService} from '../services/TMDBService';
import HorizontalScrollList from '../components/HorizontalScrollList';
import ContinueWatchingList from '../components/ContinueWatchingList';
import {HorizontalListSkeleton} from '../components/LoadingIndicator';
import {OfflineBanner} from '../components/OfflineBanner';
import Header from '../components/Header';
import CreditsModal from '../components/CreditsModal';
import {Movie, TVShow, AppError, WatchProgress} from '../types';
import {COLORS} from '../utils/constants';
import {
  preloadMoviePosters,
  preloadTVShowPosters,
} from '../utils/imagePreloader';
import {GENRE_IDS} from '../utils/genreMap';

type Props = MainTabScreenProps<'Home'>;

const {height: screenHeight} = Dimensions.get('window');

const mergeUniqueById = <T extends {id: number}>(existing: T[], incoming: T[]): T[] => {
  const map = new Map<number, T>();
  existing.forEach(item => map.set(item.id, item));
  incoming.forEach(item => map.set(item.id, item));
  return Array.from(map.values());
};

const hasMorePages = (page: number, totalPages: number): boolean => {
  return page < totalPages;
};

export const HomeScreen: React.FC<Props> = ({navigation}) => {
  const {
    state,
    setTrendingMovies,
    setTrendingTVShows,
    setLoading,
  } = useAppState();

  const {
    trendingMovies,
    trendingTVShows,
    continueWatching,
    isLoading,
    isOffline,
  } = useHomeScreenData();

  const tmdbService = useMemo(() => new TMDBService(), []);

  // Genre content hook
  const {contentByGenre, loadGenreContent, isLoadingGenre, canLoadMoreGenre} =
    useGenreContent();

  // Credits modal state
  const [isCreditsModalOpen, setIsCreditsModalOpen] = useState(false);

  // Liked content state
  const [likedMovies, setLikedMovies] = React.useState<Movie[]>([]);
  const [likedTVShows, setLikedTVShows] = React.useState<TVShow[]>([]);
  const [loadingLikedContent, setLoadingLikedContent] = React.useState(false);

  const [trendingMoviesPage, setTrendingMoviesPage] = useState(1);
  const [trendingMoviesTotalPages, setTrendingMoviesTotalPages] = useState(1);
  const [loadingMoreTrendingMovies, setLoadingMoreTrendingMovies] =
    useState(false);
  const [trendingTVPage, setTrendingTVPage] = useState(1);
  const [trendingTVTotalPages, setTrendingTVTotalPages] = useState(1);
  const [loadingMoreTrendingTV, setLoadingMoreTrendingTV] = useState(false);

  const trendingMoviesHasMore = hasMorePages(
    trendingMoviesPage,
    trendingMoviesTotalPages,
  );
  const trendingTVHasMore = hasMorePages(trendingTVPage, trendingTVTotalPages);

  // Define genre sections to display
  const genreSections = useMemo(() => [
    { id: GENRE_IDS.HORROR, name: 'Horror' },
    { id: GENRE_IDS.COMEDY, name: 'Comedy' },
    { id: GENRE_IDS.FAMILY, name: 'Family' },
    { id: GENRE_IDS.DRAMA, name: 'Drama' },
    { id: GENRE_IDS.ROMANCE, name: 'Romance' },
    { id: GENRE_IDS.ACTION, name: 'Action' },
  ], []);

  // Load liked content details
  const loadLikedContent = useCallback(async () => {
    const likedMovieIds = state.user.preferences.likedMovies;
    const likedTVShowIds = state.user.preferences.likedTVShows;

    if (likedMovieIds.length === 0 && likedTVShowIds.length === 0) {
      setLikedMovies([]);
      setLikedTVShows([]);
      return;
    }

    try {
      setLoadingLikedContent(true);

      // Fetch liked movies details
      const moviePromises = likedMovieIds.slice(0, 10).map(id =>
        tmdbService.getMovieDetails(id).catch(error => {
          console.warn(`Failed to load movie ${id}:`, error);
          return null;
        })
      );

      // Fetch liked TV shows details
      const tvShowPromises = likedTVShowIds.slice(0, 10).map(id =>
        tmdbService.getTVShowDetails(id).catch(error => {
          console.warn(`Failed to load TV show ${id}:`, error);
          return null;
        })
      );

      const [movieResults, tvShowResults] = await Promise.all([
        Promise.all(moviePromises),
        Promise.all(tvShowPromises),
      ]);

      // Filter out null results (failed requests)
      const validMovies = movieResults.filter(movie => movie !== null) as Movie[];
      const validTVShows = tvShowResults.filter(show => show !== null) as TVShow[];

      setLikedMovies(validMovies);
      setLikedTVShows(validTVShows);
    } catch (error) {
      console.error('Failed to load liked content:', error);
    } finally {
      setLoadingLikedContent(false);
    }
  }, [state.user.preferences.likedMovies, state.user.preferences.likedTVShows, tmdbService]);

  const loadInitialTrending = useCallback(async () => {
    try {
      setLoading('homeScreen', true);

      setTrendingMoviesPage(1);
      setTrendingMoviesTotalPages(1);
      setTrendingTVPage(1);
      setTrendingTVTotalPages(1);

      const [moviesResponse, tvShowsResponse] = await Promise.all([
        tmdbService.getTrendingMovies('week', 1),
        tmdbService.getTrendingTVShows('week', 1),
      ]);

      const movies = moviesResponse.results || [];
      const tvShows = tvShowsResponse.results || [];

      setTrendingMovies(movies);
      setTrendingTVShows(tvShows);

      setTrendingMoviesPage(1);
      setTrendingMoviesTotalPages(moviesResponse.total_pages || 1);
      setTrendingTVPage(1);
      setTrendingTVTotalPages(tvShowsResponse.total_pages || 1);

      preloadMoviePosters(movies.slice(0, 10), {
        priority: 'high',
        batchSize: 10,
      });
      preloadTVShowPosters(tvShows.slice(0, 10), {
        priority: 'normal',
        batchSize: 10,
      });
    } catch (error) {
      console.error('Failed to load trending content:', error);
      const appError = error as AppError;

      if (
        appError.code !== 'OFFLINE_NO_CACHE' &&
        appError.code !== 'NETWORK_ERROR'
      ) {
        Alert.alert(
          'Error Loading Content',
          appError.message ||
            'Failed to load trending content. Please try again.',
          [
            {
              text: 'Retry',
              onPress: loadInitialTrending,
            },
            {
              text: 'Cancel',
              style: 'cancel',
            },
          ],
        );
      }
    } finally {
      setLoading('homeScreen', false);
    }
  }, [setLoading, setTrendingMovies, setTrendingTVShows, tmdbService]);

  const loadMoreTrendingMovies = useCallback(async () => {
    if (loadingMoreTrendingMovies) {
      return;
    }

    if (!hasMorePages(trendingMoviesPage, trendingMoviesTotalPages)) {
      return;
    }

    setLoadingMoreTrendingMovies(true);
    const nextPage = trendingMoviesPage + 1;

    try {
      const response = await tmdbService.getTrendingMovies('week', nextPage);
      const combined = mergeUniqueById(
        trendingMovies,
        response.results || [],
      );

      setTrendingMovies(combined);
      setTrendingMoviesPage(nextPage);
      setTrendingMoviesTotalPages(response.total_pages || trendingMoviesTotalPages);
    } catch (error) {
      console.error('Failed to load more trending movies:', error);
    } finally {
      setLoadingMoreTrendingMovies(false);
    }
  }, [
    loadingMoreTrendingMovies,
    trendingMoviesPage,
    trendingMoviesTotalPages,
    tmdbService,
    trendingMovies,
    setTrendingMovies,
    setTrendingMoviesTotalPages,
  ]);

  const loadMoreTrendingTVShows = useCallback(async () => {
    if (loadingMoreTrendingTV) {
      return;
    }

    if (!hasMorePages(trendingTVPage, trendingTVTotalPages)) {
      return;
    }

    setLoadingMoreTrendingTV(true);
    const nextPage = trendingTVPage + 1;

    try {
      const response = await tmdbService.getTrendingTVShows('week', nextPage);
      const combined = mergeUniqueById(
        trendingTVShows,
        response.results || [],
      );

      setTrendingTVShows(combined);
      setTrendingTVPage(nextPage);
      setTrendingTVTotalPages(response.total_pages || trendingTVTotalPages);
    } catch (error) {
      console.error('Failed to load more trending TV shows:', error);
    } finally {
      setLoadingMoreTrendingTV(false);
    }
  }, [
    loadingMoreTrendingTV,
    trendingTVPage,
    trendingTVTotalPages,
    tmdbService,
    trendingTVShows,
    setTrendingTVShows,
    setTrendingTVTotalPages,
  ]);

  const handleGenreLoadMore = useCallback(
    (genreId: number, genreName: string) => {
      const genreState = contentByGenre[genreId];
      if (genreState?.loading) {
        return;
      }

      if (!canLoadMoreGenre(genreId)) {
        return;
      }

      loadGenreContent(genreId, genreName);
    },
    [contentByGenre, canLoadMoreGenre, loadGenreContent],
  );

  // Handle content item press
  const handleContentPress = useCallback(
    (item: Movie | TVShow) => {
      navigation.navigate('Detail', {content: item});
    },
    [navigation],
  );

  // Handle continue watching item press
  const handleContinueWatchingPress = useCallback(
    (item: Movie | TVShow, _progress: WatchProgress) => {
      navigation.navigate('Detail', {content: item});
    },
    [navigation],
  );

  // Handle pull to refresh
  const handleRefresh = useCallback(() => {
    loadInitialTrending();
    loadLikedContent();
    genreSections.forEach(genre => {
      loadGenreContent(genre.id, genre.name, {reset: true});
    });
  }, [loadInitialTrending, loadLikedContent, loadGenreContent, genreSections]);

  // Load content on component mount
  useEffect(() => {
    loadInitialTrending();
    loadLikedContent();

    genreSections.forEach(genre => {
      loadGenreContent(genre.id, genre.name, {reset: true});
    });
  }, [loadInitialTrending, loadLikedContent, loadGenreContent, genreSections]);

    // Render hero banner with featured content
  const renderHeroBanner = () => {
    const featuredContent = trendingMovies[0] || trendingTVShows[0];

    if (!featuredContent) {
      return null;
    }

    const title: string = 'title' in featuredContent && featuredContent.title 
      ? featuredContent.title 
      : 'name' in featuredContent && (featuredContent as any).name
      ? (featuredContent as any).name
      : 'Unknown';

    const backgroundImageUrl = tmdbService.getImageUrl(
      featuredContent.backdrop_path,
      'w780',
    );

    return (
      <View style={styles.heroBanner}>
        <ImageBackground
          source={{ uri: backgroundImageUrl }}
          style={styles.heroBackgroundImage}
          resizeMode="cover">
          <LinearGradient
            colors={['transparent', 'rgba(0, 0, 0, 0.3)', 'rgba(0, 0, 0, 0.8)', COLORS.NETFLIX_BLACK]}
            style={styles.heroGradient}>
            <View style={styles.heroContent}>
              <Text style={styles.heroTitle}>{title}</Text>
              <Text style={styles.heroOverview} numberOfLines={3}>
                {featuredContent.overview}
              </Text>
              <View style={styles.heroRating}>
                <Text style={styles.ratingText}>
                  ⭐ {featuredContent.vote_average.toFixed(1)}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </ImageBackground>
      </View>
    );
  };

  // Render loading skeleton for initial load
  const renderLoadingSkeleton = () => (
    <View style={styles.contentSections}>
      <View style={styles.skeletonSection}>
        <View style={styles.skeletonTitle} />
        <HorizontalListSkeleton itemCount={4} />
      </View>
      {/* Show liked content skeleton if user has liked content */}
      {(state.user.preferences.likedMovies.length > 0 || 
        state.user.preferences.likedTVShows.length > 0) && (
        <>
          {state.user.preferences.likedMovies.length > 0 && (
            <View style={styles.skeletonSection}>
              <View style={styles.skeletonTitle} />
              <HorizontalListSkeleton itemCount={4} />
            </View>
          )}
          {state.user.preferences.likedTVShows.length > 0 && (
            <View style={styles.skeletonSection}>
              <View style={styles.skeletonTitle} />
              <HorizontalListSkeleton itemCount={4} />
            </View>
          )}
        </>
      )}
      <View style={styles.skeletonSection}>
        <View style={styles.skeletonTitle} />
        <HorizontalListSkeleton itemCount={4} />
      </View>
      <View style={styles.skeletonSection}>
        <View style={styles.skeletonTitle} />
        <HorizontalListSkeleton itemCount={4} />
      </View>
      {/* Skeleton for genre sections */}
      {genreSections.map((genre) => (
        <View key={genre.id} style={styles.skeletonSection}>
          <View style={styles.skeletonTitle} />
          <HorizontalListSkeleton itemCount={4} />
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={COLORS.NETFLIX_BLACK}
      />

      {/* Offline Banner */}
      <OfflineBanner onRetry={handleRefresh} />
      
      {/* Header */}
      <Header onPressCredits={() => setIsCreditsModalOpen(true)} />
      
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            style={styles.refreshControl}
            onRefresh={handleRefresh}
            tintColor={COLORS.NETFLIX_RED}
            colors={[COLORS.NETFLIX_RED]}
          />
        }>
        {/* Hero Banner */}
        {renderHeroBanner()}

        {/* Show loading skeleton on initial load */}
        {isLoading &&
        trendingMovies.length === 0 &&
        trendingTVShows.length === 0 ? (
          renderLoadingSkeleton()
        ) : (
          /* Content Sections */
          <View style={styles.contentSections}>
            {/* Continue Watching */}
            <ContinueWatchingList
              title="Continue Watching"
              data={continueWatching}
              onItemPress={handleContinueWatchingPress}
              loading={false}
              cardSize="medium"
            />

            {/* Liked Movies */}
            {(likedMovies.length > 0 || loadingLikedContent) && (
              <HorizontalScrollList
                title="My Liked Movies"
                data={likedMovies}
                onItemPress={handleContentPress}
                loading={loadingLikedContent && likedMovies.length === 0}
                cardSize="medium"
              />
            )}

            {/* Liked TV Shows */}
            {(likedTVShows.length > 0 || loadingLikedContent) && (
              <HorizontalScrollList
                title="My Liked TV Shows"
                data={likedTVShows}
                onItemPress={handleContentPress}
                loading={loadingLikedContent && likedTVShows.length === 0}
                cardSize="medium"
              />
            )}

            {/* Trending Movies */}
            <HorizontalScrollList
              title="Trending Movies"
              data={trendingMovies}
              onItemPress={handleContentPress}
              loading={isLoading && trendingMovies.length === 0}
              cardSize="medium"
              onEndReached={trendingMoviesHasMore ? loadMoreTrendingMovies : undefined}
              hasMore={trendingMoviesHasMore}
              loadingMore={loadingMoreTrendingMovies}
            />

            {/* Trending TV Shows */}
            <HorizontalScrollList
              title="Trending TV Shows"
              data={trendingTVShows}
              onItemPress={handleContentPress}
              loading={isLoading && trendingTVShows.length === 0}
              cardSize="medium"
              onEndReached={trendingTVHasMore ? loadMoreTrendingTVShows : undefined}
              hasMore={trendingTVHasMore}
              loadingMore={loadingMoreTrendingTV}
            />

            {/* Genre Sections */}
            {genreSections.map((genre) => {
              const genreContent = contentByGenre[genre.id];
              const combinedContent = mergeUniqueById<Movie | TVShow>(
                (genreContent?.movies as (Movie | TVShow)[]) || [],
                (genreContent?.tvShows as (Movie | TVShow)[]) || [],
              );
              const loadingGenre = isLoadingGenre(genre.id) && combinedContent.length === 0;
              const loadingMoreGenre = Boolean(genreContent?.loading && combinedContent.length > 0);
              const hasMoreGenre = canLoadMoreGenre(genre.id);

              return (
                <HorizontalScrollList
                  key={genre.id}
                  title={genre.name}
                  data={combinedContent}
                  onItemPress={handleContentPress}
                  loading={loadingGenre}
                  cardSize="medium"
                  onEndReached={hasMoreGenre ? () => handleGenreLoadMore(genre.id, genre.name) : undefined}
                  hasMore={hasMoreGenre}
                  loadingMore={loadingMoreGenre}
                />
              );
            })}

            {/* Offline indicator when showing cached content */}
            {isOffline &&
              (trendingMovies.length > 0 || trendingTVShows.length > 0) && (
                <View style={styles.offlineIndicator}>
                  <Text style={styles.offlineText}>
                    📱 Showing cached content - Connect to internet for updates
                  </Text>
                </View>
              )}
          </View>
        )}

        {/* Bottom spacing for better scrolling */}
        <View style={styles.bottomSpacing} />
      </ScrollView>
      
      {/* Credits Modal */}
      <CreditsModal 
        isOpen={isCreditsModalOpen} 
        onClose={() => setIsCreditsModalOpen(false)} 
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.NETFLIX_BLACK,
  },
  scrollView: {
    flex: 1,
  },
  heroBanner: {
    height: screenHeight * 0.4,
  },
  heroBackgroundImage: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  heroGradient: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  heroContent: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    padding: 16,
    borderRadius: 8,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.NETFLIX_WHITE,
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  heroOverview: {
    fontSize: 14,
    color: COLORS.NETFLIX_WHITE,
    lineHeight: 20,
    marginBottom: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  heroRating: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 14,
    color: COLORS.NETFLIX_WHITE,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  contentSections: {
    paddingTop: 20,
  },
  bottomSpacing: {
    height: 100,
  },
  skeletonSection: {
    marginBottom: 30,
  },
  skeletonTitle: {
    height: 20,
    width: 150,
    backgroundColor: COLORS.NETFLIX_DARK_GRAY,
    marginHorizontal: 20,
    marginBottom: 15,
    borderRadius: 4,
  },
  offlineIndicator: {
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    borderColor: '#FF6B35',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 20,
    marginTop: 20,
  },
  offlineText: {
    color: '#FF6B35',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  refreshControl: {
    zIndex: 1,
  },
});
