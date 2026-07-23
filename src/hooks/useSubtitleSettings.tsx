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

const STORAGE_KEY = 'flick.subtitleSettings';

/**
 * `'component'`: subtitles are searched for on Wyzie by TMDB id, downloaded,
 * parsed, and drawn by our own `SubtitleOverlay` — this works the same way
 * regardless of what a given scraped stream actually contains.
 *
 * `'native'`: subtitles are handled entirely by `expo-video` via
 * `player.subtitleTrack` / `player.availableSubtitleTracks` (see the
 * `SubtitleTrack` type). This only shows anything when the stream itself
 * embeds subtitle tracks (for example an HLS rendition with
 * `TYPE=SUBTITLES`) — most scraped movie/TV embeds don't include any, so
 * this is best thought of as "prefer the device/stream's own captions when
 * present" rather than a guaranteed alternative.
 */
export type SubtitleRenderMode = 'component' | 'native';

export interface SubtitleSettings {
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  bold: boolean;
  /** ISO 639-1 code for the preferred subtitle language. `''` = None. */
  defaultLanguage: string;
  /** Which engine renders subtitles during playback. @default 'component' */
  renderMode: SubtitleRenderMode;
}

export const DEFAULT_SUBTITLE_SETTINGS: SubtitleSettings = {
  fontSize: 18,
  textColor: '#FFFFFF',
  backgroundColor: '#000000',
  backgroundOpacity: 0.6,
  bold: false,
  defaultLanguage: 'en',
  renderMode: 'component',
};

interface SubtitleSettingsContextValue {
  settings: SubtitleSettings;
  update: (patch: Partial<SubtitleSettings>) => void;
  reset: () => void;
}

const SubtitleSettingsContext = createContext<SubtitleSettingsContextValue>({
  settings: DEFAULT_SUBTITLE_SETTINGS,
  update: () => {},
  reset: () => {},
});

export const SubtitleSettingsProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [settings, setSettings] = useState<SubtitleSettings>(
    DEFAULT_SUBTITLE_SETTINGS,
  );

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as Partial<SubtitleSettings>;
        setSettings({ ...DEFAULT_SUBTITLE_SETTINGS, ...parsed });
      })
      .catch(() => {});
  }, []);

  const persist = useCallback((next: SubtitleSettings) => {
    setSettings(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const update = useCallback(
    (patch: Partial<SubtitleSettings>) => {
      persist({ ...settings, ...patch });
    },
    [persist, settings],
  );

  const reset = useCallback(() => {
    persist(DEFAULT_SUBTITLE_SETTINGS);
  }, [persist]);

  const value = useMemo(
    () => ({ settings, update, reset }),
    [settings, update, reset],
  );

  return (
    <SubtitleSettingsContext.Provider value={value}>
      {children}
    </SubtitleSettingsContext.Provider>
  );
};

export const useSubtitleSettings = () => useContext(SubtitleSettingsContext);
