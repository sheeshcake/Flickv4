import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'flick.subtitleSettings';

export interface SubtitleSettings {
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  bold: boolean;
  textShadow: boolean;
  defaultLanguage: string;
}

export const DEFAULT_SUBTITLE_SETTINGS: SubtitleSettings = {
  fontSize: 18,
  textColor: '#FFFFFF',
  backgroundColor: '#000000',
  backgroundOpacity: 0.6,
  bold: false,
  textShadow: true,
  defaultLanguage: 'en',
};

const readStored = (): SubtitleSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SUBTITLE_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<SubtitleSettings>;
    return { ...DEFAULT_SUBTITLE_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SUBTITLE_SETTINGS;
  }
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

export const SubtitleSettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<SubtitleSettings>(readStored);

  const persist = useCallback((next: SubtitleSettings) => {
    setSettings(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota / private mode
    }
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
    [reset, settings, update],
  );

  return (
    <SubtitleSettingsContext.Provider value={value}>
      {children}
    </SubtitleSettingsContext.Provider>
  );
};

export const useSubtitleSettings = () => useContext(SubtitleSettingsContext);
