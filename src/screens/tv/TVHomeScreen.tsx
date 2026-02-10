/**
 * TV Home Screen
 * Optimized for TV remote navigation with sidebar and focus management
 */

import React, { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Dimensions,
  ImageBackground,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { TVHorizontalScrollList, TVSidebar, TVButton } from '../../components/tv';
import { useAppState } from '../../hooks/useAppState';
import { useHomeScreenData } from '../../hooks/useAppSelectors';
import { TMDBService } from '../../services/TMDBService';
import { Movie, TVShow } from '../../types';
import { TMDB_CONFIG } from '../../utils/constants';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface TVHomeScreenProps {
  navigation: any;
}

export const TVHomeScreen: React.FC<TVHomeScreenProps> = ({ navigation }) => {
  const {
    setTrendingMovies,
    setTrendingTVShows,
    setLoading,
  } = useAppState();

  const {
    trendingMovies,
    trendingTVShows,
    // continueWatching - not used until WatchProgress includes content
    isLoading,
  } = useHomeScreenData();

  const tmdbService = useMemo(() => new TMDBService(), []);
  const [currentHeroIndex, setCurrentHeroIndex] = useState(0);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const heroTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Hero content
  const heroContent = useMemo(() => {
    return trendingMovies.slice(0, 5);
  }, [trendingMovies]);

  // Auto-rotate hero
  useEffect(() => {
    if (heroContent.length > 0) {
      heroTimerRef.current = setInterval(() => {
        setCurrentHeroIndex((prev) => (prev + 1) % heroContent.length);
      }, 8000);
    }
    return () => {
      if (heroTimerRef.current) {
        clearInterval(heroTimerRef.current);
      }
    };
  }, [heroContent.length]);

  // Load initial data
  const loadInitialData = useCallback(async () => {
    try {
      setLoading('homeScreen', true);

      const [moviesResponse, tvShowsResponse] = await Promise.all([
        tmdbService.getTrendingMovies('week', 1),
        tmdbService.getTrendingTVShows('week', 1),
      ]);

      setTrendingMovies(moviesResponse.results || []);
      setTrendingTVShows(tvShowsResponse.results || []);
    } catch (error) {
      console.error('Failed to load content:', error);
    } finally {
      setLoading('homeScreen', false);
    }
  }, [setLoading, setTrendingMovies, setTrendingTVShows, tmdbService]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const handleItemPress = useCallback(
    (item: Movie | TVShow) => {
      navigation.navigate('Detail', { content: item });
    },
    [navigation]
  );

  const handlePlayHero = useCallback(() => {
    if (heroContent[currentHeroIndex]) {
      navigation.navigate('Detail', {
        content: heroContent[currentHeroIndex],
        autoPlay: true,
      });
    }
  }, [heroContent, currentHeroIndex, navigation]);

  const handleMoreInfoHero = useCallback(() => {
    if (heroContent[currentHeroIndex]) {
      navigation.navigate('Detail', {
        content: heroContent[currentHeroIndex],
      });
    }
  }, [heroContent, currentHeroIndex, navigation]);

  const currentHero = heroContent[currentHeroIndex];
  const heroBackdrop = currentHero?.backdrop_path
    ? `${TMDB_CONFIG.IMAGE_BASE_URL}${currentHero.backdrop_path}`
    : '';

  const navItems = [
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'search', label: 'Search', icon: 'magnify' },
    { key: 'downloads', label: 'Downloads', icon: 'download' },
    { key: 'settings', label: 'Settings', icon: 'cog' },
  ];

  const handleNavPress = (key: string) => {
    switch (key) {
      case 'search':
        navigation.navigate('Search');
        break;
      case 'downloads':
        navigation.navigate('Downloads');
        break;
      case 'settings':
        navigation.navigate('Settings');
        break;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Sidebar Navigation */}
      <TVSidebar
        items={navItems}
        activeKey="home"
        onItemPress={handleNavPress}
        expanded={sidebarExpanded}
        onExpandedChange={setSidebarExpanded}
      />

      {/* Main Content */}
      <View style={styles.mainContent}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Section */}
          {currentHero && (
            <View style={styles.heroContainer}>
              <ImageBackground
                source={{ uri: heroBackdrop }}
                style={styles.heroBackground}
                resizeMode="cover"
              >
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.8)', '#000000']}
                  style={styles.heroGradient}
                >
                  <View style={styles.heroContent}>
                    <Text style={styles.heroTitle}>
                    {'title' in currentHero ? currentHero.title : (currentHero as TVShow).name}
                    </Text>
                    <Text style={styles.heroOverview} numberOfLines={3}>
                      {currentHero.overview}
                    </Text>
                    <View style={styles.heroButtons}>
                      <TVButton
                        title="Play"
                        icon="play"
                        variant="primary"
                        size="large"
                        onPress={handlePlayHero}
                        hasTVPreferredFocus
                      />
                      <TVButton
                        title="More Info"
                        icon="information"
                        variant="secondary"
                        size="large"
                        onPress={handleMoreInfoHero}
                        style={styles.heroButtonSpacing}
                      />
                    </View>
                  </View>
                </LinearGradient>
              </ImageBackground>

              {/* Hero Indicators */}
              <View style={styles.heroIndicators}>
                {heroContent.map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.heroIndicator,
                      index === currentHeroIndex && styles.heroIndicatorActive,
                    ]}
                  />
                ))}
              </View>
            </View>
          )}

          {/* Continue Watching - commented out until WatchProgress type is updated
          {continueWatching.length > 0 && (
            <TVHorizontalScrollList
              title="Continue Watching"
              data={continueWatching.map((item) => item.content) as (Movie | TVShow)[]}
              onItemPress={handleItemPress}
              cardSize="large"
            />
          )}
          */}

          {/* Trending Movies */}
          <TVHorizontalScrollList
            title="Trending Movies"
            data={trendingMovies}
            onItemPress={handleItemPress}
            loading={isLoading}
            cardSize="medium"
          />

          {/* Trending TV Shows */}
          <TVHorizontalScrollList
            title="Trending TV Shows"
            data={trendingTVShows}
            onItemPress={handleItemPress}
            loading={isLoading}
            cardSize="medium"
          />
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#000000',
  },
  mainContent: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 48,
  },
  heroContainer: {
    height: SCREEN_HEIGHT * 0.7,
    marginBottom: 24,
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
    maxWidth: SCREEN_WIDTH * 0.5,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  heroOverview: {
    color: '#CCCCCC',
    fontSize: 20,
    lineHeight: 28,
    marginBottom: 24,
  },
  heroButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroButtonSpacing: {
    marginLeft: 16,
  },
  heroIndicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
  },
  heroIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    marginHorizontal: 4,
  },
  heroIndicatorActive: {
    width: 24,
    backgroundColor: '#E50914',
  },
});

export default TVHomeScreen;
