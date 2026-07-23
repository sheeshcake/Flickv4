import { useEffect, useRef } from 'react';
// TV event APIs are only present on tvOS/Android TV builds and are not part of
// the standard react-native type surface, so we access them defensively.
import * as ReactNative from 'react-native';
import { isTV } from '@/src/utils/tv';

interface TVRemoteHandlers {
  onSelect?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  onUp?: () => void;
  onDown?: () => void;
  onPlayPause?: () => void;
}

interface TVEvent {
  eventType: string;
}

interface TVEventHandlerInstance {
  enable: (
    component: unknown,
    callback: (cmp: unknown, evt: TVEvent | undefined) => void,
  ) => void;
  disable: () => void;
}

/**
 * Subscribes to TV remote (D-pad) events. No-op on non-TV platforms.
 *
 * Registers the native `TVEventHandler` listener exactly once (not on every
 * render): callers typically pass a fresh `handlers` object literal each
 * render, and tearing down + re-enabling the native listener that often
 * (e.g. every ~500ms while a video is playing) risks a key press landing in
 * the gap between disable() and the next enable(). A ref keeps the listener
 * itself stable while always invoking the latest handlers.
 */
export const useTVRemote = (handlers: TVRemoteHandlers) => {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!isTV) return;
    const TVEventHandlerCtor = (
      ReactNative as unknown as {
        TVEventHandler?: new () => TVEventHandlerInstance;
      }
    ).TVEventHandler;
    if (!TVEventHandlerCtor) return;

    const tvEventHandler = new TVEventHandlerCtor();
    tvEventHandler.enable(null, (_cmp, evt) => {
      if (!evt) return;
      const current = handlersRef.current;
      switch (evt.eventType) {
        case 'select':
          current.onSelect?.();
          break;
        case 'left':
          current.onLeft?.();
          break;
        case 'right':
          current.onRight?.();
          break;
        case 'up':
          current.onUp?.();
          break;
        case 'down':
          current.onDown?.();
          break;
        case 'playPause':
          current.onPlayPause?.();
          break;
      }
    });
    return () => tvEventHandler.disable();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally
    // mount-once; latest handlers are read via `handlersRef` above.
  }, []);
};

export const formatTime = (seconds: number): string => {
  if (!seconds || Number.isNaN(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};
