import React, {useState, useEffect, useRef} from 'react';
import {View, Dimensions, ViewStyle} from 'react-native';
import {Movie, TVShow} from '../types';
import {ContentCard} from './ContentCard';
import {COLORS} from '../utils/constants';

interface LazyContentCardProps {
  item: Movie | TVShow;
  onPress: (item: Movie | TVShow) => void;
  size?: 'small' | 'medium' | 'large';
  style?: ViewStyle;
  index: number;
  isVisible?: boolean;
}

const {width: screenWidth} = Dimensions.get('window');

const LazyContentCard: React.FC<LazyContentCardProps> = ({
  item,
  onPress,
  size = 'medium',
  style,
  index,
  isVisible = true,
}) => {
  const [shouldRender, setShouldRender] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getCardDimensions = () => {
    switch (size) {
      case 'small':
        return {width: screenWidth * 0.25, height: screenWidth * 0.375};
      case 'medium':
        return {width: screenWidth * 0.3, height: screenWidth * 0.45};
      case 'large':
        return {width: screenWidth * 0.4, height: screenWidth * 0.6};
      default:
        return {width: screenWidth * 0.3, height: screenWidth * 0.45};
    }
  };

  useEffect(() => {
    if (isVisible) {
      // Delay rendering for off-screen items to improve initial load performance
      const delay = index < 3 ? 0 : Math.min(index * 50, 500);

      timeoutRef.current = setTimeout(() => {
        setShouldRender(true);
      }, delay);
    } else {
      setShouldRender(false);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isVisible, index]);

  const cardDimensions = getCardDimensions();

  if (!shouldRender) {
    return (
      <View
        style={[
          {
            width: cardDimensions.width,
            height: cardDimensions.height,
            backgroundColor: COLORS.NETFLIX_DARK_GRAY,
            borderRadius: 8,
            marginRight: 8,
          },
          style,
        ]}
      />
    );
  }

  return (
    <ContentCard item={item} onPress={onPress} size={size} style={style} />
  );
};

export default LazyContentCard;
