import {COLORS} from './constants';
import {typography, spacing} from './responsive';

// Theme interface
export interface Theme {
  colors: typeof COLORS;
  typography: typeof typography;
  spacing: typeof spacing;
  borderRadius: {
    small: number;
    medium: number;
    large: number;
  };
  shadows: {
    small: object;
    medium: object;
    large: object;
  };
  opacity: {
    disabled: number;
    overlay: number;
    pressed: number;
  };
}

// Border radius values
const borderRadius = {
  small: spacing.xs,
  medium: spacing.sm,
  large: spacing.md,
};

// Shadow styles
const shadows = {
  small: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
    elevation: 3,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
};

// Opacity values
const opacity = {
  disabled: 0.5,
  overlay: 0.8,
  pressed: 0.7,
};

// Main theme object
export const theme: Theme = {
  colors: COLORS,
  typography,
  spacing,
  borderRadius,
  shadows,
  opacity,
};

// Common component styles
export const commonStyles = {
  // Container styles
  container: {
    flex: 1,
    backgroundColor: theme.colors.NETFLIX_BLACK,
  },

  // Card styles
  card: {
    backgroundColor: theme.colors.NETFLIX_DARK_GRAY,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    ...theme.shadows.small,
  },

  // Button styles
  primaryButton: {
    backgroundColor: theme.colors.NETFLIX_RED,
    borderRadius: theme.borderRadius.medium,
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.NETFLIX_WHITE,
    borderRadius: theme.borderRadius.medium,
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  // Text styles
  primaryButtonText: {
    color: theme.colors.NETFLIX_WHITE,
    fontSize: theme.typography.body,
    fontWeight: '600' as const,
  },

  secondaryButtonText: {
    color: theme.colors.NETFLIX_WHITE,
    fontSize: theme.typography.body,
    fontWeight: '500' as const,
  },

  // Input styles
  textInput: {
    backgroundColor: theme.colors.NETFLIX_DARK_GRAY,
    borderRadius: theme.borderRadius.medium,
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.md,
    color: theme.colors.NETFLIX_WHITE,
    fontSize: theme.typography.body,
    borderWidth: 1,
    borderColor: 'transparent',
  },

  textInputFocused: {
    borderColor: theme.colors.NETFLIX_RED,
  },

  // Loading styles
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.NETFLIX_BLACK,
  },

  // Error styles
  errorContainer: {
    backgroundColor: 'rgba(220, 53, 69, 0.1)',
    borderColor: '#dc3545',
    borderWidth: 1,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    margin: theme.spacing.md,
  },

  errorText: {
    color: '#dc3545',
    fontSize: theme.typography.body,
    textAlign: 'center' as const,
  },

  // Success styles
  successContainer: {
    backgroundColor: 'rgba(40, 167, 69, 0.1)',
    borderColor: '#28a745',
    borderWidth: 1,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    margin: theme.spacing.md,
  },

  successText: {
    color: '#28a745',
    fontSize: theme.typography.body,
    textAlign: 'center' as const,
  },

  // Section styles
  sectionHeader: {
    color: theme.colors.NETFLIX_WHITE,
    fontSize: theme.typography.h5,
    fontWeight: 'bold' as const,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },

  sectionContent: {
    paddingHorizontal: theme.spacing.md,
  },

  // Divider styles
  divider: {
    height: 1,
    backgroundColor: theme.colors.NETFLIX_GRAY,
    marginVertical: theme.spacing.md,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: `rgba(0, 0, 0, ${theme.opacity.overlay})`,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },

  modalContent: {
    backgroundColor: theme.colors.NETFLIX_DARK_GRAY,
    borderRadius: theme.borderRadius.large,
    padding: theme.spacing.lg,
    margin: theme.spacing.lg,
    maxWidth: '90%',
    ...theme.shadows.large,
  },
};

// Utility functions for theme usage
export const getButtonStyle = (
  variant: 'primary' | 'secondary',
  disabled = false,
) => {
  const baseStyle =
    variant === 'primary'
      ? commonStyles.primaryButton
      : commonStyles.secondaryButton;

  return {
    ...baseStyle,
    opacity: disabled ? theme.opacity.disabled : 1,
  };
};

export const getTextStyle = (
  variant:
    | 'h1'
    | 'h2'
    | 'h3'
    | 'h4'
    | 'h5'
    | 'h6'
    | 'body'
    | 'caption'
    | 'small',
) => {
  return {
    color: theme.colors.NETFLIX_WHITE,
    fontSize: theme.typography[variant],
    fontWeight: variant.startsWith('h')
      ? ('bold' as const)
      : ('normal' as const),
  };
};

export const getSpacing = (size: keyof typeof spacing) => {
  return theme.spacing[size];
};
