/**
 * Mobile Content Card Component
 * Touch-optimized card with gesture support
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ViewStyle,
} from 'react-native';
import { Movie, TVShow } from '../../types';
import { TMDB_CONFIG, COLORS } from '../../utils/constants';
import OptimizedImage from '../OptimizedImage';
import { getCardDimensions, spacing, typography } from '../../utils/responsive';
import {
  accessibilityLabels,
  accessibilityHints,
  accessibilityRoles,
} from '../../utils/accessibility';

interface MobileContentCardProps {
  item: Movie | TVShow;
  onPress: (item: Movie | TVShow) => void;
  size?: 'small' | 'medium' | 'large';
  style?: ViewStyle;
  onLongPress?: (item: Movie | TVShow) => void;
}

export const MobileContentCard: React.FC<MobileContentCardProps> = ({
  item,
  onPress,
  size = 'medium',
  style,
  onLongPress,
}) => {
  const cardDimensions = getCardDimensions(size);

  const imageUrl = item.poster_path
    ? `${TMDB_CONFIG.IMAGE_BASE_URL}${item.poster_path}`
    : '';

  const title = 'title' in item ? item.title : item.name;
  const rating = item.vote_average;
  const isMovie = 'title' in item;

  const handlePress = useCallback(() => {
    onPress(item);
  }, [onPress, item]);

  const handleLongPress = useCallback(() => {
    onLongPress?.(item);
  }, [onLongPress, item]);

  const accessibilityLabel = isMovie
    ? accessibilityLabels.movieCard(title)
    : accessibilityLabels.tvShowCard(title);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        { width: cardDimensions.width },
        style,
        pressed && styles.pressed,
      ]}
      onPress={handlePress}
      onLongPress={handleLongPress}
      accessible={true}
      accessibilityRole={accessibilityRoles.button}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHints.contentCard}
    >
      <View style={[styles.imageContainer, cardDimensions]}>
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
      </View>
      {size !== 'small' && (
        <View style={styles.titleContainer}>
          <Text
            style={styles.title}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    marginRight: spacing.sm,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  imageContainer: {
    borderRadius: spacing.sm,
    overflow: 'hidden',
    backgroundColor: COLORS.NETFLIX_DARK_GRAY,
    position: 'relative',
  },
  image: {
    borderRadius: spacing.sm,
  },
  ratingContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ratingText: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: 'bold',
  },
  titleContainer: {
    paddingTop: spacing.xs,
    paddingHorizontal: 2,
  },
  title: {
    color: '#FFFFFF',
    fontSize: typography.caption,
    fontWeight: '500',
  },
});

export default MobileContentCard;
