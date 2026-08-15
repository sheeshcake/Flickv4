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
import {
  MOVIEBOX_SERVER_ID,
  type ServerResolver,
} from '@/src/services/MovieboxService';

const STORAGE_KEY = 'flick.servers';

export interface PlaybackServer {
  id: string;
  name: string;
  /** Base URL, e.g. https://vidfast.pro */
  url: string;
  /** Built-in servers cannot be deleted. */
  builtIn?: boolean;
  /**
   * How this server resolves a stream. `moviebox` uses the aoneroom REST
   * API (no WebView). Omitted/`webview` is the embed-page scraper.
   */
  resolver?: ServerResolver;
  /**
   * Optional custom embed URL template used for movies, for servers that
   * don't follow the default `{url}/{type}/{tmdbId}` path pattern — e.g. a
   * server using query params instead: `{url}/{type}?tmdb={tmdbId}`, or one
   * that bakes a slugified title into the path:
   * `{url}/{type}/{tmdbId}-{slug}?streaming=true`. Supports `{url}`,
   * `{type}`, `{tmdbId}`, `{imdbId}`, `{slug}`, `{season}`, `{episode}`
   * placeholders. See `buildEmbedUrl` in `src/utils/streamUrl.ts`.
   */
  movieUrlPattern?: string;
  /**
   * Optional custom embed URL template used for TV shows — same
   * placeholders as `movieUrlPattern`. Falls back to
   * `DEFAULT_TV_URL_PATTERN` (`{url}/{type}/{tmdbId}/{season}/{episode}`)
   * when unset, unlike `movieUrlPattern` this default already includes the
   * season/episode segments.
   */
  tvUrlPattern?: string;
  /**
   * Optional override for what `{type}` resolves to on movies — some
   * servers use "movies" instead of "movie".
   */
  movieTypeLabel?: string;
  /**
   * Optional override for what `{type}` resolves to on TV shows — some
   * servers use "series" instead of "tv".
   */
  tvTypeLabel?: string;
  /**
   * Seconds to wait for a stream after the embed page finishes loading,
   * before `WebViewScraper` gives up. `0` means no timeout — wait
   * indefinitely, e.g. to manually solve a captcha via the Debug video
   * player (Settings). Omitted/`undefined` falls back to
   * `DEFAULT_SCRAPER_TIMEOUT_SECONDS`. Deliberately independent of the
   * Debug video player toggle, which only controls WebView visibility.
   */
  scraperTimeoutSeconds?: number;
}

export interface AddServerOptions {
  movieUrlPattern?: string;
  tvUrlPattern?: string;
  movieTypeLabel?: string;
  tvTypeLabel?: string;
  scraperTimeoutSeconds?: number;
}

/** Fallback used whenever a server doesn't specify its own
 * `scraperTimeoutSeconds` — shared with `WebViewScraper.tsx`. */
export const DEFAULT_SCRAPER_TIMEOUT_SECONDS = 60;

/**
 * Where the built-in playback server list is fetched from at runtime —
 * lets built-in servers be added/updated without an app release. See
 * `RemoteServerJson` below for the expected response shape.
 */
export const BUILT_IN_SERVERS_URL =
  'https://raw.githubusercontent.com/sheeshcake/Flickv4/refs/heads/v2.x.x/servers/list.json';

/**
 * Cache key for the last successfully-fetched `BUILT_IN_SERVERS_URL`
 * response (raw, pre-mapping) — keeps the built-in server list available
 * offline after the first successful launch. Separate from `STORAGE_KEY`,
 * which only ever holds user-added custom servers + the active server id.
 */
const BUILT_IN_SERVERS_CACHE_KEY = 'flick.servers.builtInCache';

/** Abort the built-in server list fetch if the network stalls, so the app
 * never hangs waiting on it — same pattern as `TMDBService.ts`. */
const BUILT_IN_SERVERS_FETCH_TIMEOUT_MS = 10000;

