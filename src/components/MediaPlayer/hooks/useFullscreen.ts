import { useCallback, useEffect, useState } from 'react';
import Orientation from 'react-native-orientation-locker';
import { StatusBar } from 'react-native';

/**
 * Custom hook for managing fullscreen mode
 * @param onFullscreenChange - Callback when fullscreen state changes
 * @param initialFullscreen - Initial fullscreen state (default: false)
 */
export const useFullscreen = (
  onFullscreenChange?: (isFullscreen: boolean) => void,
  initialFullscreen: boolean = false
) => {
  const [isFullscreen, setIsFullscreen] = useState(initialFullscreen);

  // Apply initial fullscreen state on mount
  useEffect(() => {
    if (initialFullscreen) {
      Orientation.lockToLandscape();
      StatusBar.setHidden(true, 'fade');
      console.log('[useFullscreen] Initial fullscreen enabled');
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFullscreen = useCallback(() => {
    const newState = !isFullscreen;
    
    if (newState) {
      Orientation.lockToLandscape();
      StatusBar.setHidden(true, 'fade');
    } else {
      Orientation.lockToPortrait();
      StatusBar.setHidden(false, 'fade');
    }
    
    setIsFullscreen(newState);
    onFullscreenChange?.(newState);
    
    console.log('[useFullscreen] Fullscreen:', newState);
  }, [isFullscreen, onFullscreenChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isFullscreen) {
        Orientation.lockToPortrait();
        StatusBar.setHidden(false, 'fade');
      }
    };
  }, [isFullscreen]);

  return { isFullscreen, toggleFullscreen };
};
