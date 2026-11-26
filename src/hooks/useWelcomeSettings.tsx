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

const STORAGE_KEY = 'flick.welcomeScreen';
export const DEFAULT_WELCOME_MODE: WelcomeMode = 'quick';

export type WelcomeMode = 'off' | 'quick';

export interface WelcomeOption {
  value: WelcomeMode;
  label: string;
  hint: string;
}

export const WELCOME_OPTIONS: WelcomeOption[] = [
  {
    value: 'quick',
    label: 'Quick welcome',
    hint: 'Show the coffee splash briefly, then fade straight into the app.',
  },
  {
    value: 'off',
    label: 'No welcome',
    hint: 'Skip the splash entirely and open the home screen immediately.',
  },
];

interface WelcomeSettingsContextValue {
  mode: WelcomeMode;
  /** False only for the few milliseconds while AsyncStorage hydrates. */
  ready: boolean;
  setMode: (next: WelcomeMode) => void;
}

const isWelcomeMode = (value: string | null): value is WelcomeMode =>
  value === 'off' || value === 'quick';

const WelcomeSettingsContext = createContext<WelcomeSettingsContextValue>({
  mode: DEFAULT_WELCOME_MODE,
  ready: false,
  setMode: () => {},
});

export const WelcomeSettingsProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setModeState] = useState<WelcomeMode>(DEFAULT_WELCOME_MODE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!active) return;
        if (isWelcomeMode(raw)) setModeState(raw);
        setReady(true);
      })
      .catch(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((next: WelcomeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ mode, ready, setMode }),
    [mode, ready, setMode],
  );

  return (
    <WelcomeSettingsContext.Provider value={value}>
      {children}
    </WelcomeSettingsContext.Provider>
  );
};

export const useWelcomeSettings = () => useContext(WelcomeSettingsContext);

export const getWelcomeLabel = (mode: WelcomeMode): string =>
  WELCOME_OPTIONS.find((option) => option.value === mode)?.label ??
  'Quick welcome';
