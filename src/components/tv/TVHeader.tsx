/**
 * TV Header Component
 * Large, simplified header optimized for TV viewing distance
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface TVHeaderProps {
  title?: string;
  showLogo?: boolean;
  showSearch?: boolean;
  showSettings?: boolean;
  onSearchPress?: () => void;
  onSettingsPress?: () => void;
  onLogoPress?: () => void;
}

const TV_FOCUS_COLOR = '#E50914';

export const TVHeader: React.FC<TVHeaderProps> = ({
  title,
  showLogo = true,
  showSearch = true,
  showSettings = true,
  onSearchPress,
  onSettingsPress,
  onLogoPress,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.leftSection}>
        {showLogo && (
          <TVHeaderButton onPress={onLogoPress}>
            <Text style={styles.logoText}>FLICK</Text>
          </TVHeaderButton>
        )}
        {title && <Text style={styles.title}>{title}</Text>}
      </View>

      <View style={styles.rightSection}>
        {showSearch && (
          <TVHeaderButton onPress={onSearchPress} icon="magnify" label="Search" />
        )}
        {showSettings && (
          <TVHeaderButton onPress={onSettingsPress} icon="cog" label="Settings" />
        )}
      </View>
    </View>
  );
};

interface TVHeaderButtonProps {
  onPress?: () => void;
  icon?: string;
  label?: string;
  children?: React.ReactNode;
}

const TVHeaderButton: React.FC<TVHeaderButtonProps> = ({
  onPress,
  icon,
  label,
  children,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const scale = useSharedValue(1);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    scale.value = withSpring(1.1, { damping: 15, stiffness: 150 });
  }, [scale]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      style={[
        styles.headerButton,
        isFocused && styles.headerButtonFocused,
        animatedStyle,
      ]}
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {children || (
        <View style={styles.buttonContent}>
          {icon && (
            <Icon
              name={icon}
              size={32}
              color={isFocused ? TV_FOCUS_COLOR : '#FFFFFF'}
            />
          )}
          {label && (
            <Text
              style={[styles.buttonLabel, isFocused && styles.buttonLabelFocused]}
            >
              {label}
            </Text>
          )}
        </View>
      )}
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 48,
    paddingVertical: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  logoText: {
    color: TV_FOCUS_COLOR,
    fontSize: 36,
    fontWeight: 'bold',
    letterSpacing: 4,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '600',
    marginLeft: 32,
  },
  headerButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  headerButtonFocused: {
    borderColor: TV_FOCUS_COLOR,
    backgroundColor: 'rgba(229, 9, 20, 0.1)',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  buttonLabel: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '500',
  },
  buttonLabelFocused: {
    color: TV_FOCUS_COLOR,
  },
});

export default TVHeader;
