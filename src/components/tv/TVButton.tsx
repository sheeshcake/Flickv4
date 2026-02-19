/**
 * TV Button Component
 * Large, focusable button optimized for TV remote navigation
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  Text,
  StyleSheet,
  Pressable,
  ViewStyle,
  TextStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const TV_FOCUS_COLOR = '#E50914';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
type ButtonSize = 'small' | 'medium' | 'large';

interface TVButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  iconPosition?: 'left' | 'right';
  disabled?: boolean;
  hasTVPreferredFocus?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const TVButton: React.FC<TVButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  icon,
  iconPosition = 'left',
  disabled = false,
  hasTVPreferredFocus = false,
  style,
  textStyle,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const scale = useSharedValue(1);

  // Snapshot hasTVPreferredFocus at mount only.
  // On Android TV, if this prop stays `true` across re-renders the framework
  // re-asserts focus every render, pulling the D-pad cursor back to this
  // button whenever ANY state change triggers a re-render.
  const mountPreferFocus = useRef(hasTVPreferredFocus).current;

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    scale.value = withSpring(1.05, { damping: 15, stiffness: 150 });
  }, [scale]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const sizeStyles = getSizeStyles(size);
  const variantStyles = getVariantStyles(variant, isFocused, disabled);

  const iconSize = size === 'small' ? 20 : size === 'large' ? 32 : 24;
  const iconColor = disabled
    ? '#666666'
    : variant === 'outline' || variant === 'ghost'
    ? isFocused
      ? TV_FOCUS_COLOR
      : '#FFFFFF'
    : '#FFFFFF';

  return (
    <AnimatedPressable
      style={[
        styles.button,
        sizeStyles.button,
        variantStyles.button,
        disabled && styles.disabled,
        animatedStyle,
        style,
      ]}
      onPress={disabled ? undefined : onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      // @ts-ignore - TV-specific prop
      hasTVPreferredFocus={mountPreferFocus}
    >
      {icon && iconPosition === 'left' && (
        <Icon
          name={icon}
          size={iconSize}
          color={iconColor}
          style={styles.iconLeft}
        />
      )}
      <Text
        style={[
          styles.text,
          sizeStyles.text,
          variantStyles.text,
          disabled && styles.disabledText,
          textStyle,
        ]}
      >
        {title}
      </Text>
      {icon && iconPosition === 'right' && (
        <Icon
          name={icon}
          size={iconSize}
          color={iconColor}
          style={styles.iconRight}
        />
      )}
    </AnimatedPressable>
  );
};

const getSizeStyles = (size: ButtonSize) => {
  switch (size) {
    case 'small':
      return {
        button: { paddingHorizontal: 24, paddingVertical: 12 },
        text: { fontSize: 16 },
      };
    case 'large':
      return {
        button: { paddingHorizontal: 48, paddingVertical: 24 },
        text: { fontSize: 24 },
      };
    default:
      return {
        button: { paddingHorizontal: 32, paddingVertical: 16 },
        text: { fontSize: 20 },
      };
  }
};

const getVariantStyles = (
  variant: ButtonVariant,
  isFocused: boolean,
  disabled: boolean
) => {
  if (disabled) {
    return {
      button: { backgroundColor: '#333333', borderColor: '#333333' },
      text: { color: '#666666' },
    };
  }

  switch (variant) {
    case 'secondary':
      return {
        button: {
          backgroundColor: isFocused ? '#444444' : '#333333',
          borderColor: isFocused ? TV_FOCUS_COLOR : '#333333',
        },
        text: { color: '#FFFFFF' },
      };
    case 'outline':
      return {
        button: {
          backgroundColor: isFocused ? 'rgba(229, 9, 20, 0.1)' : 'transparent',
          borderColor: isFocused ? TV_FOCUS_COLOR : '#666666',
        },
        text: { color: isFocused ? TV_FOCUS_COLOR : '#FFFFFF' },
      };
    case 'ghost':
      return {
        button: {
          backgroundColor: isFocused ? 'rgba(229, 9, 20, 0.1)' : 'transparent',
          borderColor: 'transparent',
        },
        text: { color: isFocused ? TV_FOCUS_COLOR : '#FFFFFF' },
      };
    default: // primary
      return {
        button: {
          backgroundColor: isFocused ? TV_FOCUS_COLOR : '#B5070F',
          borderColor: isFocused ? '#FF4444' : '#B5070F',
        },
        text: { color: '#FFFFFF' },
      };
  }
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 3,
  },
  text: {
    fontWeight: '600',
  },
  iconLeft: {
    marginRight: 12,
  },
  iconRight: {
    marginLeft: 12,
  },
  disabled: {
    opacity: 0.5,
  },
  disabledText: {
    color: '#666666',
  },
});

export default TVButton;