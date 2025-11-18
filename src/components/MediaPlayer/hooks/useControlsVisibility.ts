import { useCallback, useEffect, useRef, useState } from 'react';

const AUTO_HIDE_DELAY = 3000; // 3 seconds

/**
 * Custom hook for managing controls visibility with auto-hide
 */
export const useControlsVisibility = (isPlaying: boolean, isSeeking?: boolean) => {
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    
    // Clear existing timer
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const hideControls = useCallback(() => {
    setControlsVisible(false);
  }, []);

  const toggleControls = useCallback(() => {
    setControlsVisible(prev => !prev);
  }, []);

  // Auto-hide controls when playing and not seeking
  useEffect(() => {
    if (controlsVisible && isPlaying && !isSeeking) {
      hideTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, AUTO_HIDE_DELAY);
    }

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [controlsVisible, isPlaying, isSeeking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  return {
    controlsVisible,
    showControls,
    hideControls,
    toggleControls,
  };
};
