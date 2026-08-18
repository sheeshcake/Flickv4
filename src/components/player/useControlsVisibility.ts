import { useCallback, useEffect, useRef, useState } from 'react';

const HIDE_DELAY = 5000;

/**
 * Auto-hiding control visibility. Controls reveal on interaction and hide
 * again after `HIDE_DELAY` ms of inactivity while the video is playing.
 * Pass `hold` while a drawer/sheet (chat, settings, episodes, party) is
 * open so the overlay stays up and a hidden-state Pressable cannot steal
 * TextInput focus.
 */
export const useControlsVisibility = (playing: boolean, hold: boolean) => {
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
