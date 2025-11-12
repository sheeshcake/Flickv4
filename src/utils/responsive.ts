import {Dimensions, PixelRatio} from 'react-native';

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');

// Base dimensions (iPhone 12 Pro)
const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;

// Device type detection
export const isTablet = () => {
  const pixelDensity = PixelRatio.get();
  const adjustedWidth = SCREEN_WIDTH * pixelDensity;
  const adjustedHeight = SCREEN_HEIGHT * pixelDensity;

  return (
    adjustedWidth >= 1000 ||
    adjustedHeight >= 1000 ||
    (SCREEN_WIDTH >= 768 && SCREEN_HEIGHT >= 1024)
  );
};

export const isSmallDevice = () => {
  return SCREEN_WIDTH < 375 || SCREEN_HEIGHT < 667;
};

export const isLargeDevice = () => {
  return SCREEN_WIDTH > 414 || SCREEN_HEIGHT > 896;
};

// Responsive scaling functions
export const scaleWidth = (size: number): number => {
  return (SCREEN_WIDTH / BASE_WIDTH) * size;
};

export const scaleHeight = (size: number): number => {
  return (SCREEN_HEIGHT / BASE_HEIGHT) * size;
};

export const scaleFont = (size: number): number => {
  const scale = Math.min(
    SCREEN_WIDTH / BASE_WIDTH,
    SCREEN_HEIGHT / BASE_HEIGHT,
  );
  const newSize = size * scale;

  // Ensure minimum readable font size
  return Math.max(newSize, 10);
};

export const moderateScale = (size: number, factor: number = 0.5): number => {
  return size + (scaleWidth(size) - size) * factor;
};

// Responsive spacing
export const spacing = {
  xs: moderateScale(4),
  sm: moderateScale(8),
  md: moderateScale(16),
  lg: moderateScale(24),
  xl: moderateScale(32),
  xxl: moderateScale(48),
};

// Responsive card dimensions
export const getCardDimensions = (size: 'small' | 'medium' | 'large') => {
  const baseWidthRatio = isTablet() ? 0.2 : isSmallDevice() ? 0.28 : 0.25;
  const aspectRatio = 1.5; // Standard movie poster aspect ratio

  switch (size) {
    case 'small':
      const smallWidth = SCREEN_WIDTH * baseWidthRatio;
      return {
        width: smallWidth,
        height: smallWidth * aspectRatio,
      };
    case 'medium':
      const mediumWidth = SCREEN_WIDTH * (baseWidthRatio + 0.05);
      return {
        width: mediumWidth,
        height: mediumWidth * aspectRatio,
      };
    case 'large':
      const largeWidth = SCREEN_WIDTH * (baseWidthRatio + 0.15);
      return {
        width: largeWidth,
        height: largeWidth * aspectRatio,
      };
    default:
      const defaultWidth = SCREEN_WIDTH * (baseWidthRatio + 0.05);
      return {
        width: defaultWidth,
        height: defaultWidth * aspectRatio,
      };
  }
};

// Grid layout calculations
export const getGridItemWidth = (
  columns: number,
  padding: number = 16,
): number => {
  const totalPadding = padding * 2; // Left and right padding
  const itemSpacing = spacing.sm * (columns - 1); // Spacing between items
  return (SCREEN_WIDTH - totalPadding - itemSpacing) / columns;
};

// Safe area calculations
export const getSafeAreaPadding = () => {
  return {
    top: isTablet() ? spacing.lg : spacing.md,
    bottom: isTablet() ? spacing.lg : spacing.md,
    horizontal: isTablet() ? spacing.xl : spacing.md,
  };
};

// Typography scaling
export const typography = {
  h1: scaleFont(32),
  h2: scaleFont(28),
  h3: scaleFont(24),
  h4: scaleFont(20),
  h5: scaleFont(18),
  h6: scaleFont(16),
  body: scaleFont(14),
  caption: scaleFont(12),
  small: scaleFont(10),
};

// Device info
export const deviceInfo = {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  isTablet: isTablet(),
  isSmallDevice: isSmallDevice(),
  isLargeDevice: isLargeDevice(),
  pixelRatio: PixelRatio.get(),
};
