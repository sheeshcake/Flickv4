import { useCallback, useEffect, useState } from 'react';
import Orientation from 'react-native-orientation-locker';
import { StatusBar, InteractionManager } from 'react-native';

export const useFullscreen = (
  onFullscreenChange?: (isFullscreen: boolean) => void,
  initialFullscreen: boolean = false
) => {
  const [isFullscreen, setIsFullscreen] = useState(initialFullscreen);

  useEffect(() => {
    if (initialFullscreen) {
      Orientation.lockToLandscape();
      StatusBar.setHidden(true, 'fade');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFullscreen = useCallback(() => {
    const newState = !isFullscreen;
    
    if (newState) {
      Orientation.lockToLandscape();
      StatusBar.setHidden(true, 'fade');
    } else {
      StatusBar.setHidden(false, 'fade');
      InteractionManager.runAfterInteractions(() => {
        Orientation.lockToPortrait();
        setTimeout(() => {
          Orientation.unlockAllOrientations();
        }, 300);
      });
    }
    
    setIsFullscreen(newState);
    onFullscreenChange?.(newState);
  }, [isFullscreen, onFullscreenChange]);

  useEffect(() => {
    return () => {
      if (isFullscreen) {
        StatusBar.setHidden(false, 'fade');
        Orientation.lockToPortrait();
        setTimeout(() => {
          Orientation.unlockAllOrientations();
        }, 300);
      }
    };
  }, [isFullscreen]);

  return { isFullscreen, toggleFullscreen };
};
