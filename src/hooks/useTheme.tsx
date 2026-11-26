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

export type ThemeMode = 'dark' | 'light' | 'system';
export type ThemePalette = 'classic' | 'coffee';

export interface ThemeSettingsValue {
  mode: ThemeMode;
  setMode: (next: ThemeMode) => void;
  palette: ThemePalette;
  setPalette: (next: ThemePalette) => void;
  loaded: boolean;
}

const STORAGE_KEY = 'coffehouse.theme';

const ThemeContext = createContext<ThemeSettingsValue>({
  mode: 'dark',
  setMode: () => {},
  palette: 'coffee',
  setPalette: () => {},
  loaded: false,
});

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [palette, setPaletteState] = useState<ThemePalette>('coffee');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.mode) setModeState(parsed.mode);
          if (parsed?.palette) setPaletteState(parsed.palette);
        }
      } catch {
        // ignore
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = useCallback((m: ThemeMode, p: ThemePalette) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: m, palette: p })).catch(
      () => {},
    );
  }, []);

  const setMode = useCallback(
    (next: ThemeMode) => {
      setModeState(next);
      persist(next, palette);
    },
    [palette, persist],
  );

  const setPalette = useCallback(
    (next: ThemePalette) => {
      setPaletteState(next);
      persist(mode, next);
    },
    [mode, persist],
  );

  const value = useMemo(
    () => ({ mode, setMode, palette, setPalette, loaded }),
    [mode, setMode, palette, setPalette, loaded],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);