/**
 * TV Content Card Component
 * Optimized for TV remote navigation with focus states and larger visuals
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Pressable } from 'react-native';
import { Movie, TVShow } from '../../types';
import { TMDB_CONFIG, COLORS } from '../../utils/constants';
import OptimizedImage from '../OptimizedImage';
import {
  accessibilityLabels,
  accessibilityHints,
  accessibilityRoles,
} from '../../utils/accessibility';

// TV-specific constants
const TV_CARD_WIDTH = 220;
const TV_CARD_HEIGHT = 330;
const TV_FOCUS_SCALE = 1.1;
const TV_FOCUS_BORDER_WIDTH = 4;
const TV_FOCUS_BORDER_COLOR = '#E50914';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface TVContentCardProps {
  item: Movie | TVShow;
  onPress: (item: Movie | TVShow) => void;
  size?: 'small' | 'medium' | 'large';
  style?: ViewStyle;
  hasTVPreferredFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}

const getCardDimensions = (size: 'small' | 'medium' | 'large') => {
  switch (size) {
    case 'small':
      return { width: TV_CARD_WIDTH * 0.75, height: TV_CARD_HEIGHT * 0.75 };
    case 'large':
      return { width: TV_CARD_WIDTH * 1.2, height: TV_CARD_HEIGHT * 1.2 };
    default:
      return { width: TV_CARD_WIDTH, height: TV_CARD_HEIGHT };
  }
};

export const TVContentCard: React.FC<TVContentCardProps> = ({
  item,
  onPress,
  size = 'medium',
  style,
  hasTVPreferredFocus = false,
  onFocus,
  onBlur,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const scale = useSharedValue(1);
  const cardDimensions = getCardDimensions(size);

  const imageUrl = item.poster_path
    ? `${TMDB_CONFIG.IMAGE_BASE_URL}${item.poster_path}`
    : '';

  const title = 'title' in item ? item.title : item.name;
  const rating = item.vote_average;
  const isMovie = 'title' in item;

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    scale.value = withSpring(TV_FOCUS_SCALE, {
      damping: 15,
      stiffness: 150,
    });
    onFocus?.();
  }, [onFocus, scale]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    scale.value = withSpring(1, {
      damping: 15,
      stiffness: 150,
    });
    onBlur?.();
  }, [onBlur, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const accessibilityLabel = isMovie
    ? accessibilityLabels.movieCard(title)
    : accessibilityLabels.tvShowCard(title);

  return (
    <AnimatedPressable
      style={[
        styles.container,
        { width: cardDimensions.width },
        style,
        animatedStyle,
      ]}
      onPress={() => onPress(item)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      accessible={true}
      accessibilityRole={accessibilityRoles.button}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHints.contentCard}
      // @ts-ignore - TV-specific prop
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <View
        style={[
          styles.imageContainer,
          cardDimensions,
          isFocused && styles.focusedImageContainer,
        ]}
      >
        <OptimizedImage
          uri={imageUrl}
          style={[styles.image, cardDimensions] as any}
          fallbackText="No Image"
          showLoadingIndicator={true}
        />
        {rating !== undefined && rating > 0 && (
          <View style={styles.ratingContainer}>
            <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
          </View>
        )}
        {isFocused && <View style={styles.focusOverlay} />}
      </View>
      <View style={styles.titleContainer}>
        <Text
          style={[styles.title, isFocused && styles.focusedTitle]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {title}
        </Text>
      </View>
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  container: {
    marginRight: 24,
    marginVertical: 8,
  },
  imageContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLORS.NETFLIX_DARK_GRAY,
    position: 'relative',
  },
  focusedImageContainer: {
    borderWidth: TV_FOCUS_BORDER_WIDTH,
    borderColor: TV_FOCUS_BORDER_COLOR,
    borderRadius: 14,
  },
  image: {
    borderRadius: 12,
  },
  focusOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(229, 9, 20, 0.1)',
    borderRadius: 12,
  },
  ratingContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TV_FOCUS_BORDER_COLOR,
  },
  ratingText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
  },
  titleContainer: {
    paddingTop: 12,
    paddingHorizontal: 4,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  focusedTitle: {
    color: TV_FOCUS_BORDER_COLOR,
    fontWeight: 'bold',
  },
});

export default TVContentCard;
