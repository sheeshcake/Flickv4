import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  ImageStyle,
  Image,
  ImageProps,
  ImageResizeMode,
} from 'react-native';
import {COLORS} from '../utils/constants';

// Custom types for priority (simulating FastImage behavior)
export type Priority = 'low' | 'normal' | 'high';

// Helper function to convert resizeMode string to ImageResizeMode
const getResizeMode = (mode?: ImageResizeMode | string): ImageResizeMode => {
  switch (mode) {
    case 'contain':
      return 'contain';
    case 'stretch':
      return 'stretch';
    case 'center':
      return 'center';
    case 'repeat':
      return 'repeat';
    case 'cover':
    default:
      return 'cover';
  }
};

interface OptimizedImageProps extends Omit<ImageProps, 'source' | 'style'> {
  uri: string;
  style?: ImageStyle | ViewStyle;
  placeholder?: React.ReactNode;
  showLoadingIndicator?: boolean;
  fallbackText?: string;
  priority?: Priority;
  resizeMode?: ImageResizeMode;
  onLoadStart?: () => void;
  onLoad?: () => void;
  onError?: () => void;
  onLoadEnd?: () => void;
}

const OptimizedImage: React.FC<OptimizedImageProps> = ({
  uri,
  style,
  placeholder,
  showLoadingIndicator = true,
  fallbackText = 'No Image',
  priority = 'normal',
  resizeMode = 'cover',
  onLoadStart,
  onLoad,
  onError,
  onLoadEnd,
  ...props
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Preload image for better performance (simulating FastImage behavior)
  React.useEffect(() => {
    if (uri && priority === 'high') {
      Image.prefetch(uri).catch(() => {
        // Prefetch failed, but we'll still try to load the image normally
      });
    }
  }, [uri, priority]);

  const handleLoadStart = useCallback(() => {
    setLoading(true);
    setError(false);
    onLoadStart?.();
  }, [onLoadStart]);

  const handleLoad = useCallback(() => {
    setLoading(false);
    setError(false);
    onLoad?.();
  }, [onLoad]);

  const handleError = useCallback(() => {
    setLoading(false);
    setError(true);
    onError?.();
  }, [onError]);

  const handleLoadEnd = useCallback(() => {
    setLoading(false);
    onLoadEnd?.();
  }, [onLoadEnd]);

  const renderPlaceholder = () => {
    if (placeholder) {
      return placeholder;
    }

    return (
      <View style={[styles.placeholder, style]}>
        <Text style={styles.placeholderText}>{fallbackText}</Text>
      </View>
    );
  };

  const renderLoadingIndicator = () => (
    <View style={[styles.loadingContainer, style]}>
      <ActivityIndicator size="small" color={COLORS.NETFLIX_RED} />
    </View>
  );

  if (error || !uri) {
    return renderPlaceholder();
  }

  return (
    <View style={style}>
      {loading && showLoadingIndicator && renderLoadingIndicator()}
      <Image
        {...props}
        source={{uri}}
        style={[style as ImageStyle, loading && styles.hidden]}
        resizeMode={getResizeMode(resizeMode)}
        onLoadStart={handleLoadStart}
        onLoad={handleLoad}
        onError={handleError}
        onLoadEnd={handleLoadEnd}
      />
    </View>
  );
};

const styles = StyleSheet.create({
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
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.NETFLIX_DARK_GRAY,
    borderRadius: 8,
    zIndex: 1,
  },
  hidden: {
    opacity: 0,
  },
});

export default OptimizedImage;
