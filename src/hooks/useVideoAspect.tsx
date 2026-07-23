import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EnumValues, ResizeMode as VideoResizeMode } from 'react-native-video';

const STORAGE_KEY = 'flick.videoAspect';

/**
 * App-level aspect abstraction (kept simple/stable for Settings UI), mapped
 * to react-native-video's `resizeMode` at the `<Video>` call site via
 * `toResizeMode` below:
 *
 * - `contain` (default) - keep aspect ratio, letterbox as needed.
 * - `cover` - keep aspect ratio, crop to fill the screen.
 * - `fill` - stretch to fill the screen (may distort).
 */
export type VideoAspect = 'contain' | 'cover' | 'fill';

/** Maps our `VideoAspect` to react-native-video's `resizeMode` prop values
 * (`'none' | 'contain' | 'cover' | 'stretch'`) — RNV has no `fill`, its
 * equivalent non-uniform-scale mode is `stretch`. */
export const toResizeMode = (aspect: VideoAspect): EnumValues<VideoResizeMode> =>
  aspect === 'fill' ? 'stretch' : aspect;

export interface VideoAspectOption {
  value: VideoAspect;
  label: string;
  hint: string;
}

export const VIDEO_ASPECT_OPTIONS: VideoAspectOption[] = [
  {
    value: 'contain',
    label: 'Contain',
    hint: 'Fit inside, keep aspect ratio',
  },
  {
    value: 'cover',
    label: 'Cover',
    hint: 'Fill screen, crop edges',
  },
  {
    value: 'fill',
    label: 'Fill',
    hint: 'Stretch to fill, may distort',
  },
];

const DEFAULT_ASPECT: VideoAspect = 'contain';

interface VideoAspectContextValue {
  aspect: VideoAspect;
  setAspect: (next: VideoAspect) => void;
}

const VideoAspectContext = createContext<VideoAspectContextValue>({
  aspect: DEFAULT_ASPECT,
  setAspect: () => {},
});

const isKnownAspect = (v: string): v is VideoAspect =>
  VIDEO_ASPECT_OPTIONS.some((o) => o.value === v);

export const VideoAspectProvider = ({ children }: { children: ReactNode }) => {
  const [aspect, setState] = useState<VideoAspect>(DEFAULT_ASPECT);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw && isKnownAspect(raw)) setState(raw);
      })
      .catch(() => {});
  }, []);

  const setAspect = useCallback((next: VideoAspect) => {
    setState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo(() => ({ aspect, setAspect }), [aspect, setAspect]);

  return (
    <VideoAspectContext.Provider value={value}>
      {children}
    </VideoAspectContext.Provider>
  );
};

export const useVideoAspect = () => useContext(VideoAspectContext);

export const getAspectLabel = (a: VideoAspect): string =>
  VIDEO_ASPECT_OPTIONS.find((o) => o.value === a)?.label ?? 'Contain';
