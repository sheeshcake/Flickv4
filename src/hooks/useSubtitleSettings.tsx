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

export interface SubtitleSettings {
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  bold: boolean;
  /** ISO 639-1 code for the preferred subtitle language. `''` = None. */
  defaultLanguage: string;
}

export const DEFAULT_SUBTITLE_SETTINGS: SubtitleSettings = {
  fontSize: 18,
  textColor: '#FFFFFF',
  backgroundColor: '#000000',
  backgroundOpacity: 0.6,
  bold: false,
  defaultLanguage: 'en',
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
