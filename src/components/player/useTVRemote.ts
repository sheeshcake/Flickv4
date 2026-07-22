import { useEffect } from 'react';
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
 */
export const useTVRemote = (handlers: TVRemoteHandlers) => {
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
      switch (evt.eventType) {
        case 'select':
          handlers.onSelect?.();
          break;
        case 'left':
          handlers.onLeft?.();
          break;
        case 'right':
          handlers.onRight?.();
          break;
        case 'up':
          handlers.onUp?.();
          break;
        case 'down':
          handlers.onDown?.();
          break;
        case 'playPause':
          handlers.onPlayPause?.();
          break;
      }
    });
    return () => tvEventHandler.disable();
  }, [handlers]);
};

export const formatTime = (seconds: number): string => {
  if (!seconds || Number.isNaN(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};
