/**
 * TVFocusable Component
 * A wrapper component that provides TV focus management for Android TV
 */

import React, {useCallback, useRef, useState} from 'react';
import {
  Pressable,
  StyleSheet,
  ViewStyle,
  StyleProp,
  View,
  PressableProps,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import {isTV, TV_FOCUS_SCALE, TV_FOCUS_BORDER_COLOR} from '../utils/tv';

interface TVFocusableProps {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  style?: StyleProp<ViewStyle>;
  focusedStyle?: StyleProp<ViewStyle>;
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
  activeOpacity?: number;
  testID?: string;
  accessible?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'link' | 'none';
  focusScale?: number;
  showFocusBorder?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const TVFocusable: React.FC<TVFocusableProps> = ({
  children,
  onPress,
  onLongPress,
  onFocus,
  onBlur,
  style,
  focusedStyle,
  hasTVPreferredFocus = false,
  disabled = false,
  activeOpacity = 0.8,
  testID,
  accessible = true,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  focusScale = TV_FOCUS_SCALE,
  showFocusBorder = true,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const scale = useSharedValue(1);
  const ref = useRef<View>(null);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    scale.value = withSpring(focusScale, {damping: 15, stiffness: 150});
    onFocus?.();
  }, [focusScale, onFocus, scale]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    scale.value = withSpring(1, {damping: 15, stiffness: 150});
    onBlur?.();
  }, [onBlur, scale]);

  const animatedStyle = useAnimatedStyle(() => {
    if (!isTV) return {};
    return {
      transform: [{scale: scale.value}],
    };
  });

  // For non-TV platforms, use simpler Pressable
  if (!isTV) {
    return (
      <Pressable
        ref={ref}
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={disabled}
        style={({pressed}) => [
          style,
          pressed && {opacity: activeOpacity},
        ]}
        testID={testID}
        accessible={accessible}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityRole={accessibilityRole}>
        {children}
      </Pressable>
    );
  }

  // TV-specific implementation with focus handling
  // Build TV-specific props
  const tvProps: PressableProps & {
    hasTVPreferredFocus?: boolean;
  } = {
    onPress,
    onLongPress,
    onFocus: handleFocus,
    onBlur: handleBlur,
    disabled,
    testID,
    accessible,
    accessibilityLabel,
    accessibilityHint,
    accessibilityRole,
  };

  // Add TV preferred focus if needed
  if (hasTVPreferredFocus) {
    tvProps.hasTVPreferredFocus = true;
  }

  return (
    <AnimatedPressable
      ref={ref}
      {...tvProps}
      style={[
        style,
        animatedStyle,
        isFocused && showFocusBorder && styles.focused,
        isFocused && focusedStyle,
      ]}>
      {children}
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  focused: {
    borderWidth: 3,
    borderColor: TV_FOCUS_BORDER_COLOR,
    borderRadius: 8,
    zIndex: 10,
  },
});

export {TVFocusable};
export default TVFocusable;
