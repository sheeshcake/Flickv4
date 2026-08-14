import { useCallback, useEffect, useRef, useState } from 'react';

const HIDE_DELAY = 5000;

/** Auto-hide player chrome after idle while playing; stay up when `hold`. */
export const useOverlayVisibility = (playing: boolean, hold: boolean) => {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const scheduleHide = useCallback(() => {
    clear();
    if (playing && !hold) {
      timer.current = setTimeout(() => setVisible(false), HIDE_DELAY);
    }
  }, [clear, playing, hold]);

  const show = useCallback(() => {
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  const toggle = useCallback(() => {
    if (!playing || hold) {
      setVisible(true);
      return;
    }
    setVisible((v) => {
      const next = !v;
      if (next) scheduleHide();
      else clear();
      return next;
    });
  }, [playing, hold, scheduleHide, clear]);

  useEffect(() => {
    if (hold || !playing) {
      setVisible(true);
      clear();
      return;
    }
    scheduleHide();
    return clear;
  }, [hold, playing, scheduleHide, clear]);

  return { visible, show, toggle };
};
