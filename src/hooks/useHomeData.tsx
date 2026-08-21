import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { buildHomeFeed, type HomeRowSpec } from '@/src/config/homeFeed';
import {
  fetchCategoryPage,
  tagMedia,
  type CategoryQuery,
} from '@/src/services/categories';
import { TMDBService } from '@/src/services/TMDBService';
import type { MediaItem } from '@/src/types';
import { getRegionName, useCatalogRegion } from '@/src/hooks/useCatalogRegion';

export interface HomeRow {
  id: string;
  title: string;
  data: MediaItem[];
  /** Category descriptor enabling a paginated "View More" screen. */
  query: CategoryQuery;
  variant: HomeRowSpec['variant'];
}

interface HomeDataContextValue {
  hero: MediaItem[];
  rows: HomeRow[];
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  /** Splash-blocking: regional popular movies + TV → hero + country Top 10s. */
  prefetch: () => Promise<void>;
  refresh: () => void;
}

const TOP_TEN_COUNT = 10;
const HERO_COUNT = 5;

const HomeDataContext = createContext<HomeDataContextValue>({
  hero: [],
  rows: [],
  loading: true,
  error: null,
  refreshing: false,
  prefetch: async () => {},
  refresh: () => {},
});

const assembleRows = (
  feed: HomeRowSpec[],
  filled: Map<string, HomeRow>,
): HomeRow[] =>
  feed.flatMap((spec) => {
    const row = filled.get(spec.id);
    return row && row.data.length > 0 ? [row] : [];
  });

const rowFromSpec = (spec: HomeRowSpec, data: MediaItem[]): HomeRow => ({
  id: spec.id,
  title: spec.title,
  data: spec.variant === 'topTen' ? data.slice(0, TOP_TEN_COUNT) : data,
  query: spec.query,
  variant: spec.variant,
});

export const HomeDataProvider = ({ children }: { children: ReactNode }) => {
  const { region } = useCatalogRegion();
  const feed = useMemo(
    () => buildHomeFeed(region, getRegionName(region)),
    [region],
  );
  const feedRef = useRef(feed);
  feedRef.current = feed;
  const regionRef = useRef(region);
  regionRef.current = region;

  const [hero, setHero] = useState<MediaItem[]>([]);
  const [rows, setRows] = useState<HomeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filledRef = useRef<Map<string, HomeRow>>(new Map());
  const wave1PromiseRef = useRef<Promise<void> | null>(null);
  const wave1DoneRef = useRef(false);
  const wave2GenerationRef = useRef(0);

  const commitRows = useCallback(() => {
    setRows(assembleRows(feedRef.current, filledRef.current));
  }, []);

  const loadWave2 = useCallback(
    (generation: number) => {
      const specs = feedRef.current.filter((spec) => spec.wave === 2);
      for (const spec of specs) {
        void fetchCategoryPage(spec.query, 1)
          .then((data) => {
            if (generation !== wave2GenerationRef.current) return;
            if (!data.length) return;
            filledRef.current.set(spec.id, rowFromSpec(spec, data));
            commitRows();
          })
          .catch(() => {
            // Failed wave-2 rows are omitted; they must not fail the home feed.
          });
      }
    },
    [commitRows],
  );

  const loadWave1 = useCallback(async () => {
    setError(null);
    const regionCode = regionRef.current;
    const [movies, tv] = await Promise.all([
      TMDBService.getPopularMovies(1, regionCode),
      TMDBService.getPopularTVShows(1, regionCode),
    ]);

    const popularMovies = tagMedia(movies.results, 'movie');
    const popularTv = tagMedia(tv.results, 'tv');
    setHero(popularMovies.slice(0, HERO_COUNT));

    const next = new Map<string, HomeRow>();
    for (const spec of feedRef.current) {
      if (spec.wave !== 1) continue;
      const data =
        spec.query.kind === 'popularTv' ? popularTv : popularMovies;
      if (!data.length) continue;
      next.set(spec.id, rowFromSpec(spec, data));
    }
    filledRef.current = next;
    commitRows();
  }, [commitRows]);

  const prefetch = useCallback(async () => {
    if (wave1DoneRef.current) return;
    if (wave1PromiseRef.current) return wave1PromiseRef.current;

    const run = (async () => {
      try {
        await loadWave1();
        wave1DoneRef.current = true;
        wave2GenerationRef.current += 1;
        loadWave2(wave2GenerationRef.current);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load content.',
        );
        // Soft-fail: Splash still enters Main; Home shows retry.
      } finally {
        setLoading(false);
      }
    })();

    wave1PromiseRef.current = run;
    try {
      await run;
    } finally {
      wave1PromiseRef.current = null;
    }
  }, [loadWave1, loadWave2]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    wave1DoneRef.current = false;
    wave2GenerationRef.current += 1;
    void (async () => {
      try {
        await loadWave1();
        wave1DoneRef.current = true;
        loadWave2(wave2GenerationRef.current);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load content.',
        );
      } finally {
        setRefreshing(false);
        setLoading(false);
      }
    })();
  }, [loadWave1, loadWave2]);

  const value = useMemo(
    () => ({
      hero,
      rows,
      loading,
      error,
      refreshing,
      prefetch,
      refresh,
    }),
    [hero, rows, loading, error, refreshing, prefetch, refresh],
  );

  return (
    <HomeDataContext.Provider value={value}>{children}</HomeDataContext.Provider>
  );
};

export const useHomeData = (): HomeDataContextValue => useContext(HomeDataContext);
