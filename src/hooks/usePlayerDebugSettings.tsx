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

const STORAGE_KEY = 'flick.playerDebug';

interface PlayerDebugSettingsContextValue {
  /**
   * When enabled, `PlayerScreen` renders its stream-resolving
   * `WebViewScraper` full-screen and interactive (instead of invisible)
   * so you can watch exactly what the embed page is doing while a stream
   * is being resolved — useful when a server fails to play. Replaces what
   * used to be a hardcoded `DEBUG_SCRAPER` constant in `PlayerScreen.tsx`.
   */
  scraperDebugEnabled: boolean;
  setScraperDebugEnabled: (next: boolean) => void;
}

const PlayerDebugSettingsContext =
  createContext<PlayerDebugSettingsContextValue>({
    scraperDebugEnabled: false,
    setScraperDebugEnabled: () => {},
  });

export const PlayerDebugSettingsProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [scraperDebugEnabled, setScraperDebugEnabledState] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw != null) setScraperDebugEnabledState(raw === 'true');
      })
      .catch(() => {});
  }, []);

  const setScraperDebugEnabled = useCallback((next: boolean) => {
    setScraperDebugEnabledState(next);
    AsyncStorage.setItem(STORAGE_KEY, String(next)).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ scraperDebugEnabled, setScraperDebugEnabled }),
    [scraperDebugEnabled, setScraperDebugEnabled],
  );

  return (
    <PlayerDebugSettingsContext.Provider value={value}>
      {children}
    </PlayerDebugSettingsContext.Provider>
  );
};

export const usePlayerDebugSettings = () =>
  useContext(PlayerDebugSettingsContext);
