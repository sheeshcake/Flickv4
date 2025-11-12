import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import {COLORS} from '../utils/constants';

export interface LoadingIndicatorProps {
  size?: 'small' | 'large';
  color?: string;
  text?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
  overlay?: boolean;
  transparent?: boolean;
}

/**
 * Reusable loading indicator component with customizable appearance
 */
export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  size = 'large',
  color = COLORS.NETFLIX_RED,
  text,
  style,
  textStyle,
  overlay = false,
  transparent = false,
}) => {
  const containerStyle = [
    styles.container,
    overlay && styles.overlay,
    transparent && styles.transparent,
    style,
  ];

  return (
    <View style={containerStyle}>
      <ActivityIndicator size={size} color={color} />
      {text && <Text style={[styles.text, textStyle]}>{text}</Text>}
    </View>
  );
};

/**
 * Full screen loading indicator with overlay
 */
export const FullScreenLoader: React.FC<{
  text?: string;
  visible?: boolean;
}> = ({text = 'Loading...', visible = true}) => {
  if (!visible) {
    return null;
  }

  return (
    <LoadingIndicator
      size="large"
      text={text}
      overlay
      style={styles.fullScreen}
    />
  );
};

/**
 * Inline loading indicator for content sections
 */
export const InlineLoader: React.FC<{
  text?: string;
  size?: 'small' | 'large';
}> = ({text, size = 'small'}) => {
  return (
    <LoadingIndicator size={size} {...(text && {text})} style={styles.inline} />
  );
};

/**
 * Loading skeleton for content cards
 */
export const ContentSkeleton: React.FC<{
  width?: number;
  height?: number;
  style?: ViewStyle;
}> = ({width = 120, height = 180, style}) => {
  return (
    <View style={[styles.skeleton, {width, height}, style]}>
      <View style={styles.skeletonShimmer} />
    </View>
  );
};

/**
 * Loading skeleton for horizontal lists
 */
export const HorizontalListSkeleton: React.FC<{
  itemCount?: number;
  itemWidth?: number;
  itemHeight?: number;
}> = ({itemCount = 5, itemWidth = 120, itemHeight = 180}) => {
  return (
    <View style={styles.horizontalSkeleton}>
      {Array.from({length: itemCount}).map((_, index) => (
        <ContentSkeleton
          key={index}
          width={itemWidth}
          height={itemHeight}
          style={styles.skeletonItem}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 1000,
  },
  transparent: {
    backgroundColor: 'transparent',
  },
  fullScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inline: {
    paddingVertical: 10,
  },
  text: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.NETFLIX_WHITE,
    textAlign: 'center',
  },
  skeleton: {
    backgroundColor: COLORS.NETFLIX_DARK_GRAY,
    borderRadius: 8,
    overflow: 'hidden',
  },
  skeletonShimmer: {
    flex: 1,
    backgroundColor: COLORS.NETFLIX_LIGHT_GRAY,
    opacity: 0.3,
  },
  horizontalSkeleton: {
    flexDirection: 'row',
    paddingHorizontal: 20,
  },
  skeletonItem: {
    marginRight: 12,
  },
});
