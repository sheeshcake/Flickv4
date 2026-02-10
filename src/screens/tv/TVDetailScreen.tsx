/**
 * TV Detail Screen
 * Full-screen detail view optimized for TV with focus management
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ImageBackground,
  StatusBar,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { TVHorizontalScrollList, TVButton, TVMediaPlayer } from '../../components/tv';
import { TMDBService } from '../../services/TMDBService';
import { Movie, TVShow } from '../../types';
import { TMDB_CONFIG } from '../../utils/constants';
import { useAppState } from '../../hooks/useAppState';
import { getGenreNameById } from '../../utils/genreMap';
import WebViewScrapper from '../../components/WebViewScrapper';
import { useContentWatchProgress } from '../../hooks/useAppSelectors';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface TVDetailScreenProps {
  route: any;
  navigation: any;
}

export const TVDetailScreen: React.FC<TVDetailScreenProps> = ({
  route,
  navigation,
}) => {
  const { content } = route.params || {};
  const [similarContent, setSimilarContent] = useState<(Movie | TVShow)[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  
  // Video playback state
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string>('');
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const [initialProgress, setInitialProgress] = useState<number>(0);
  const [scraping, setScraping] = useState<{ active: boolean; error: string | null; show: boolean }>({
    active: false, error: null, show: false
  });
  const [tvState] = useState<{
    seasons: any[];
    selectedSeason: number;
    selectedEpisode: number | null;
    episodes: any[];
    loading: boolean;
    details: any;
  }>({ seasons: [], selectedSeason: 1, selectedEpisode: null, episodes: [], loading: false, details: null });

  const {
    addLikedContent,
    removeLikedContent,
    isContentLiked,
  } = useAppState();

  const tmdbService = useMemo(() => new TMDBService(), []);

  const isMovie = useMemo(() => content && 'title' in content, [content]);
  const contentType = isMovie ? 'movie' : 'tv';
  const title = isMovie ? content?.title : content?.name;
  const releaseDate = isMovie ? content?.release_date : content?.first_air_date;
  const releaseYear = releaseDate ? new Date(releaseDate).getFullYear() : '';

  const isLiked = content ? isContentLiked(content.id, contentType) : false;

  const backdropUrl = content?.backdrop_path
    ? `${TMDB_CONFIG.IMAGE_BASE_URL}${content.backdrop_path}`
    : '';

  const genreNames = useMemo(() => {
    if (!content?.genre_ids) return [];
    return content.genre_ids.map((id: number) => getGenreNameById(id)).filter(Boolean);
  }, [content?.genre_ids]);

  const loadSimilarContent = useCallback(async () => {
    if (!content) return;
    setLoadingSimilar(true);
    try {
      const response = isMovie
        ? await tmdbService.getSimilarMovies(content.id)
        : await tmdbService.getSimilarTVShows(content.id);
      setSimilarContent(response.results || []);
    } catch (error) {
      console.error('Failed to load similar content:', error);
    } finally {
      setLoadingSimilar(false);
    }
  }, [content, isMovie, tmdbService]);

  // Load similar content
  useEffect(() => {
    if (content) {
      loadSimilarContent();
    }
  }, [content, loadSimilarContent]);

  // Watch progress for resuming
  const watchProgress = useContentWatchProgress(
    content?.id ?? 0,
    contentType,
  );

  const handlePlay = useCallback(() => {
    if (!content) return;
    // Start video scraping to get video URL
    setScraping({ show: true, active: true, error: null });
  }, [content]);

  const handleVideoExtracted = useCallback(
    (data: { videoUrl: string; isWebM: boolean }) => {
      console.log('[TVDetailScreen] Video extracted:', data.videoUrl);
      if (!data.videoUrl || data.videoUrl.trim() === '') {
        console.error('[TVDetailScreen] Empty video URL received');
        setScraping({ show: false, active: false, error: 'Empty video URL' });
        return;
      }
      setCurrentVideoUrl(data.videoUrl);
      setShowVideoPlayer(true);
      setScraping({ show: false, active: false, error: null });

      // Apply watch progress if resuming
      const shouldApplyProgress = (watchProgress?.progress ?? 0) > 0;
      setInitialProgress(shouldApplyProgress && watchProgress ? (watchProgress.progress / 100) * watchProgress.duration : 0);
    },
    [watchProgress],
  );

  const handleScrapingError = useCallback((error: string) => {
    setScraping({ show: false, active: false, error });
    console.error('Scraping error:', error);
  }, []);

  const handleVideoEnd = useCallback(() => {
    setShowVideoPlayer(false);
    setCurrentVideoUrl('');
  }, []);

  const handleToggleLike = useCallback(async () => {
    if (!content) return;
    if (isLiked) {
      await removeLikedContent(content.id, contentType);
    } else {
      await addLikedContent(content.id, contentType);
    }
  }, [content, isLiked, contentType, addLikedContent, removeLikedContent]);

  const handleSimilarItemPress = useCallback(
    (item: Movie | TVShow) => {
      navigation.push('Detail', { content: item });
    },
    [navigation]
  );

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  if (!content) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Content not found</Text>
      </View>
    );
  }

  // Show video player if video is available
  if (showVideoPlayer && currentVideoUrl) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <TVMediaPlayer
          videoUrl={currentVideoUrl}
          title={title}
          contentId={content.id}
          contentType={contentType}
          initialProgress={initialProgress}
          onEnd={handleVideoEnd}
          onBack={handleVideoEnd}
          season={isMovie ? undefined : tvState.selectedSeason}
          episode={isMovie ? undefined : (tvState.selectedEpisode || 1)}
          navigation={navigation}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* WebView Scrapper for extracting video */}
      {scraping.show && (
        <WebViewScrapper
          tmdbId={content.id}
          type={contentType}
          onDataExtracted={handleVideoExtracted}
          onError={handleScrapingError}
          seasonNumber={isMovie ? undefined : tvState.selectedSeason}
          episodeNumber={isMovie ? undefined : (tvState.selectedEpisode || 1)}
        />
      )}

      {/* Loading overlay when scraping */}
      {scraping.active && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#E50914" />
          <Text style={styles.loadingText}>Loading video...</Text>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Banner */}
        <View style={styles.heroContainer}>
          <ImageBackground
            source={{ uri: backdropUrl }}
            style={styles.heroBackground}
            resizeMode="cover"
          >
            <LinearGradient
              colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)', '#000000']}
              style={styles.heroGradient}
            >
              <View style={styles.heroContent}>
                {/* Title */}
                <Text style={styles.title}>{title}</Text>

                {/* Meta Info */}
                <View style={styles.metaContainer}>
                  {releaseYear && (
                    <Text style={styles.metaText}>{releaseYear}</Text>
                  )}
                  {content.vote_average > 0 && (
                    <>
                      <Text style={styles.metaDot}>•</Text>
                      <Text style={styles.ratingText}>
                        ⭐ {content.vote_average.toFixed(1)}
                      </Text>
                    </>
                  )}
                </View>

                {/* Genres */}
                {genreNames.length > 0 && (
                  <View style={styles.genresContainer}>
                    {genreNames.slice(0, 4).map((genre: string, index: number) => (
                      <View key={index} style={styles.genreTag}>
                        <Text style={styles.genreText}>{genre}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Overview */}
                <Text style={styles.overview} numberOfLines={4}>
                  {content.overview}
                </Text>

                {/* Action Buttons */}
                <View style={styles.actionButtons}>
                  <TVButton
                    title="Play"
                    icon="play"
                    variant="primary"
                    size="large"
                    onPress={handlePlay}
                    hasTVPreferredFocus
                  />
                  <TVButton
                    title={isLiked ? 'Remove from List' : 'Add to List'}
                    icon={isLiked ? 'check' : 'plus'}
                    variant="secondary"
                    size="large"
                    onPress={handleToggleLike}
                    style={styles.buttonSpacing}
                  />
                  <TVButton
                    title="Back"
                    icon="arrow-left"
                    variant="outline"
                    size="large"
                    onPress={handleBack}
                    style={styles.buttonSpacing}
                  />
                </View>
              </View>
            </LinearGradient>
          </ImageBackground>
        </View>

        {/* Similar Content */}
        {similarContent.length > 0 && (
          <TVHorizontalScrollList
            title="More Like This"
            data={similarContent}
            onItemPress={handleSimilarItemPress}
            loading={loadingSimilar}
            cardSize="medium"
          />
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 24,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 48,
  },
  heroContainer: {
    height: SCREEN_HEIGHT * 0.75,
  },
  heroBackground: {
    flex: 1,
  },
  heroGradient: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  heroContent: {
    paddingHorizontal: 48,
    paddingBottom: 48,
    maxWidth: SCREEN_WIDTH * 0.6,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 56,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  metaText: {
    color: '#CCCCCC',
    fontSize: 20,
  },
  metaDot: {
    color: '#666666',
    fontSize: 20,
    marginHorizontal: 12,
  },
  ratingText: {
    color: '#FFD700',
    fontSize: 20,
    fontWeight: '600',
  },
  genresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
    gap: 12,
  },
  genreTag: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  genreText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  overview: {
    color: '#CCCCCC',
    fontSize: 20,
    lineHeight: 30,
    marginBottom: 32,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonSpacing: {
    marginLeft: 16,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 24,
    marginTop: 20,
    fontWeight: '500',
  },
});

export default TVDetailScreen;
