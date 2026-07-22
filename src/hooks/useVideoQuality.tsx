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
import type { Variant } from '@/src/utils/hlsVariants';

const STORAGE_KEY = 'flick.videoQuality';

/**
 * Fixed quality tiers exposed in Settings. Actual playback variants come from
 * the HLS master playlist and vary per stream; `pickInitial` maps a tier to
 * the closest available variant.
 */
export type QualityPreference =
  | 'auto'
  | '1080p'
  | '720p'
  | '480p'
  | '360p';

export const QUALITY_PREFERENCES: {
  value: QualityPreference;
  label: string;
  targetHeight: number | null;
}[] = [
  { value: 'auto', label: 'Auto', targetHeight: null },
  { value: '1080p', label: '1080p', targetHeight: 1080 },
  { value: '720p', label: '720p', targetHeight: 720 },
  { value: '480p', label: '480p', targetHeight: 480 },
  { value: '360p', label: '360p', targetHeight: 360 },
];

const DEFAULT_PREFERENCE: QualityPreference = 'auto';

interface VideoQualityContextValue {
  preference: QualityPreference;
  setPreference: (next: QualityPreference) => void;
  /**
   * Pick the closest variant to the current preference. Returns `null` for
   * `auto` (or when the list is empty) so the caller keeps the original
   * master playlist URI (ABR).
   */
  pickInitial: (variants: Variant[]) => Variant | null;
}

const VideoQualityContext = createContext<VideoQualityContextValue>({
  preference: DEFAULT_PREFERENCE,
  setPreference: () => {},
  pickInitial: () => null,
});

const targetHeightFor = (pref: QualityPreference): number | null =>
  QUALITY_PREFERENCES.find((p) => p.value === pref)?.targetHeight ?? null;

/**
 * Closest variant whose height is `<= target`. Falls back to the lowest
 * available variant when nothing fits (e.g. target = 1080 but the highest
 * variant is 720).
 */
const closestVariant = (
  variants: Variant[],
  targetHeight: number,
): Variant | null => {
  if (!variants.length) return null;
  const sorted = [...variants].sort((a, b) => b.height - a.height); // tallest -> shortest
  const capped = sorted.find((v) => v.height <= targetHeight);
  return capped ?? sorted[sorted.length - 1] ?? null;
};

export const VideoQualityProvider = ({ children }: { children: ReactNode }) => {
  const [preference, setPref] = useState<QualityPreference>(DEFAULT_PREFERENCE);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const isKnown = QUALITY_PREFERENCES.some((p) => p.value === raw);
        if (isKnown) setPref(raw as QualityPreference);
      })
      .catch(() => {});
  }, []);

  const setPreference = useCallback((next: QualityPreference) => {
    setPref(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const pickInitial = useCallback(
    (variants: Variant[]): Variant | null => {
      if (!variants.length) return null;
      const target = targetHeightFor(preference);
      if (target == null) return null; // 'auto' -> keep master ABR
      return closestVariant(variants, target);
    },
    [preference],
  );

  const value = useMemo(
    () => ({ preference, setPreference, pickInitial }),
    [preference, setPreference, pickInitial],
  );

  return (
    <VideoQualityContext.Provider value={value}>
      {children}
    </VideoQualityContext.Provider>
  );
};

export const useVideoQuality = () => useContext(VideoQualityContext);

export const getQualityLabel = (pref: QualityPreference): string =>
  QUALITY_PREFERENCES.find((p) => p.value === pref)?.label ?? 'Auto';
