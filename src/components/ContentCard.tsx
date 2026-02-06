import React, {useState, useCallback} from 'react';
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
import {isTV, TV_FOCUS_BORDER_COLOR} from '../utils/tv';
import TVFocusable from './TVFocusable';

interface ContentCardProps {
  item: Movie | TVShow;
  onPress: (item: Movie | TVShow) => void;
  size?: 'small' | 'medium' | 'large';
  style?: ViewStyle;
  hasTVPreferredFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}

const ContentCard: React.FC<ContentCardProps> = ({
  item,
  onPress,
  size = 'medium',
  style,
  hasTVPreferredFocus = false,
  onFocus,
  onBlur,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const cardDimensions = isTV
    ? {width: getCardDimensions(size).width * 1.2, height: getCardDimensions(size).height * 1.2}
    : getCardDimensions(size);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    onFocus?.();
  }, [onFocus]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    onBlur?.();
  }, [onBlur]);
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
    <TVFocusable
      style={[
        styles.container,
        {width: cardDimensions.width},
        style,
        isFocused && styles.focusedContainer,
      ]}
      onPress={() => onPress(item)}
      activeOpacity={0.8}
      accessible={true}
      accessibilityRole={accessibilityRoles.button}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHints.contentCard}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onFocus={handleFocus}
      onBlur={handleBlur}
      showFocusBorder={false}>
      <View style={[
        styles.imageContainer,
        cardDimensions,
        isFocused && styles.focusedImage,
      ]}>
        <OptimizedImage
          uri={imageUrl}
          style={[styles.image, cardDimensions] as any}
          fallbackText="No Image"
          showLoadingIndicator={true}
        />
        {rating !== undefined && rating > 0 && (
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
            style={[
              styles.title,
              isFocused && styles.focusedTitle,
            ]}
            numberOfLines={2}
            ellipsizeMode="tail"
            accessible={true}
            accessibilityRole={accessibilityRoles.text}>
            {title}
          </Text>
        </View>
      )}
    </TVFocusable>
  );
};

const styles = StyleSheet.create({
  container: {
    marginRight: spacing.sm,
  },
  focusedContainer: {
    zIndex: 10,
  },
  imageContainer: {
    borderRadius: spacing.sm,
    overflow: 'hidden',
    backgroundColor: COLORS.NETFLIX_DARK_GRAY,
    position: 'relative',
  },
  focusedImage: {
    borderWidth: 3,
    borderColor: TV_FOCUS_BORDER_COLOR,
    borderRadius: spacing.sm + 2,
    transform: [{scale: 1.05}],
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
  focusedTitle: {
    color: TV_FOCUS_BORDER_COLOR,
    fontWeight: 'bold',
  },
});

export {ContentCard};
