import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Movie, TVShow, WatchProgress } from '../types';
import { TMDBService } from '../services/TMDBService';
import { TMDB_CONFIG, COLORS } from '../utils/constants';

interface ContinueWatchingCardProps {
  watchProgress: WatchProgress;
  onPress: (item: Movie | TVShow, progress: WatchProgress) => void;
  size?: 'small' | 'medium' | 'large';
  type: 'movie' | 'tv';
}

const { width: screenWidth } = Dimensions.get('window');

const ContinueWatchingCard: React.FC<ContinueWatchingCardProps> = ({
  watchProgress,
  onPress,
  size = 'medium',
  type,
}) => {
  const [content, setContent] = useState<Movie | TVShow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const getCardDimensions = () => {
    switch (size) {
      case 'small':
        return { width: screenWidth * 0.25, height: screenWidth * 0.375 };
      case 'medium':
        return { width: screenWidth * 0.3, height: screenWidth * 0.45 };
      case 'large':
        return { width: screenWidth * 0.4, height: screenWidth * 0.6 };
      default:
        return { width: screenWidth * 0.3, height: screenWidth * 0.45 };
    }
  };

  const cardDimensions = getCardDimensions();

  // Fetch content details
  useEffect(() => {
    const fetchContentDetails = async () => {
      try {
        setLoading(true);
        setError(false);
        const tmdbService = new TMDBService();

        let contentData: Movie | TVShow;
        if (watchProgress.contentType === 'movie') {
          contentData = await tmdbService.getMovieDetails(
            watchProgress.contentId,
          );
        } else {
          contentData = await tmdbService.getTVShowDetails(
            watchProgress.contentId,
          );
        }

        setContent(contentData);
      } catch (err) {
        console.error('Failed to fetch content details:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchContentDetails();
  }, [watchProgress.contentId, watchProgress.contentType]);

  const handlePress = () => {
    if (content) {
      onPress(content, watchProgress);
    }
  };

  const renderLoadingState = () => (
    <View style={[styles.container, { width: cardDimensions.width }]}>
      <View style={[styles.imageContainer, cardDimensions]}>
        <ActivityIndicator size="small" color={COLORS.NETFLIX_RED} />
      </View>
    </View>
  );

  const renderErrorState = () => (
    <View style={[styles.container, { width: cardDimensions.width }]}>
      <View
        style={[styles.imageContainer, cardDimensions, styles.errorContainer]}
      >
        <Text style={styles.errorText}>Failed to load</Text>
      </View>
    </View>
  );

  if (loading) {
    return renderLoadingState();
  }

  if (error || !content) {
    return renderErrorState();
  }

  const imageUrl = content.poster_path
    ? `${TMDB_CONFIG.IMAGE_BASE_URL}${content.poster_path}`
    : null;

  const title = 'title' in content ? content.title : content.name;
  const progressPercentage = Math.round(watchProgress.progress);

  return (
    <TouchableOpacity
      style={[styles.container, { width: cardDimensions.width }]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <View style={[styles.imageContainer, cardDimensions]}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={[styles.image, cardDimensions]}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.placeholder, cardDimensions]}>
            <Text style={styles.placeholderText}>No Image</Text>
          </View>
        )}

        {/* Progress overlay */}
        <View style={styles.progressOverlay}>
          <View style={styles.progressBarContainer}>
            <View
              style={[styles.progressBar, { width: `${progressPercentage}%` }]}
            />
          </View>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={styles.progressText}>{progressPercentage}%</Text>
            {type === 'tv' && 'season' in watchProgress && 'episode' in watchProgress && (
              <Text style={styles.progressText}>
                S{watchProgress.season} · E{watchProgress.episode}
              </Text>
            )}
          </View>
        </View>

        {/* Resume indicator */}
        <View style={styles.resumeIndicator}>
          <Text style={styles.resumeText}>▶</Text>
        </View>
      </View>

      <View style={styles.titleContainer}>
        <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
          {title}
        </Text>
        {/* <Text style={styles.continueText}>Continue Watching</Text> */}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginRight: 8,
  },
  imageContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: COLORS.NETFLIX_DARK_GRAY,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    borderRadius: 8,
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.NETFLIX_GRAY,
    borderRadius: 8,
  },
  placeholderText: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 12,
    textAlign: 'center',
  },
  errorContainer: {
    backgroundColor: COLORS.NETFLIX_GRAY,
  },
  errorText: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 10,
    textAlign: 'center',
  },
  progressOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 8,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    marginBottom: 4,
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.NETFLIX_RED,
    borderRadius: 2,
  },
  progressText: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 10,
    fontWeight: 'bold',
  },
  resumeIndicator: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resumeText: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 10,
    fontWeight: 'bold',
  },
  titleContainer: {
    marginTop: 8,
    paddingHorizontal: 4,
  },
  title: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 2,
  },
  continueText: {
    color: COLORS.NETFLIX_LIGHT_GRAY,
    fontSize: 10,
    textAlign: 'center',
  },
});

export default ContinueWatchingCard;
