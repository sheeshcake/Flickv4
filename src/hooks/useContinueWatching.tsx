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
import { useFinishedMovies } from '@/src/hooks/useFinishedMovies';
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

/**
 * Dedupe key for Continue Watching.
 *
 * Movies get a per-title key. TV shows deliberately IGNORE season/episode so
 * only ONE entry per show is ever stored — always the most-recently-watched
 * episode. This keeps the row clean (one card per show) and lets resume land
 * on the latest episode you actually watched.
 */
const keyFor = (
  item: Pick<MediaItem, 'id' | 'media_type'>,
  _season?: number,
  _episode?: number,
) => {
  const media = item.media_type ?? 'movie';
  return media === 'tv' ? `tv-${item.id}` : `movie-${item.id}`;
};

interface ContinueWatchingContextValue {
  entries: ContinueWatchingEntry[];
  loaded: boolean;
  upsert: (
    entry: Omit<ContinueWatchingEntry, 'updatedAt'> & { updatedAt?: number },
  ) => void;
  /**
   * Re-point a show's Continue Watching entry at a new season/episode with
   * progress reset to 0, WITHOUT going through `upsert`'s "position < 30 ->
   * discard" rule. Used when autoplay advances to the next episode so the
   * show's row is immediately pointing at the new episode the instant
   * autoplay hands off — see `PlayerCore.playNextEpisode`. Unconditionally
   * upserts a fresh entry even if none existed yet (e.g. the previous
   * episode's row was already deleted by the regular progress autosave's
   * `ratio > 0.95` rule shortly before `onEnd`/autoplay fired).
   */
  advanceEpisode: (item: MediaItem, season: number, episode: number) => void;
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
  advanceEpisode: () => {},
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
  const { markFinished } = useFinishedMovies();

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as ContinueWatchingEntry[];
        // Collapse any pre-existing per-episode duplicates from older schemas
        // where multiple `tv-<id>-sXeY` rows existed for the same show. Keep
        // the newest `updatedAt` for each dedupe key.
        const bucket = new Map<string, ContinueWatchingEntry>();
        for (const entry of parsed) {
          const k = keyFor(entry.item, entry.season, entry.episode);
          const prev = bucket.get(k);
          if (!prev || entry.updatedAt > prev.updatedAt) {
            bucket.set(k, entry);
          }
        }
        const collapsed = Array.from(bucket.values()).sort(
          (a, b) => b.updatedAt - a.updatedAt,
        );
        setEntries(collapsed);
        // Persist the collapsed list so subsequent reads are cheap and we
        // don't repeat the migration on every launch.
        if (collapsed.length !== parsed.length) {
          AsyncStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(collapsed),
          ).catch(() => {});
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
        // A movie that's been watched to completion graduates into the
        // "Finished Movies" list instead of just vanishing. TV shows are
        // excluded — finishing one episode doesn't mean the series is done.
        if (
          ratio > 0.95 &&
          (entry.item.media_type ?? 'movie') !== 'tv'
        ) {
          markFinished(entry.item);
        }
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
    [markFinished],
  );

  const advanceEpisode = useCallback(
    (item: MediaItem, season: number, episode: number) => {
      const k = keyFor(item, season, episode);
      setEntries((prev) => {
        const existing = prev.find(
          (e) => keyFor(e.item, e.season, e.episode) === k,
        );
        // No existing row (e.g. the late `ratio > 0.95` autosave already
        // deleted it just before autoplay fired) — build a fresh one
        // instead of no-op'ing, so the show's Continue Watching row
        // reappears immediately at the new episode rather than waiting for
        // that episode's own autosave to first cross `position >= 30`.
        const updated = existing
          ? { ...existing, season, episode, position: 0, duration: 0, updatedAt: Date.now() }
          : { item, season, episode, position: 0, duration: 0, updatedAt: Date.now() };
        const next = [
          updated,
          ...prev.filter((e) => keyFor(e.item, e.season, e.episode) !== k),
        ]
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
    () => ({ entries, loaded, upsert, advanceEpisode, remove, getProgress }),
    [entries, loaded, upsert, advanceEpisode, remove, getProgress],
  );

  return (
    <ContinueWatchingContext.Provider value={value}>
      {children}
    </ContinueWatchingContext.Provider>
  );
};

export const useContinueWatching = () => useContext(ContinueWatchingContext);
