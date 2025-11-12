import { useCallback, useEffect, useState } from 'react';
import Orientation from 'react-native-orientation-locker';
import { StatusBar } from 'react-native';

/**
 * Custom hook for managing fullscreen mode
 */
export const useFullscreen = (onFullscreenChange?: (isFullscreen: boolean) => void) => {
  const [isFullscreen, setIsFullscreen] = useState(false);

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
