/**
 * TV Platform Utilities
 * Provides utilities for detecting and handling Android TV specific features
 */

import {Platform} from 'react-native';

// Detect if running on Android TV
export const isTV = Platform.isTV === true;
export const isAndroidTV = Platform.OS === 'android' && Platform.isTV === true;

// TV Event types for remote control
export type TVRemoteEventType =
  | 'select'
  | 'longSelect'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'playPause'
  | 'play'
  | 'pause'
  | 'rewind'
  | 'fastForward'
  | 'menu'
  | 'back';

// TV Focus scale for focused items
export const TV_FOCUS_SCALE = 1.08;
export const TV_FOCUS_BORDER_WIDTH = 3;
export const TV_FOCUS_BORDER_COLOR = '#E50914'; // Netflix red

// TV specific dimensions
export const TV_CARD_DIMENSIONS = {
  small: {width: 150, height: 225},
  medium: {width: 180, height: 270},
  large: {width: 220, height: 330},
};

// TV navigation constants
export const TV_HORIZONTAL_SCROLL_OFFSET = 200;

/**
 * Get next focus direction props for a grid item
 */
export const getGridFocusProps = (
  index: number,
  totalItems: number,
  columns: number = 1,
) => {
  if (!isTV) return {};

  const row = Math.floor(index / columns);
  const col = index % columns;
  const totalRows = Math.ceil(totalItems / columns);

  return {
    nextFocusLeft: col === 0 ? undefined : index - 1,
    nextFocusRight: col === columns - 1 || index === totalItems - 1 ? undefined : index + 1,
    nextFocusUp: row === 0 ? undefined : index - columns,
    nextFocusDown: row === totalRows - 1 ? undefined : index + columns,
  };
};

/**
 * Default TV focus style
 */
export const tvFocusStyle = {
  transform: [{scale: TV_FOCUS_SCALE}],
  borderWidth: TV_FOCUS_BORDER_WIDTH,
  borderColor: TV_FOCUS_BORDER_COLOR,
  zIndex: 10,
};

/**
 * Get TV-aware card dimensions
 */
export const getTVCardDimensions = (size: 'small' | 'medium' | 'large' = 'medium') => {
  if (isTV) {
    return TV_CARD_DIMENSIONS[size];
  }
  return null; // Use default mobile dimensions
};
