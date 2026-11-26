import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'flick.playerPreferences';

/**
 * Preferences that survive leaving the player. They are stored **per title**
 * (`tv-<id>` / `movie-<id>`) so a show's speed / audio / subtitle-language
 * choice does not leak into the next show you open.
 *
 * `undefined` means "not chosen yet" and falls back to the app-wide default;
 * `null` is an explicit "Off" choice made by the user.
 */
export interface PlayerPreference {
  playbackRate?: number;
  subtitleLanguage?: string | null;
  audioLanguage?: string | null;
  /** Fallback when a stream's audio tracks don't expose a language code. */
  audioIndex?: number | null;
}

interface PlayerPreferenceStore {
  byKey: Record<string, PlayerPreference>;
}

export type PreferenceSubject = {
  id?: number | string;
  media_type?: string | null;
};

/** Mirrors `useContinueWatching`'s key so TV settings are per show, not per episode. */
export const playerPreferenceKey = (item: PreferenceSubject): string =>
  `${item.media_type === 'tv' ? 'tv' : 'movie'}-${item.id ?? 'unknown'}`;

interface PlayerPreferencesContextValue {
  /** False until the persisted store has been read (one AsyncStorage read). */
  ready: boolean;
  /** Merged preference for a title; safe to call during render. */
  getFor: (item: PreferenceSubject) => PlayerPreference;
  /** Persist only the supplied fields for this title. */
  saveFor: (item: PreferenceSubject, patch: Partial<PlayerPreference>) => void;
  /** Forget this title's overrides and fall back to app-wide defaults. */
  resetFor: (item: PreferenceSubject) => void;
}

const EMPTY_STORE: PlayerPreferenceStore = { byKey: {} };

const PlayerPreferencesContext = createContext<PlayerPreferencesContextValue>({
  ready: false,
  getFor: () => ({}),
  saveFor: () => {},
  resetFor: () => {},
});

export const PlayerPreferencesProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [store, setStore] = useState<PlayerPreferenceStore>(EMPTY_STORE);
  const [ready, setReady] = useState(false);
  const storeRef = useRef(store);
  storeRef.current = store;

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw) as Partial<PlayerPreferenceStore>;
        if (parsed && typeof parsed === 'object' && parsed.byKey) {
          setStore({ byKey: parsed.byKey });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: PlayerPreferenceStore) => {
    setStore(next);
    storeRef.current = next;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const getFor = useCallback(
    (item: PreferenceSubject): PlayerPreference =>
      storeRef.current.byKey[playerPreferenceKey(item)] ?? {},
    [],
  );

  const saveFor = useCallback(
    (item: PreferenceSubject, patch: Partial<PlayerPreference>) => {
      const key = playerPreferenceKey(item);
      const current = storeRef.current;
      persist({
        byKey: {
          ...current.byKey,
          [key]: { ...(current.byKey[key] ?? {}), ...patch },
        },
      });
    },
    [persist],
  );

  const resetFor = useCallback(
    (item: PreferenceSubject) => {
      const key = playerPreferenceKey(item);
      const current = storeRef.current;
      const next = { ...current.byKey };
      delete next[key];
      persist({ byKey: next });
    },
    [persist],
  );

  const value = useMemo(
    () => ({ ready, getFor, saveFor, resetFor }),
    [ready, getFor, saveFor, resetFor],
  );

  return (
    <PlayerPreferencesContext.Provider value={value}>
      {children}
    </PlayerPreferencesContext.Provider>
  );
};

export const usePlayerPreferences = () =>
  useContext(PlayerPreferencesContext);
