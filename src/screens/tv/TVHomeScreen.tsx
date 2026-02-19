import React, {
  useEffect,
  useCallback,
  useMemo,
  useState,
  memo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ImageBackground,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useAppState } from '../../hooks/useAppState';
import { useHomeScreenData } from '../../hooks/useAppSelectors';
import { useGenreContent } from '../../hooks/useGenreContent';
import { TMDBService } from '../../services/TMDBService';
import { TVContentCard } from '../../components/tv/TVContentCard';
import { TVButton } from '../../components/tv/TVButton';
import { Movie, TVShow, WatchProgress, AppError } from '../../types';
import { COLORS } from '../../utils/constants';
import { GENRE_IDS } from '../../utils/genreMap';
import { preloadMoviePosters, preloadTVShowPosters } from '../../utils/imagePreloader';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const tmdbService = new TMDBService();

const CARD_WIDTH = 260;
const CARD_HEIGHT = 155;

const mergeUniqueById = <T extends { id: number }>(
  existing: T[],
  incoming: T[],
): T[] => {
  const map = new Map<number, T>();
  existing.forEach(item => map.set(item.id, item));
  incoming.forEach(item => map.set(item.id, item));
  return Array.from(map.values());
};

const isMovieItem = (item: Movie | TVShow): item is Movie => 'title' in item;

