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

const STORAGE_KEY = 'flick.catalogRegion';
const DEFAULT_REGION = 'US';

export interface CatalogRegion {
  code: string;
  name: string;
}

/** Curated TMDB watch/popular regions. Codes are ISO 3166-1 alpha-2. */
export const CATALOG_REGIONS: CatalogRegion[] = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'IN', name: 'India' },
  { code: 'PH', name: 'Philippines' },
  { code: 'SG', name: 'Singapore' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'TH', name: 'Thailand' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'AR', name: 'Argentina' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'AE', name: 'United Arab Emirates' },
];

const REGION_CODES = new Set(CATALOG_REGIONS.map((r) => r.code));

export const isCatalogRegion = (code: string | null | undefined): boolean =>
  Boolean(code && REGION_CODES.has(code));

export const getRegionName = (code: string): string =>
  CATALOG_REGIONS.find((r) => r.code === code)?.name ?? code;

export const getRegionLabel = (code: string): string => {
  const name = getRegionName(code);
  return `${name} · ${code}`;
};

/** Best-effort device country from the runtime locale (e.g. en-PH → PH). */
export const detectDeviceRegion = (): string | undefined => {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const parts = locale.split(/[-_]/).map((p) => p.toUpperCase());
    return parts.find((p) => p.length === 2 && isCatalogRegion(p));
  } catch {
    // Intl can throw in stripped runtimes.
  }
  return undefined;
};

interface CatalogRegionContextValue {
  region: string;
  loaded: boolean;
  setRegion: (code: string) => void;
}

const CatalogRegionContext = createContext<CatalogRegionContextValue>({
  region: DEFAULT_REGION,
  loaded: false,
  setRegion: () => {},
});

export const CatalogRegionProvider = ({ children }: { children: ReactNode }) => {
  const [region, setRegionState] = useState(DEFAULT_REGION);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (isCatalogRegion(raw)) {
          setRegionState(raw as string);
          return;
        }
        const device = detectDeviceRegion();
        const next = device ?? DEFAULT_REGION;
        setRegionState(next);
        AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const setRegion = useCallback((code: string) => {
    if (!isCatalogRegion(code)) return;
    setRegionState(code);
    AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ region, loaded, setRegion }),
    [region, loaded, setRegion],
  );

  return (
    <CatalogRegionContext.Provider value={value}>
      {children}
    </CatalogRegionContext.Provider>
  );
};

export const useCatalogRegion = () => useContext(CatalogRegionContext);
