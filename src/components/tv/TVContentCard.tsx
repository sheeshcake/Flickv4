/**
 * TVContentCard – A large, focus-aware content card for TV.
 * Optimized for 10-foot UI with focus highlighting.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ImageBackground,
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Movie, TVShow } from '../../types';
import { TMDBService } from '../../services/TMDBService';

const tmdbService = new TMDBService();

interface TVContentCardProps {
  item: Movie | TVShow;
  onPress: (item: Movie | TVShow) => void;
  width?: number;
  height?: number;
  hasTVPreferredFocus?: boolean;
}

const isMovie = (item: Movie | TVShow): item is Movie =>
  'title' in item && typeof (item as any).title === 'string';

export const TVContentCard: React.FC<TVContentCardProps> = ({
  item,
  onPress,
  width = 200,
  height = 120,
  hasTVPreferredFocus = false,
}) => {
  const [focused, setFocused] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const mountPreferFocus = useRef(hasTVPreferredFocus).current;

  const title = isMovie(item) ? item.title : (item as any).name;
  const imageUrl = tmdbService.getImageUrl(
    item.backdrop_path || item.poster_path || '',
    'w300',
  );

  const handleFocus = useCallback(() => {
    setFocused(true);
    Animated.spring(scaleAnim, { toValue: 1.06, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
  }, [scaleAnim]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
  }, [scaleAnim]);

  return (
    <Animated.View style={[styles.scaleWrap, { transform: [{ scale: scaleAnim }] }]}>
      <Pressable
        onPress={() => onPress(item)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        // @ts-ignore — TV-specific prop
        hasTVPreferredFocus={mountPreferFocus}
        accessible
        accessibilityLabel={`${title}, rated ${item.vote_average?.toFixed(1)}`}
        style={(state: any) => [
          styles.card,
          { width, height },
          (focused || state.focused) && styles.cardFocused,
        ]}
      >
        <View style={styles.imageWrap}>
          <ImageBackground
            source={{ uri: imageUrl }}
            style={styles.image}
            resizeMode="cover"
          >
            <View style={styles.overlay}>
              {focused && (
                <View style={styles.playHint}>
                  <Icon name="play-circle-outline" size={36} color="#FFFFFF" />
                </View>
              )}
              <View style={styles.meta}>
                <Text style={styles.title} numberOfLines={1}>
                  {title}
                </Text>
                <View style={styles.ratingRow}>
                  <Icon name="star" size={12} color="#FFD700" />
                  <Text style={styles.rating}>
                    {item.vote_average?.toFixed(1) || 'N/A'}
                  </Text>
                </View>
              </View>
            </View>
          </ImageBackground>
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  // Scale wrapper — no overflow, scale transform expands freely outward
  scaleWrap: {
    marginRight: 16,
  },
  // Pressable — NO overflow:hidden so the border is never clipped by its own view
  card: {
    borderRadius: 10,
    borderWidth: 3,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  cardFocused: {
    borderColor: '#E50914',
    backgroundColor: 'rgba(229, 9, 20, 0.20)',
  },
  imageWrap: {
    flex: 1,
    borderRadius: 7,
    overflow: 'hidden',
  },
  image: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 10,
  },
  playHint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  meta: {},
  title: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  rating: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '600',
  },
});

export default TVContentCard;
