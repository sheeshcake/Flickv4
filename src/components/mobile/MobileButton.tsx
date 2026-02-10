/**
 * Mobile Button Component
 * Touch-optimized button with various styles and sizes
 */

import React from 'react';
import {
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { spacing, typography } from '../../utils/responsive';

const BRAND_COLOR = '#E50914';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
type ButtonSize = 'small' | 'medium' | 'large';

interface MobileButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  iconPosition?: 'left' | 'right';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const MobileButton: React.FC<MobileButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  icon,
  iconPosition = 'left',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  textStyle,
}) => {
  const sizeStyles = getSizeStyles(size);
  const variantStyles = getVariantStyles(variant, disabled);

  const iconSize = size === 'small' ? 16 : size === 'large' ? 24 : 20;
  const iconColor = disabled
    ? '#666666'
    : variant === 'outline' || variant === 'ghost'
    ? BRAND_COLOR
    : '#FFFFFF';

  return (
    <TouchableOpacity
      style={[
        styles.button,
        sizeStyles.button,
        variantStyles.button,
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      onPress={disabled || loading ? undefined : onPress}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'outline' || variant === 'ghost' ? BRAND_COLOR : '#FFFFFF'}
        />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <Icon name={icon} size={iconSize} color={iconColor} style={styles.iconLeft} />
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
            <Icon name={icon} size={iconSize} color={iconColor} style={styles.iconRight} />
          )}
        </>
      )}
    </TouchableOpacity>
  );
};

const getSizeStyles = (size: ButtonSize) => {
  switch (size) {
    case 'small':
      return {
        button: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2 },
        text: { fontSize: typography.caption },
      };
    case 'large':
      return {
        button: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
        text: { fontSize: typography.h5 },
      };
    default:
      return {
        button: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2 },
        text: { fontSize: typography.body },
      };
  }
};

const getVariantStyles = (variant: ButtonVariant, disabled: boolean) => {
  if (disabled) {
    return {
      button: { backgroundColor: '#333333', borderColor: '#333333' },
      text: { color: '#666666' },
    };
  }

  switch (variant) {
    case 'secondary':
      return {
        button: { backgroundColor: '#333333', borderColor: '#333333' },
        text: { color: '#FFFFFF' },
      };
    case 'outline':
      return {
        button: { backgroundColor: 'transparent', borderColor: BRAND_COLOR },
        text: { color: BRAND_COLOR },
      };
    case 'ghost':
      return {
        button: { backgroundColor: 'transparent', borderColor: 'transparent' },
        text: { color: BRAND_COLOR },
      };
    default: // primary
      return {
        button: { backgroundColor: BRAND_COLOR, borderColor: BRAND_COLOR },
        text: { color: '#FFFFFF' },
      };
  }
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  fullWidth: {
    width: '100%',
  },
  text: {
    fontWeight: '600',
  },
  iconLeft: {
    marginRight: spacing.xs,
  },
  iconRight: {
    marginLeft: spacing.xs,
  },
  disabled: {
    opacity: 0.6,
  },
  disabledText: {
    color: '#666666',
  },
});

export default MobileButton;
