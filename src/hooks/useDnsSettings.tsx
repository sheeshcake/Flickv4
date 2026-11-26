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

export type DnsPreset = 'system' | 'cloudflare' | 'google' | 'quad9';

export interface DnsPresetInfo {
  id: DnsPreset;
  label: string;
  description: string;
  /** Representative DoH endpoint for latency probing. */
  probeUrl: string;
}

export const DNS_PRESETS: DnsPresetInfo[] = [
  {
    id: 'system',
    label: 'System default',
    description: 'Use whatever your network / OS resolves. Best compatibility.',
    probeUrl: 'https://www.google.com/generate_204',
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare (1.1.1.1)',
    description: 'Fast, privacy-focused. Often the quickest on mobile data.',
    probeUrl: 'https://1.1.1.1/cdn-cgi/trace',
  },
  {
    id: 'google',
    label: 'Google (8.8.8.8)',
    description: 'Reliable worldwide, good fallback for restrictive networks.',
    probeUrl: 'https://dns.google/resolve?name=example.com&type=A',
  },
  {
    id: 'quad9',
    label: 'Quad9 (9.9.9.9)',
    description: 'Blocks known malicious domains; slightly heavier.',
    probeUrl: 'https://9.9.9.9:5053/dns-query?name=example.com&type=A',
  },
];

const STORAGE_KEY = 'coffehouse.dns';

interface DnsSettingsValue {
  preset: DnsPreset;
  setPreset: (next: DnsPreset) => void;
  fallbackEnabled: boolean;
  setFallbackEnabled: (next: boolean) => void;
  loaded: boolean;
}

const DnsSettingsContext = createContext<DnsSettingsValue>({
  preset: 'system',
  setPreset: () => {},
  fallbackEnabled: true,
  setFallbackEnabled: () => {},
  loaded: false,
});

export const DnsSettingsProvider = ({ children }: { children: ReactNode }) => {
  const [preset, setPresetState] = useState<DnsPreset>('system');
  const [fallbackEnabled, setFallbackState] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.preset) setPresetState(parsed.preset);
          if (typeof parsed?.fallbackEnabled === 'boolean') {
            setFallbackState(parsed.fallbackEnabled);
          }
        }
      } catch {
        // ignore
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = useCallback(
    (nextPreset: DnsPreset, nextFallback: boolean) => {
      AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ preset: nextPreset, fallbackEnabled: nextFallback }),
      ).catch(() => {});
    },
    [],
  );

  const setPreset = useCallback(
    (next: DnsPreset) => {
      setPresetState(next);
      persist(next, fallbackEnabled);
    },
    [fallbackEnabled, persist],
  );

  const setFallbackEnabled = useCallback(
    (next: boolean) => {
      setFallbackState(next);
      persist(preset, next);
    },
    [preset, persist],
  );

  const value = useMemo(
    () => ({ preset, setPreset, fallbackEnabled, setFallbackEnabled, loaded }),
    [preset, setPreset, fallbackEnabled, setFallbackEnabled, loaded],
  );

  return (
    <DnsSettingsContext.Provider value={value}>
      {children}
    </DnsSettingsContext.Provider>
  );
};

export const useDnsSettings = () => useContext(DnsSettingsContext);

/** Measure round-trip latency to a probe URL. Returns ms or null on failure. */
export const probeLatency = async (url: string): Promise<number | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  const start = Date.now();
  try {
    await fetch(url, { method: 'GET', signal: controller.signal, cache: 'no-store' });
    return Date.now() - start;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};