/**
 * Raw shape of an entry in the remote built-in server list. Currently a
 * single `url_pattern` (shared by movie+tv, same convention as the legacy
 * custom-server `urlPattern` migrated below) — `movie_url_pattern` /
 * `tv_url_pattern` / `id` are tolerated too, in case that file's schema is
 * later updated to the richer split-pattern shape this app already
 * supports for custom servers.
 */
interface RemoteServerJson {
  id?: string;
  name: string;
  url: string;
  url_pattern?: string | null;
  movie_url_pattern?: string | null;
  tv_url_pattern?: string | null;
  movie_alias?: string | null;
  tv_alias?: string | null;
  /**
   * Seconds to wait for a stream after the embed page loads. `0` = no
   * timeout. Omitted/null → app default (`DEFAULT_SCRAPER_TIMEOUT_SECONDS`).
   */
  scraper_timeout_seconds?: number | null;
  resolver?: string | null;
}

const slugifyId = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const mapRemoteServer = (s: RemoteServerJson): PlaybackServer => {
  const moviePattern = s.movie_url_pattern ?? s.url_pattern;
  const tvPattern = s.tv_url_pattern ?? s.url_pattern;
  const timeoutRaw = s.scraper_timeout_seconds;
  const scraperTimeoutSeconds =
    typeof timeoutRaw === 'number' && Number.isFinite(timeoutRaw)
      ? Math.max(0, Math.round(timeoutRaw))
      : undefined;
  return {
    id: s.id?.trim() || slugifyId(s.name),
    name: s.name,
    url: s.url,
    builtIn: true,
    ...(moviePattern ? { movieUrlPattern: moviePattern } : {}),
    ...(tvPattern ? { tvUrlPattern: tvPattern } : {}),
    ...(s.movie_alias ? { movieTypeLabel: s.movie_alias } : {}),
    ...(s.tv_alias ? { tvTypeLabel: s.tv_alias } : {}),
    ...(scraperTimeoutSeconds != null
      ? { scraperTimeoutSeconds }
      : {}),
    ...(s.resolver === 'moviebox' ? { resolver: 'moviebox' as const } : {}),
  };
};

/** Always present — does not depend on the remote `list.json` fetch. */
export const MOVIEBOX_SERVER: PlaybackServer = {
  id: MOVIEBOX_SERVER_ID,
  name: 'Moviebox',
  url: 'https://moviebox.ph',
  builtIn: true,
  resolver: 'moviebox',
};

const withLocalMoviebox = (list: PlaybackServer[]): PlaybackServer[] => [
  MOVIEBOX_SERVER,
  ...list.filter(
    (s) => s.id !== MOVIEBOX_SERVER.id && s.resolver !== 'moviebox',
  ),
];

/**
 * Last-resort fallback for `activeServer` — only ever surfaces on a
 * brand-new install that's offline before the very first built-in-server
 * fetch resolves (and no custom servers exist yet either).
 */
const EMPTY_SERVER: PlaybackServer = { id: '', name: '', url: '' };

/** Shape persisted under `STORAGE_KEY` — custom (non-built-in) servers only,
 * plus whichever server id is currently active. */
interface PersistedState {
  servers: PlaybackServer[];
  activeId: string;
}

interface ServersContextValue {
  servers: PlaybackServer[];
  activeId: string;
  activeServer: PlaybackServer;
  loaded: boolean;
  /**
   * Re-fetch the built-in server list (cache first, then network). Resolves
   * once the network attempt finishes (success or failure) so Splash can
   * await it without hanging forever.
   */
  refreshBuiltInServers: () => Promise<void>;
  addServer: (name: string, url: string, options?: AddServerOptions) => void;
  /** Edits a custom (non-built-in) server's fields in place. No-op for built-ins. */
  updateServer: (
    id: string,
    name: string,
    url: string,
    options?: AddServerOptions,
  ) => void;
  removeServer: (id: string) => void;
  setActive: (id: string) => void;
}

const ServersContext = createContext<ServersContextValue>({
  servers: [],
  activeId: '',
  activeServer: EMPTY_SERVER,
  loaded: false,
  refreshBuiltInServers: async () => {},
  addServer: () => {},
  updateServer: () => {},
  removeServer: () => {},
  setActive: () => {},
});

