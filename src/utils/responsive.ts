import { Dimensions, PixelRatio, ScaledSize } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Tablet detection based on physical pixel dimensions and logical size.
 * Mirrors common RN heuristics so layouts can widen on larger screens.
 */
export const isTablet = (
  width: number = SCREEN_WIDTH,
  height: number = SCREEN_HEIGHT,
): boolean => {
  const pixelDensity = PixelRatio.get();
  const adjustedWidth = width * pixelDensity;
  const adjustedHeight = height * pixelDensity;
  return (
    adjustedWidth >= 1000 ||
    adjustedHeight >= 1000 ||
    (Math.min(width, height) >= 600 && Math.max(width, height) >= 900)
  );
};

export type DeviceKind = 'phone' | 'tablet' | 'tv';

export const getDeviceKind = (
  size: Pick<ScaledSize, 'width' | 'height'>,
  tv: boolean,
): DeviceKind => {
  if (tv) return 'tv';
  return isTablet(size.width, size.height) ? 'tablet' : 'phone';
};

/** Number of poster columns to render in a grid for the given device. */
export const getGridColumns = (kind: DeviceKind): number => {
  switch (kind) {
    case 'tv':
      return 6;
    case 'tablet':
      return 4;
    default:
      return 3;
  }
};

/** Poster card width (px) for horizontal rows. */
export const getCardWidth = (kind: DeviceKind, screenWidth: number): number => {
  switch (kind) {
    case 'tv':
      return 200;
    case 'tablet':
      return screenWidth * 0.24;
    default:
      return screenWidth * 0.36;
  }
};

export const POSTER_ASPECT_RATIO = 1.5; // height / width for TMDB posters

/** Poster card width (px) for ranked Top 10 rows — slightly larger than standard. */
export const getTopTenCardWidth = (
  kind: DeviceKind,
  screenWidth: number,
): number => Math.round(getCardWidth(kind, screenWidth) * 1.15);

export const getHorizontalPadding = (kind: DeviceKind): number => {
  switch (kind) {
    case 'tv':
      return 48;
    case 'tablet':
      return 16;
    default:
      return 16;
  }
};
