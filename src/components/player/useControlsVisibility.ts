import { useCallback, useEffect, useRef, useState } from 'react';

const HIDE_DELAY = 5000;

/**
 * Auto-hiding control visibility. Controls reveal on interaction and hide
 * again after `HIDE_DELAY` ms of inactivity while the video is playing.
 */
export const useControlsVisibility = (playing: boolean) => {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const scheduleHide = useCallback(() => {
    clear();
    if (playing) {
      timer.current = setTimeout(() => setVisible(false), HIDE_DELAY);
    }
  }, [clear, playing]);

  const show = useCallback(() => {
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  const toggle = useCallback(() => {
    setVisible((v) => {
      const next = !v;
      if (next) scheduleHide();
      else clear();
      return next;
    });
  }, [scheduleHide, clear]);

  useEffect(() => {
    scheduleHide();
    return clear;
  }, [scheduleHide, clear]);

  return { visible, show, toggle };
};
