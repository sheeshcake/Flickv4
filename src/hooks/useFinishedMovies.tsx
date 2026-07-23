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

const STORAGE_KEY = 'flick.finishedMovies';

export interface FinishedMovieEntry {
  item: MediaItem;
  finishedAt: number;
}

const keyFor = (item: Pick<MediaItem, 'id' | 'media_type'>) =>
  `${item.media_type ?? 'movie'}-${item.id}`;

interface FinishedMoviesContextValue {
  entries: FinishedMovieEntry[];
  loaded: boolean;
  markFinished: (item: MediaItem) => void;
  remove: (item: Pick<MediaItem, 'id' | 'media_type'>) => void;
  isFinished: (item: Pick<MediaItem, 'id' | 'media_type'>) => boolean;
}

const FinishedMoviesContext = createContext<FinishedMoviesContextValue>({
  entries: [],
  loaded: false,
  markFinished: () => {},
  remove: () => {},
  isFinished: () => false,
});

/**
 * Persisted list of movies the user has watched to completion. Populated by
 * `useContinueWatching`'s existing "ratio > 0.95" finished-heuristic (see
 * that hook), so it stays in sync with what leaves Continue Watching for
 * being done, rather than depending on a separate end-of-file event.
 */
export const FinishedMoviesProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [entries, setEntries] = useState<FinishedMovieEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setEntries(JSON.parse(raw) as FinishedMovieEntry[]);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const markFinished = useCallback((item: MediaItem) => {
    setEntries((prev) => {
      const without = prev.filter((e) => keyFor(e.item) !== keyFor(item));
      const next = [{ item, finishedAt: Date.now() }, ...without];
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const remove = useCallback((item: Pick<MediaItem, 'id' | 'media_type'>) => {
    setEntries((prev) => {
      const next = prev.filter((e) => keyFor(e.item) !== keyFor(item));
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const isFinished = useCallback(
    (item: Pick<MediaItem, 'id' | 'media_type'>) =>
      entries.some((e) => keyFor(e.item) === keyFor(item)),
    [entries],
  );

  const value = useMemo(
    () => ({ entries, loaded, markFinished, remove, isFinished }),
    [entries, loaded, markFinished, remove, isFinished],
  );

  return (
    <FinishedMoviesContext.Provider value={value}>
      {children}
    </FinishedMoviesContext.Provider>
  );
};

export const useFinishedMovies = () => useContext(FinishedMoviesContext);
