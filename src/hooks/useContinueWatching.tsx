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
import type { MediaItem } from '@/src/types';

const STORAGE_KEY = 'flick.continueWatching';

export interface ContinueWatchingEntry {
  item: MediaItem;
  position: number;
  duration: number;
  season?: number;
  episode?: number;
  updatedAt: number;
}

const keyFor = (
  item: Pick<MediaItem, 'id' | 'media_type'>,
  season?: number,
  episode?: number,
) => {
  const base = `${item.media_type ?? 'movie'}-${item.id}`;
  if (season != null && episode != null) return `${base}-s${season}e${episode}`;
  return base;
};

interface ContinueWatchingContextValue {
  entries: ContinueWatchingEntry[];
  loaded: boolean;
  upsert: (
    entry: Omit<ContinueWatchingEntry, 'updatedAt'> & { updatedAt?: number },
  ) => void;
  remove: (
    item: Pick<MediaItem, 'id' | 'media_type'>,
    season?: number,
    episode?: number,
  ) => void;
  getProgress: (
    item: Pick<MediaItem, 'id' | 'media_type'>,
    season?: number,
    episode?: number,
  ) => ContinueWatchingEntry | undefined;
}

const ContinueWatchingContext = createContext<ContinueWatchingContextValue>({
  entries: [],
  loaded: false,
  upsert: () => {},
  remove: () => {},
  getProgress: () => undefined,
});

export const ContinueWatchingProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [entries, setEntries] = useState<ContinueWatchingEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw) as ContinueWatchingEntry[];
          setEntries(parsed.sort((a, b) => b.updatedAt - a.updatedAt));
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const upsert = useCallback(
    (
      entry: Omit<ContinueWatchingEntry, 'updatedAt'> & { updatedAt?: number },
    ) => {
      const ratio = entry.duration > 0 ? entry.position / entry.duration : 0;
      const k = keyFor(entry.item, entry.season, entry.episode);

      if (entry.position < 30 || ratio > 0.95) {
        setEntries((prev) => {
          const next = prev.filter(
            (e) => keyFor(e.item, e.season, e.episode) !== k,
          );
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(
            () => {},
          );
          return next;
        });
        return;
      }

      const nextEntry: ContinueWatchingEntry = {
        ...entry,
        updatedAt: entry.updatedAt ?? Date.now(),
      };

      setEntries((prev) => {
        const without = prev.filter(
          (e) => keyFor(e.item, e.season, e.episode) !== k,
        );
        const next = [nextEntry, ...without]
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 20);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  const remove = useCallback(
    (
      item: Pick<MediaItem, 'id' | 'media_type'>,
      season?: number,
      episode?: number,
    ) => {
      const k = keyFor(item, season, episode);
      setEntries((prev) => {
        const next = prev.filter(
          (e) => keyFor(e.item, e.season, e.episode) !== k,
        );
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  const getProgress = useCallback(
    (
      item: Pick<MediaItem, 'id' | 'media_type'>,
      season?: number,
      episode?: number,
    ) => {
      const k = keyFor(item, season, episode);
      return entries.find((e) => keyFor(e.item, e.season, e.episode) === k);
    },
    [entries],
  );

  const value = useMemo(
    () => ({ entries, loaded, upsert, remove, getProgress }),
    [entries, loaded, upsert, remove, getProgress],
  );

  return (
    <ContinueWatchingContext.Provider value={value}>
      {children}
    </ContinueWatchingContext.Provider>
  );
};

export const useContinueWatching = () => useContext(ContinueWatchingContext);
