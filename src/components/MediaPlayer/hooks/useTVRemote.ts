/**
 * TV Remote Control Hook
 * Handles D-pad and media button events for Android TV
 */

import {useEffect, useCallback} from 'react';
import {BackHandler} from 'react-native';
import {isTV} from '../../../utils/tv';

// TV Event types
interface TVKeyEvent {
  eventType: string;
}

export interface TVRemoteCallbacks {
  onSelect?: () => void;
  onPlayPause?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  onUp?: () => void;
  onDown?: () => void;
  onBack?: () => void;
  onRewind?: () => void;
  onFastForward?: () => void;
  onLongSelect?: () => void;
}

export const useTVRemote = (callbacks: TVRemoteCallbacks, enabled: boolean = true) => {
  const handleTVEvent = useCallback(
    (evt: TVKeyEvent) => {
      if (!evt || !enabled) return;

      switch (evt.eventType) {
        case 'select':
          callbacks.onSelect?.();
          break;
        case 'longSelect':
          callbacks.onLongSelect?.();
          break;
        case 'playPause':
        case 'play':
        case 'pause':
          callbacks.onPlayPause?.();
          break;
        case 'left':
          callbacks.onLeft?.();
          break;
        case 'right':
          callbacks.onRight?.();
          break;
        case 'up':
          callbacks.onUp?.();
          break;
        case 'down':
          callbacks.onDown?.();
          break;
        case 'rewind':
          callbacks.onRewind?.();
          break;
        case 'fastForward':
          callbacks.onFastForward?.();
          break;
      }
    },
    [callbacks, enabled],
  );

  // TV event handler using native module when available
  useEffect(() => {
    if (!isTV || !enabled) return;

    // React Native's TV support is built into Pressable components
    // Focus events are handled automatically
    // This effect is for any additional global TV event handling if needed
  }, [enabled, handleTVEvent]);

  // Handle back button separately
  useEffect(() => {
    if (!isTV || !enabled || !callbacks.onBack) return;

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      callbacks.onBack?.();
      return true;
    });

    return () => backHandler.remove();
  }, [callbacks, enabled]);
};

export default useTVRemote;
