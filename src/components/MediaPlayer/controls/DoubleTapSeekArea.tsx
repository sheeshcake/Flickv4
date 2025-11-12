import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Text, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../../../constants/theme';
import { styles } from './styles';
import { DoubleTapSeekAreaProps } from './types';
import { DOUBLE_PRESS_DELAY } from './utils';

const DoubleTapSeekAreaComponent: React.FC<DoubleTapSeekAreaProps> = ({
  onDoubleTap,
  onSingleTap,
  side,
  style,
  seekAmountLabel,
}) => {
  const lastTapRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showSeekIndicator, setShowSeekIndicator] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const handlePress = useCallback(() => {
    const now = Date.now();
    const timeSinceLastTap = lastTapRef.current ? now - lastTapRef.current : DOUBLE_PRESS_DELAY + 1;

    if (timeSinceLastTap < DOUBLE_PRESS_DELAY) {
      onDoubleTap();
      setShowSeekIndicator(true);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowSeekIndicator(false);
      });
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        onSingleTap();
        timeoutRef.current = null;
      }, DOUBLE_PRESS_DELAY);
    }

    lastTapRef.current = now;
  }, [fadeAnim, onDoubleTap, onSingleTap]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <TouchableOpacity activeOpacity={1} onPress={handlePress} style={style}>
      {showSeekIndicator && (
        <Animated.View style={[styles.seekIndicator, { opacity: fadeAnim }]}>
          <Icon
            name={side === 'left' ? 'rewind' : 'fast-forward'}
            size={20}
            color={colors.white}
          />
          <Text style={styles.seekIndicatorText}>{seekAmountLabel}</Text>
        </Animated.View>
      )}
    </TouchableOpacity>
  );
};

export const DoubleTapSeekArea = memo(DoubleTapSeekAreaComponent);

DoubleTapSeekArea.displayName = 'DoubleTapSeekArea';
