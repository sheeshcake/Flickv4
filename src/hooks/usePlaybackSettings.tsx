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
import * as Device from 'expo-device';
import {
  getRecommendedForwardBufferSeconds,
  MAX_FORWARD_BUFFER_SECONDS,
  MIN_FORWARD_BUFFER_SECONDS,
} from '@/src/utils/deviceRecommendations';

const STORAGE_KEY = 'flick.playbackSettings';
// Sentinel stored instead of a number to mean "follow the recommendation".
const AUTO_SENTINEL = 'auto';

interface PlaybackSettingsContextValue {
  /** Device's total RAM in bytes, from `expo-device`. `null` on web or when unknown. */
  deviceTotalMemory: number | null;
  /** Suggested forward-buffer window (seconds), derived from `deviceTotalMemory`. */
  recommendedForwardBufferSeconds: number;
  /** User override in seconds, or `null` to follow the recommendation ("Auto"). */
  forwardBufferSeconds: number | null;
  /** What the player should actually use: `forwardBufferSeconds ?? recommendedForwardBufferSeconds`. */
  effectiveForwardBufferSeconds: number;
  /** Pass `null` to reset to "Auto" (follow the recommendation). */
  setForwardBufferSeconds: (next: number | null) => void;
}

// `Device.totalMemory` is a plain synchronous constant (not a promise), so it
// can be read once, up front, outside of React state/effects entirely.
const deviceTotalMemory: number | null = Device.totalMemory ?? null;
const recommendedForwardBufferSeconds =
  getRecommendedForwardBufferSeconds(deviceTotalMemory);

const PlaybackSettingsContext = createContext<PlaybackSettingsContextValue>({
  deviceTotalMemory,
  recommendedForwardBufferSeconds,
  forwardBufferSeconds: null,
  effectiveForwardBufferSeconds: recommendedForwardBufferSeconds,
  setForwardBufferSeconds: () => {},
});

const clamp = (value: number): number =>
  Math.min(
    MAX_FORWARD_BUFFER_SECONDS,
    Math.max(MIN_FORWARD_BUFFER_SECONDS, Math.round(value)),
  );

export const PlaybackSettingsProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  // Until storage hydrates, this stays `null` ("Auto"), which is a safe
  // default (the recommendation) rather than some arbitrary flash value.
  const [forwardBufferSeconds, setForwardBufferSecondsState] = useState<
    number | null
  >(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw == null || raw === AUTO_SENTINEL) return;
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) {
          setForwardBufferSecondsState(clamp(parsed));
        }
      })
      .catch(() => {});
  }, []);

  const setForwardBufferSeconds = useCallback((next: number | null) => {
    const clamped = next == null ? null : clamp(next);
    setForwardBufferSecondsState(clamped);
    AsyncStorage.setItem(
      STORAGE_KEY,
      clamped == null ? AUTO_SENTINEL : String(clamped),
    ).catch(() => {});
  }, []);

  const value = useMemo<PlaybackSettingsContextValue>(
    () => ({
      deviceTotalMemory,
      recommendedForwardBufferSeconds,
      forwardBufferSeconds,
      effectiveForwardBufferSeconds:
        forwardBufferSeconds ?? recommendedForwardBufferSeconds,
      setForwardBufferSeconds,
    }),
    [forwardBufferSeconds, setForwardBufferSeconds],
  );

  return (
    <PlaybackSettingsContext.Provider value={value}>
      {children}
    </PlaybackSettingsContext.Provider>
  );
};

export const usePlaybackSettings = () => useContext(PlaybackSettingsContext);