export const normalizeUrl = (url: string): string => {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

export const ServersProvider = ({ children }: { children: ReactNode }) => {
  // Built-in servers now come from `BUILT_IN_SERVERS_URL` at runtime instead
  // of a bundled file, so they resolve on their own async timeline (cache,
  // then network) separate from the custom-servers/activeId storage below.
  const [builtInServers, setBuiltInServers] = useState<PlaybackServer[]>([]);
  const [builtInAttempted, setBuiltInAttempted] = useState(false);

  const [customServers, setCustomServers] = useState<PlaybackServer[]>([]);
  const [activeId, setActiveId] = useState('');
  const [customLoaded, setCustomLoaded] = useState(false);

  const refreshBuiltInServers = useCallback(async () => {
    // Cache first: instant, offline-friendly render using whatever was last
    // successfully fetched (if anything yet).
    try {
      const raw = await AsyncStorage.getItem(BUILT_IN_SERVERS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as RemoteServerJson[];
        if (Array.isArray(parsed)) {
          setBuiltInServers(parsed.map(mapRemoteServer));
        }
      }
    } catch {
      /* ignore corrupt cache */
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      BUILT_IN_SERVERS_FETCH_TIMEOUT_MS,
    );

    // Then always try the network, so the list can change without an app
    // release. Silently keep whatever's already set (cache or empty) on any
    // failure — no user-facing error for what's a background refresh.
    try {
      const res = await fetch(BUILT_IN_SERVERS_URL, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as RemoteServerJson[];
      if (Array.isArray(json)) {
        setBuiltInServers(json.map(mapRemoteServer));
        AsyncStorage.setItem(
          BUILT_IN_SERVERS_CACHE_KEY,
          JSON.stringify(json),
        ).catch(() => {});
      }
    } catch {
      /* keep cache / empty */
    } finally {
      clearTimeout(timeout);
      setBuiltInAttempted(true);
    }
  }, []);

  useEffect(() => {
    void refreshBuiltInServers();
  }, [refreshBuiltInServers]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as PersistedState;
        // Migrate any already-persisted custom server that still has the
        // old single `urlPattern` field (shared by both movie/tv) into the
        // new split fields, so existing custom servers keep working
        // unchanged. `.filter(!builtIn)` also drops any built-in servers a
        // pre-refactor version of this file may have persisted alongside
        // custom ones — built-ins are never persisted here anymore.
        const custom = (parsed.servers ?? [])
          .filter((s) => !s.builtIn)
          .map((s) => {
            const legacyPattern = (s as { urlPattern?: string }).urlPattern;
            if (!legacyPattern) return s;
            return {
              ...s,
              movieUrlPattern: s.movieUrlPattern ?? legacyPattern,
              tvUrlPattern: s.tvUrlPattern ?? legacyPattern,
            };
          });
        setCustomServers(custom);
        setActiveId(parsed.activeId ?? '');
      })
      .catch(() => {})
      .finally(() => setCustomLoaded(true));
  }, []);

  const persist = useCallback(
    (servers: PlaybackServer[], nextActiveId: string) => {
      const next: PersistedState = { servers, activeId: nextActiveId };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    },
    [],
  );

  const addServer = useCallback(
    (name: string, url: string, options?: AddServerOptions) => {
      const cleanUrl = normalizeUrl(url);
      const cleanName = name.trim();
      if (!cleanUrl || !cleanName) return;
      const cleanMoviePattern = options?.movieUrlPattern?.trim();
      const cleanTvPattern = options?.tvUrlPattern?.trim();
      const cleanMovieLabel = options?.movieTypeLabel?.trim();
      const cleanTvLabel = options?.tvTypeLabel?.trim();
      // `0` ("no timeout") is a meaningful value, not a falsy-omit case —
      // only fall back to "unset" when the option itself is `null`/`undefined`.
      const cleanTimeout =
        options?.scraperTimeoutSeconds != null
          ? Math.max(0, Math.round(options.scraperTimeoutSeconds))
          : undefined;
      setCustomServers((prev) => {
        const server: PlaybackServer = {
          id: `custom-${Date.now()}`,
          name: cleanName,
          url: cleanUrl,
          ...(cleanMoviePattern ? { movieUrlPattern: cleanMoviePattern } : {}),
          ...(cleanTvPattern ? { tvUrlPattern: cleanTvPattern } : {}),
          ...(cleanMovieLabel ? { movieTypeLabel: cleanMovieLabel } : {}),
          ...(cleanTvLabel ? { tvTypeLabel: cleanTvLabel } : {}),
          ...(cleanTimeout != null ? { scraperTimeoutSeconds: cleanTimeout } : {}),
        };
        const next = [...prev, server];
        persist(next, activeId);
        return next;
      });
    },
    [activeId, persist],
  );

  const updateServer = useCallback(
    (id: string, name: string, url: string, options?: AddServerOptions) => {
      const cleanUrl = normalizeUrl(url);
      const cleanName = name.trim();
      if (!cleanUrl || !cleanName) return;
      const cleanMoviePattern = options?.movieUrlPattern?.trim();
      const cleanTvPattern = options?.tvUrlPattern?.trim();
      const cleanMovieLabel = options?.movieTypeLabel?.trim();
      const cleanTvLabel = options?.tvTypeLabel?.trim();
      const cleanTimeout =
        options?.scraperTimeoutSeconds != null
          ? Math.max(0, Math.round(options.scraperTimeoutSeconds))
          : undefined;
      setCustomServers((prev) => {
        // Built-ins live entirely in `builtInServers` and are never part of
        // `customServers`, so a miss here already means "not editable" —
        // no separate `.builtIn` check needed.
        if (!prev.some((s) => s.id === id)) return prev;
        const next = prev.map((s) =>
          s.id === id
            ? {
                ...s,
                name: cleanName,
                url: cleanUrl,
                movieUrlPattern: cleanMoviePattern || undefined,
                tvUrlPattern: cleanTvPattern || undefined,
                movieTypeLabel: cleanMovieLabel || undefined,
                tvTypeLabel: cleanTvLabel || undefined,
                scraperTimeoutSeconds: cleanTimeout,
              }
            : s,
        );
        persist(next, activeId);
        return next;
      });
    },
    [activeId, persist],
  );

  const removeServer = useCallback(
    (id: string) => {
      setCustomServers((prev) => {
        if (!prev.some((s) => s.id === id)) return prev;
        const next = prev.filter((s) => s.id !== id);
        const nextActiveId =
          activeId === id ? builtInServers[0]?.id ?? '' : activeId;
        if (nextActiveId !== activeId) setActiveId(nextActiveId);
        persist(next, nextActiveId);
        return next;
      });
    },
    [activeId, builtInServers, persist],
  );

  const setActive = useCallback(
    (id: string) => {
      setActiveId(id);
      persist(customServers, id);
    },
    [customServers, persist],
  );

  const servers = useMemo(
    () => [...withLocalMoviebox(builtInServers), ...customServers],
    [builtInServers, customServers],
  );

  const activeServer = useMemo(
    () => servers.find((s) => s.id === activeId) ?? servers[0] ?? EMPTY_SERVER,
    [servers, activeId],
  );

  // True once we've made a first attempt at resolving BOTH the custom
  // servers/activeId storage AND the built-in list (from cache, network, or
  // neither) — so consumers don't hang forever if the fetch fails and
  // there's no cache yet.
  const loaded = customLoaded && builtInAttempted;

  const value = useMemo(
    () => ({
      servers,
      activeId,
      activeServer,
      loaded,
      refreshBuiltInServers,
      addServer,
      updateServer,
      removeServer,
      setActive,
    }),
    [
      servers,
      activeId,
      activeServer,
      loaded,
      refreshBuiltInServers,
      addServer,
      updateServer,
      removeServer,
      setActive,
    ],
  );

  return (
    <ServersContext.Provider value={value}>{children}</ServersContext.Provider>
  );
};

export const useServers = () => useContext(ServersContext);
