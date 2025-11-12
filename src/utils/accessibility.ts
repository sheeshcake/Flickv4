import {AccessibilityInfo} from 'react-native';

// Accessibility labels and hints
export const accessibilityLabels = {
  // Navigation
  homeTab: 'Home tab',
  searchTab: 'Search tab',
  settingsTab: 'Settings tab',

  // Content
  movieCard: (title: string) => `Movie: ${title}`,
  tvShowCard: (title: string) => `TV Show: ${title}`,
  contentRating: (rating: number) => `Rating: ${rating} out of 10`,

  // Actions
  playButton: 'Play video',
  pauseButton: 'Pause video',
  likeButton: 'Like this content',
  unlikeButton: 'Unlike this content',
  closeButton: 'Close',
  backButton: 'Go back',

  // Search
  searchInput: 'Search for movies and TV shows',
  clearSearch: 'Clear search',

  // Settings
  themeToggle: 'Toggle theme',
  clearCache: 'Clear cache',

  // Video player
  videoPlayer: 'Video player',
  videoProgress: (current: number, total: number) =>
    `Video progress: ${Math.round(current)} of ${Math.round(total)} seconds`,
};

export const accessibilityHints = {
  // Navigation
  homeTab: 'Navigate to home screen',
  searchTab: 'Navigate to search screen',
  settingsTab: 'Navigate to settings screen',

  // Content
  contentCard: 'Double tap to view details',
  continueWatching: 'Double tap to resume watching',

  // Actions
  playButton: 'Double tap to play video',
  likeButton: 'Double tap to add to favorites',

  // Search
  searchInput: 'Type to search for content',

  // Settings
  themeToggle: 'Double tap to switch between light and dark theme',
};

// Accessibility roles
export const accessibilityRoles = {
  button: 'button' as const,
  text: 'text' as const,
  image: 'image' as const,
  header: 'header' as const,
  search: 'search' as const,
  tab: 'tab' as const,
  tablist: 'tablist' as const,
  adjustable: 'adjustable' as const,
  link: 'link' as const,
  none: 'none' as const,
};

// Accessibility states
export const getAccessibilityState = (options: {
  selected?: boolean;
  disabled?: boolean;
  checked?: boolean;
  expanded?: boolean;
  busy?: boolean;
}) => {
  const state: any = {};

  if (options.selected !== undefined) {
    state.selected = options.selected;
  }

  if (options.disabled !== undefined) {
    state.disabled = options.disabled;
  }

  if (options.checked !== undefined) {
    state.checked = options.checked;
  }

  if (options.expanded !== undefined) {
    state.expanded = options.expanded;
  }

  if (options.busy !== undefined) {
    state.busy = options.busy;
  }

  return state;
};

// Screen reader utilities
export const announceForAccessibility = (message: string) => {
  AccessibilityInfo.announceForAccessibility(message);
};

export const setAccessibilityFocus = (reactTag: number) => {
  AccessibilityInfo.setAccessibilityFocus(reactTag);
};

// Check if screen reader is enabled
export const isScreenReaderEnabled = async (): Promise<boolean> => {
  try {
    return await AccessibilityInfo.isScreenReaderEnabled();
  } catch (error) {
    console.warn('Failed to check screen reader status:', error);
    return false;
  }
};

// Check if reduce motion is enabled
export const isReduceMotionEnabled = async (): Promise<boolean> => {
  try {
    return await AccessibilityInfo.isReduceMotionEnabled();
  } catch (error) {
    console.warn('Failed to check reduce motion status:', error);
    return false;
  }
};

// Accessibility value helpers
export const getProgressValue = (current: number, total: number) => ({
  min: 0,
  max: total,
  now: current,
  text: `${Math.round((current / total) * 100)}%`,
});

export const getRatingValue = (rating: number) => ({
  min: 0,
  max: 10,
  now: rating,
  text: `${rating.toFixed(1)} out of 10`,
});

// Content description helpers
export const getContentDescription = (item: any) => {
  const title = item.title || item.name;
  const year = item.release_date || item.first_air_date;
  const rating = item.vote_average;

  let description = title;

  if (year) {
    const yearOnly = new Date(year).getFullYear();
    description += `, ${yearOnly}`;
  }

  if (rating > 0) {
    description += `, rated ${rating.toFixed(1)} out of 10`;
  }

  return description;
};

// Video player accessibility
export const getVideoPlayerAccessibility = (
  isPlaying: boolean,
  currentTime: number,
  duration: number,
) => ({
  label: accessibilityLabels.videoPlayer,
  hint: isPlaying ? accessibilityHints.playButton : 'Double tap to pause video',
  value: accessibilityLabels.videoProgress(currentTime, duration),
  role: accessibilityRoles.adjustable,
  state: getAccessibilityState({busy: false}),
});
