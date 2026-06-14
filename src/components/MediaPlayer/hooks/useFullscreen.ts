import { useCallback, useEffect, useState } from 'react';
import Orientation from 'react-native-orientation-locker';
import { StatusBar, InteractionManager, Platform } from 'react-native';
import SystemNavigationBar from 'react-native-system-navigation-bar';

export const useFullscreen = (
  onFullscreenChange?: (isFullscreen: boolean) => void,
  initialFullscreen: boolean = false
) => {
  const [isFullscreen, setIsFullscreen] = useState(initialFullscreen);

  const setAndroidNavigationBar = useCallback((hidden: boolean) => {
    if (Platform.OS !== 'android') {
      return;
    }

    try {
      if (hidden) {
        SystemNavigationBar.navigationHide();
        SystemNavigationBar.immersive();
      } else {
        SystemNavigationBar.navigationShow();
      }
    } catch {
      // Best-effort UI enhancement; ignore failures on unsupported devices.
    }
  }, []);

  useEffect(() => {
    if (initialFullscreen) {
      Orientation.lockToLandscape();
      StatusBar.setHidden(true, 'fade');
      setAndroidNavigationBar(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFullscreen = useCallback(() => {
    const newState = !isFullscreen;
    
    if (newState) {
      Orientation.lockToLandscape();
      StatusBar.setHidden(true, 'fade');
      setAndroidNavigationBar(true);
    } else {
      StatusBar.setHidden(false, 'fade');
      setAndroidNavigationBar(false);
      InteractionManager.runAfterInteractions(() => {
        Orientation.lockToPortrait();
      });
    }
    
    setIsFullscreen(newState);
    onFullscreenChange?.(newState);
  }, [isFullscreen, onFullscreenChange, setAndroidNavigationBar]);

  useEffect(() => {
    return () => {
      if (isFullscreen) {
        StatusBar.setHidden(false, 'fade');
        setAndroidNavigationBar(false);
        Orientation.lockToPortrait();
      }
    };
  }, [isFullscreen, setAndroidNavigationBar]);

  return { isFullscreen, toggleFullscreen };
};