interface TVHomeScreenProps {
  onNavigateToDetail: (content: Movie | TVShow) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// HeroSection: owns heroIndex state so the 8-second carousel timer ONLY
// re-renders this component – content rows are completely unaffected.
// ─────────────────────────────────────────────────────────────────────────────
interface HeroSectionProps {
  heroContent: (Movie | TVShow)[];
  isContentLiked: (id: number, type: 'movie' | 'tv') => boolean;
  addLikedContent: (id: number, type: 'movie' | 'tv') => Promise<void>;
  removeLikedContent: (id: number, type: 'movie' | 'tv') => Promise<void>;
  onNavigateToDetail: (content: Movie | TVShow) => void;
}

const HeroSection = memo(({
  heroContent,
  isContentLiked,
  addLikedContent,
  removeLikedContent,
  onNavigateToDetail,
}: HeroSectionProps) => {
  const [heroIndex, setHeroIndex] = useState(0);
  const safeIndex = heroContent.length > 0 ? heroIndex % heroContent.length : 0;
  const heroItem = heroContent[safeIndex] ?? null;

  // Auto-advance carousel
  useEffect(() => {
    if (heroContent.length === 0) return;
    const timer = setInterval(() => {
      setHeroIndex(prev => (prev + 1) % heroContent.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [heroContent.length]);

  const handleToggleLike = useCallback(async () => {
    if (!heroItem) return;
    const ct = isMovieItem(heroItem) ? 'movie' : 'tv';
    const liked = isContentLiked(heroItem.id, ct);
    try {
      if (liked) await removeLikedContent(heroItem.id, ct);
      else await addLikedContent(heroItem.id, ct);
    } catch {
      Alert.alert('Error', 'Failed to update liked content');
    }
  }, [heroItem, isContentLiked, addLikedContent, removeLikedContent]);

  if (!heroItem) return null;

  const title = isMovieItem(heroItem) ? heroItem.title : (heroItem as any).name;
  const imageUrl = tmdbService.getImageUrl(heroItem.backdrop_path || '', 'original');
  const typeLabel = isMovieItem(heroItem) ? 'Movie' : 'TV Show';
  const liked = isContentLiked(heroItem.id, isMovieItem(heroItem) ? 'movie' : 'tv');

  return (
    <View style={styles.hero}>
      <ImageBackground
        source={{ uri: imageUrl }}
        style={styles.heroImage}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.85)', '#000000']}
          style={styles.heroGradient}
        >
          <View style={styles.heroContent}>
            <Text style={styles.heroTypeLabel}>{typeLabel}</Text>
            <Text style={styles.heroTitle}>{title}</Text>
            <View style={styles.heroMeta}>
              <Icon name="star" size={20} color="#FFD700" />
              <Text style={styles.heroRating}>
                {heroItem.vote_average?.toFixed(1)}
              </Text>
              <Text style={styles.heroOverview} numberOfLines={2}>
                {'  ·  ' + (heroItem.overview || '')}
              </Text>
            </View>
            <View style={styles.heroActions}>
              <TVButton
                title="Play"
                icon="play"
                variant="primary"
                size="medium"
                onPress={() => onNavigateToDetail(heroItem)}
                hasTVPreferredFocus
              />
              <TVButton
                title="More Info"
                icon="information-outline"
                variant="secondary"
                size="medium"
                onPress={() => onNavigateToDetail(heroItem)}
              />
              <TVButton
                title={liked ? 'Liked' : 'Like'}
                icon={liked ? 'cards-heart' : 'cards-heart-outline'}
                variant="outline"
                size="medium"
                onPress={handleToggleLike}
              />
            </View>
          </View>
        </LinearGradient>
      </ImageBackground>

      {/* Dot indicators */}
      <View style={styles.heroDots}>
        {heroContent.map((_, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => setHeroIndex(i)}
            style={[styles.heroDot, i === safeIndex && styles.heroDotActive]}
          />
        ))}
      </View>
    </View>
  );
});



export const TVHomeScreen: React.FC<TVHomeScreenProps> = ({
  onNavigateToDetail,
}) => {
  const {
    state,
    setTrendingMovies,
    setTrendingTVShows,
    setLoading,
    addLikedContent,
    removeLikedContent,
    isContentLiked,
  } = useAppState();

  const { trendingMovies, trendingTVShows, isLoading } = useHomeScreenData();
  const { contentByGenre, loadGenreContent, isLoadingGenre, canLoadMoreGenre } =
    useGenreContent();

  const heroContent = useMemo(
    () => [...trendingMovies.slice(0, 5), ...trendingTVShows.slice(0, 5)],
    [trendingMovies, trendingTVShows],
  );

  const genreSections = useMemo(
    () => [
      { id: GENRE_IDS.ACTION, name: 'Action' },
      { id: GENRE_IDS.HORROR, name: 'Horror' },
      { id: GENRE_IDS.COMEDY, name: 'Comedy' },
      { id: GENRE_IDS.DRAMA, name: 'Drama' },
      { id: GENRE_IDS.FAMILY, name: 'Family' },
      { id: GENRE_IDS.ROMANCE, name: 'Romance' },
    ],
    [],
  );

  const loadInitialTrending = useCallback(async () => {
    try {
      setLoading('homeScreen', true);
      const [moviesRes, tvRes] = await Promise.all([
        tmdbService.getTrendingMovies('week', 1),
        tmdbService.getTrendingTVShows('week', 1),
      ]);
      setTrendingMovies(moviesRes.results || []);
      setTrendingTVShows(tvRes.results || []);
      preloadMoviePosters(moviesRes.results.slice(0, 10), { priority: 'high', batchSize: 10 });
      preloadTVShowPosters(tvRes.results.slice(0, 10), { priority: 'normal', batchSize: 10 });
    } catch (err) {
      const e = err as AppError;
      if (e.code !== 'OFFLINE_NO_CACHE' && e.code !== 'NETWORK_ERROR') {
        Alert.alert('Error', e.message || 'Failed to load trending content');
      }
    } finally {
      setLoading('homeScreen', false);
    }
  }, [setLoading, setTrendingMovies, setTrendingTVShows]);

  useEffect(() => {
    loadInitialTrending();
    genreSections.forEach(g => loadGenreContent(g.id, g.name, { reset: true }));
  }, [loadInitialTrending, loadGenreContent, genreSections]);

  const renderRow = (
    title: string,
    data: (Movie | TVShow)[],
    loading: boolean,
    firstRowFocus: boolean = false,
  ) => {
    if (loading) {
      return (
        <View style={styles.rowContainer} key={title}>
          <Text style={styles.rowTitle}>{title}</Text>
          <ActivityIndicator color={COLORS.NETFLIX_RED} />
        </View>
      );
    }
    if (data.length === 0) return null;
    return (
      <View style={styles.rowContainer} key={title}>
        <Text style={styles.rowTitle}>{title}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rowScroll}
        >
          {data.map((item, idx) => (
            <TVContentCard
              key={`${item.id}-${isMovieItem(item) ? 'movie' : 'tv'}`}
              item={item}
              onPress={onNavigateToDetail}
              width={CARD_WIDTH}
              height={CARD_HEIGHT}
              hasTVPreferredFocus={firstRowFocus && idx === 0}
            />
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* <HeroSection
        heroContent={heroContent}
        isContentLiked={isContentLiked}
        addLikedContent={addLikedContent}
        removeLikedContent={removeLikedContent}
        onNavigateToDetail={onNavigateToDetail}
      /> */}

      {isLoading && trendingMovies.length === 0 ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.NETFLIX_RED} />
          <Text style={styles.loaderText}>Loading content…</Text>
        </View>
      ) : (
        <>
          {renderRow('Trending Movies', trendingMovies, false, true)}
          {renderRow('Trending TV Shows', trendingTVShows, false)}
          {genreSections.map(g => {
            const gc = contentByGenre[g.id];
            const combined = mergeUniqueById<Movie | TVShow>(
              (gc?.movies as (Movie | TVShow)[]) || [],
              (gc?.tvShows as (Movie | TVShow)[]) || [],
            );
            return renderRow(
              g.name,
              combined,
              isLoadingGenre(g.id) && combined.length === 0,
            );
          })}
        </>
      )}

      <View style={styles.bottomSpacing} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.NETFLIX_BLACK,
    overflow: 'visible',
  },
  hero: {
    height: screenHeight * 0.65,
    position: 'relative',
  },
  heroImage: {
    flex: 1,
  },
  heroGradient: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 60,
    paddingBottom: 40,
  },
  heroContent: {
    maxWidth: screenWidth * 0.5,
  },
  heroTypeLabel: {
    fontSize: 14,
    color: COLORS.NETFLIX_LIGHT_GRAY,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 52,
    fontWeight: 'bold',
    color: COLORS.NETFLIX_WHITE,
    marginBottom: 12,
    lineHeight: 58,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  heroRating: {
    fontSize: 16,
    color: '#FFD700',
    fontWeight: '700',
    marginLeft: 4,
  },
  heroOverview: {
    flex: 1,
    fontSize: 14,
    color: COLORS.NETFLIX_LIGHT_GRAY,
    lineHeight: 20,
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.NETFLIX_WHITE,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 8,
  },
  playBtnText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.NETFLIX_BLACK,
  },
  infoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(109, 109, 110, 0.7)',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 8,
  },
  infoBtnText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.NETFLIX_WHITE,
  },
  likeBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  heroDots: {
    position: 'absolute',
    bottom: 16,
    right: 60,
    flexDirection: 'row',
    gap: 6,
  },
  heroDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  heroDotActive: {
    width: 24,
    backgroundColor: COLORS.NETFLIX_WHITE,
  },
  rowContainer: {
    marginTop: 32,
    paddingLeft: 60,
    overflow: 'visible',
  },
  rowTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.NETFLIX_WHITE,
    marginBottom: 16,
  },
  rowScroll: {
    paddingRight: 60,
  },
  loader: {
    paddingVertical: 80,
    alignItems: 'center',
  },
  loaderText: {
    color: COLORS.NETFLIX_LIGHT_GRAY,
    marginTop: 12,
    fontSize: 16,
  },
  bottomSpacing: {
    height: 80,
  },
});

export default TVHomeScreen;
