/**
 * Mobile Screens - Index
 * Exports all Mobile-specific screen components
 * 
 * Note: The existing screens in the parent directory are primarily mobile-optimized.
 * This folder provides explicit mobile versions if needed for the platform separation.
 */

// Re-export existing screens as mobile versions
// These can be replaced with dedicated mobile implementations if needed
export { HomeScreen as MobileHomeScreen } from '../HomeScreen';
export { SearchScreen as MobileSearchScreen } from '../SearchScreen';
export { SettingsScreen as MobileSettingsScreen } from '../SettingsScreen';
export { default as MobileDetailScreen } from '../DetailScreen';
export { default as MobileDownloadsScreen } from '../DownloadsScreen';
