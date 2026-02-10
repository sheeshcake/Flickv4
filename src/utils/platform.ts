/**
 * Platform Detection Utilities
 * Provides comprehensive platform detection for TV and Mobile devices
 */

import { Platform, Dimensions, PixelRatio } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Platform Detection
export const isTV = Platform.isTV === true;
export const isAndroidTV = Platform.OS === 'android' && Platform.isTV === true;
export const isAppleTV = Platform.OS === 'ios' && Platform.isTV === true;
export const isMobile = !Platform.isTV;
export const isAndroid = Platform.OS === 'android' && !Platform.isTV;
export const isIOS = Platform.OS === 'ios' && !Platform.isTV;

// Device Size Detection
export const isTablet = (): boolean => {
  const pixelDensity = PixelRatio.get();
  const adjustedWidth = SCREEN_WIDTH * pixelDensity;
  const adjustedHeight = SCREEN_HEIGHT * pixelDensity;

  return (
    adjustedWidth >= 1000 ||
    adjustedHeight >= 1000 ||
    (SCREEN_WIDTH >= 768 && SCREEN_HEIGHT >= 1024)
  );
};

// Platform Type Enum
export enum PlatformType {
  MOBILE_ANDROID = 'mobile_android',
  MOBILE_IOS = 'mobile_ios',
  TABLET_ANDROID = 'tablet_android',
  TABLET_IOS = 'tablet_ios',
  ANDROID_TV = 'android_tv',
  APPLE_TV = 'apple_tv',
}

// Get Current Platform Type
export const getPlatformType = (): PlatformType => {
  if (isAndroidTV) return PlatformType.ANDROID_TV;
  if (isAppleTV) return PlatformType.APPLE_TV;
  if (Platform.OS === 'android' && isTablet()) return PlatformType.TABLET_ANDROID;
  if (Platform.OS === 'ios' && isTablet()) return PlatformType.TABLET_IOS;
  if (Platform.OS === 'android') return PlatformType.MOBILE_ANDROID;
  return PlatformType.MOBILE_IOS;
};

// UI Category (simplified for component selection)
export enum UICategory {
  TV = 'tv',
  MOBILE = 'mobile',
}

export const getUICategory = (): UICategory => {
  return isTV ? UICategory.TV : UICategory.MOBILE;
};

// Platform-specific configuration
export const platformConfig = {
  // Focus management
  focusEnabled: isTV,
  
  // Animation durations (TV uses longer for better visibility)
  animationDuration: isTV ? 300 : 200,
  
  // Touch vs Remote
  inputMethod: isTV ? 'remote' : 'touch',
  
  // Default card sizes
  defaultCardSize: isTV ? 'large' : 'medium',
  
  // Navigation style
  navigationStyle: isTV ? 'focus-based' : 'touch-based',
  
  // Content density
  contentDensity: isTV ? 'sparse' : 'dense',
  
  // Minimum touch target size
  minTouchTarget: isTV ? 48 : 44,
};

// Screen dimensions for different platforms
export const screenDimensions = {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  aspectRatio: SCREEN_WIDTH / SCREEN_HEIGHT,
  isLandscape: SCREEN_WIDTH > SCREEN_HEIGHT,
  isPortrait: SCREEN_HEIGHT > SCREEN_WIDTH,
};

// Export combined platform info
export const platformInfo = {
  isTV,
  isAndroidTV,
  isAppleTV,
  isMobile,
  isAndroid,
  isIOS,
  isTablet: isTablet(),
  platformType: getPlatformType(),
  uiCategory: getUICategory(),
  config: platformConfig,
  screen: screenDimensions,
};

export default platformInfo;
