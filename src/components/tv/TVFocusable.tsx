/**
 * TVFocusable – A pressable wrapper with TV focus highlight support.
 * Works on both tvOS and Android TV via React Native's built-in focus APIs.
 */

import React, { useRef, useState, useCallback } from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  StyleProp,
  View,
} from 'react-native';

const TV_FOCUS_BORDER_COLOR = '#E50914';

interface TVFocusableProps {
  children: React.ReactNode;
  onPress?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  style?: StyleProp<ViewStyle>;
  focusedStyle?: StyleProp<ViewStyle>;
  hasTVPreferredFocus?: boolean;
  accessible?: boolean;
  accessibilityLabel?: string;
  disabled?: boolean;
}

export const TVFocusable: React.FC<TVFocusableProps> = ({
  children,
  onPress,
  onFocus,
  onBlur,
  style,
  focusedStyle,
  hasTVPreferredFocus,
  accessible = true,
  accessibilityLabel,
  disabled = false,
}) => {
  const [focused, setFocused] = useState(false);

  const handleFocus = useCallback(() => {
    setFocused(true);
    onFocus?.();
  }, [onFocus]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    onBlur?.();
  }, [onBlur]);

  // Use any-cast for TV-specific props not yet in standard React Native typings
  const tvProps: any = {
    hasTVPreferredFocus,
  };

  return (
    <TouchableOpacity
      {...tvProps}
      onPress={disabled ? undefined : onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      activeOpacity={0.8}
      style={[
        styles.base,
        style,
        focused && styles.focused,
        focused && focusedStyle,
      ]}
    >
      {children}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 6,
  },
  focused: {
    borderColor: TV_FOCUS_BORDER_COLOR,
    shadowColor: TV_FOCUS_BORDER_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 8,
  },
});

export default TVFocusable;
