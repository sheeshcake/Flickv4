/**
 * TV Setting Item Component
 * Large, focusable settings item for TV remote navigation
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Pressable,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const TV_FOCUS_COLOR = '#E50914';

interface TVSettingItemProps {
  title: string;
  description?: string;
  icon?: string;
  type?: 'toggle' | 'button' | 'navigation';
  value?: boolean;
  onPress?: () => void;
  onToggle?: (value: boolean) => void;
  hasTVPreferredFocus?: boolean;
}

export const TVSettingItem: React.FC<TVSettingItemProps> = ({
  title,
  description,
  icon,
  type = 'button',
  value,
  onPress,
  onToggle,
  hasTVPreferredFocus = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const scale = useSharedValue(1);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    scale.value = withSpring(1.02, { damping: 15, stiffness: 150 });
  }, [scale]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
  }, [scale]);

  const handlePress = useCallback(() => {
    if (type === 'toggle' && onToggle !== undefined) {
      onToggle(!value);
    } else if (onPress) {
      onPress();
    }
  }, [type, onToggle, onPress, value]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      style={[
        styles.container,
        isFocused && styles.containerFocused,
        animatedStyle,
      ]}
      onPress={handlePress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      // @ts-ignore - TV-specific prop
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <View style={styles.leftContent}>
        {icon && (
          <View style={[styles.iconContainer, isFocused && styles.iconContainerFocused]}>
            <Icon
              name={icon}
              size={28}
              color={isFocused ? TV_FOCUS_COLOR : '#FFFFFF'}
            />
          </View>
        )}
        <View style={styles.textContainer}>
          <Text style={[styles.title, isFocused && styles.titleFocused]}>
            {title}
          </Text>
          {description && (
            <Text style={styles.description}>{description}</Text>
          )}
        </View>
      </View>

      <View style={styles.rightContent}>
        {type === 'toggle' && (
          <Switch
            value={value}
            onValueChange={onToggle}
            trackColor={{ false: '#333333', true: TV_FOCUS_COLOR }}
            thumbColor={value ? '#FFFFFF' : '#888888'}
            style={styles.switch}
          />
        )}
        {type === 'navigation' && (
          <Icon
            name="chevron-right"
            size={32}
            color={isFocused ? TV_FOCUS_COLOR : '#666666'}
          />
        )}
      </View>
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 32,
    paddingVertical: 24,
    marginHorizontal: 48,
    marginVertical: 8,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  containerFocused: {
    borderColor: TV_FOCUS_COLOR,
    backgroundColor: '#252525',
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 24,
  },
  iconContainerFocused: {
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '600',
  },
  titleFocused: {
    color: TV_FOCUS_COLOR,
  },
  description: {
    color: '#888888',
    fontSize: 16,
    marginTop: 4,
  },
  rightContent: {
    marginLeft: 16,
  },
  switch: {
    transform: [{ scale: 1.3 }],
  },
});

export default TVSettingItem;
