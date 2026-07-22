import { Platform } from 'react-native';

/** True when running on an Android TV / tvOS leanback device. */
export const isTV = Platform.isTV === true;

export const TV_FOCUS_SCALE = 1.08;

/**
 * TV remote event types surfaced by RN's TVEventHandler / useTVEventHandler.
 */
export type TVRemoteEvent =
  | 'select'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'playPause'
  | 'play'
  | 'pause'
  | 'rewind'
  | 'fastForward'
  | 'menu';
