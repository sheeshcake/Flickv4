import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import {Movie, TVShow} from '../types';
import {TMDB_CONFIG, COLORS} from '../utils/constants';
import OptimizedImage from './OptimizedImage';
import {getCardDimensions, typography, spacing} from '../utils/responsive';
import {
  accessibilityLabels,
  accessibilityHints,
  accessibilityRoles,
  getContentDescription,
} from '../utils/accessibility';

interface ContentCardProps {
  item: Movie | TVShow;
  onPress: (item: Movie | TVShow) => void;
  size?: 'small' | 'medium' | 'large';
  style?: ViewStyle;
}

const ContentCard: React.FC<ContentCardProps> = ({
  item,
  onPress,
  size = 'medium',
  style,
}) => {
  const cardDimensions = getCardDimensions(size);
  const imageUrl = item.poster_path
    ? `${TMDB_CONFIG.IMAGE_BASE_URL}${item.poster_path}`
    : '';

  const title = 'title' in item ? item.title : item.name;
  const rating = item.vote_average;
  const isMovie = 'title' in item;

  // Accessibility
  const accessibilityLabel = isMovie
    ? accessibilityLabels.movieCard(title)
    : accessibilityLabels.tvShowCard(title);
  const contentDescription = getContentDescription(item);

  return (
    <TouchableOpacity
      style={[styles.container, {width: cardDimensions.width}, style]}
      onPress={() => onPress(item)}
      activeOpacity={0.8}
      accessible={true}
      accessibilityRole={accessibilityRoles.button}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHints.contentCard}
      accessibilityValue={{text: contentDescription}}>
      <View style={[styles.imageContainer, cardDimensions]}>
        <OptimizedImage
          uri={imageUrl}
          style={[styles.image, cardDimensions] as any}
          fallbackText="No Image"
          showLoadingIndicator={true}
        />
        {rating > 0 && (
          <View
            style={styles.ratingContainer}
            accessible={true}
            accessibilityLabel={accessibilityLabels.contentRating(rating)}
            accessibilityRole={accessibilityRoles.text}>
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
            accessible={true}
            accessibilityRole={accessibilityRoles.text}>
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginRight: spacing.sm,
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
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: spacing.xs,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: spacing.xs / 2,
  },
  ratingText: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: typography.small,
    fontWeight: 'bold',
  },
  titleContainer: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  title: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: typography.caption,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: typography.caption * 1.2,
  },
});

export {ContentCard};
