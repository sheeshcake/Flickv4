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

const STORAGE_KEY = 'flick.servers';

export interface PlaybackServer {
  id: string;
  name: string;
  /** Base URL, e.g. https://vidfast.pro */
  url: string;
  /** Built-in servers cannot be deleted. */
  builtIn?: boolean;
  /**
   * Optional custom embed URL template for servers that don't follow the
   * default `{url}/{type}/{tmdbId}` path pattern — e.g. a server using query
   * params instead: `{url}/{type}?tmdb={tmdbId}`, or one that bakes a
   * slugified title into the path: `{url}/{type}/{tmdbId}-{slug}?streaming=true`.
   * Supports `{url}`, `{type}`, `{tmdbId}`, `{slug}`, `{season}`, `{episode}`
   * placeholders. See `buildEmbedUrl` in `src/utils/streamUrl.ts`.
   */
  urlPattern?: string;
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
  urlPattern?: string;
  movieTypeLabel?: string;
  tvTypeLabel?: string;
  scraperTimeoutSeconds?: number;
}

/** Fallback used whenever a server doesn't specify its own
 * `scraperTimeoutSeconds` — shared with `WebViewScraper.tsx`. */
export const DEFAULT_SCRAPER_TIMEOUT_SECONDS = 60;

export const DEFAULT_SERVERS: PlaybackServer[] = [
  { id: 'vidfast', name: 'VidFast', url: 'https://vidfast.pro', builtIn: true },
];

interface PersistedState {
  servers: PlaybackServer[];
  activeId: string;
}

interface ServersContextValue {
  servers: PlaybackServer[];
  activeId: string;
  activeServer: PlaybackServer;
  loaded: boolean;
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
  servers: DEFAULT_SERVERS,
  activeId: DEFAULT_SERVERS[0].id,
  activeServer: DEFAULT_SERVERS[0],
  loaded: false,
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
  const [state, setState] = useState<PersistedState>({
    servers: DEFAULT_SERVERS,
    activeId: DEFAULT_SERVERS[0].id,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as PersistedState;
        // Always keep built-in servers present and up to date.
        const custom = (parsed.servers ?? []).filter((s) => !s.builtIn);
        const merged = [...DEFAULT_SERVERS, ...custom];
        setState({
          servers: merged,
          activeId: merged.some((s) => s.id === parsed.activeId)
            ? parsed.activeId
            : DEFAULT_SERVERS[0].id,
        });
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const addServer = useCallback(
    (name: string, url: string, options?: AddServerOptions) => {
      const cleanUrl = normalizeUrl(url);
      const cleanName = name.trim();
      if (!cleanUrl || !cleanName) return;
      const cleanPattern = options?.urlPattern?.trim();
      const cleanMovieLabel = options?.movieTypeLabel?.trim();
      const cleanTvLabel = options?.tvTypeLabel?.trim();
      // `0` ("no timeout") is a meaningful value, not a falsy-omit case —
      // only fall back to "unset" when the option itself is `null`/`undefined`.
      const cleanTimeout =
        options?.scraperTimeoutSeconds != null
          ? Math.max(0, Math.round(options.scraperTimeoutSeconds))
          : undefined;
      setState((prev) => {
        const server: PlaybackServer = {
          id: `custom-${Date.now()}`,
          name: cleanName,
          url: cleanUrl,
          ...(cleanPattern ? { urlPattern: cleanPattern } : {}),
          ...(cleanMovieLabel ? { movieTypeLabel: cleanMovieLabel } : {}),
          ...(cleanTvLabel ? { tvTypeLabel: cleanTvLabel } : {}),
          ...(cleanTimeout != null ? { scraperTimeoutSeconds: cleanTimeout } : {}),
        };
        const next: PersistedState = {
          servers: [...prev.servers, server],
          activeId: prev.activeId,
        };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  const updateServer = useCallback(
    (id: string, name: string, url: string, options?: AddServerOptions) => {
      const cleanUrl = normalizeUrl(url);
      const cleanName = name.trim();
      if (!cleanUrl || !cleanName) return;
      const cleanPattern = options?.urlPattern?.trim();
      const cleanMovieLabel = options?.movieTypeLabel?.trim();
      const cleanTvLabel = options?.tvTypeLabel?.trim();
      const cleanTimeout =
        options?.scraperTimeoutSeconds != null
          ? Math.max(0, Math.round(options.scraperTimeoutSeconds))
          : undefined;
      setState((prev) => {
        const target = prev.servers.find((s) => s.id === id);
        if (!target || target.builtIn) return prev;
        const servers = prev.servers.map((s) =>
          s.id === id
            ? {
                ...s,
                name: cleanName,
                url: cleanUrl,
                urlPattern: cleanPattern || undefined,
                movieTypeLabel: cleanMovieLabel || undefined,
                tvTypeLabel: cleanTvLabel || undefined,
                scraperTimeoutSeconds: cleanTimeout,
              }
            : s,
        );
        const next: PersistedState = { servers, activeId: prev.activeId };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  const removeServer = useCallback((id: string) => {
    setState((prev) => {
      const target = prev.servers.find((s) => s.id === id);
      if (!target || target.builtIn) return prev;
      const servers = prev.servers.filter((s) => s.id !== id);
      const activeId =
        prev.activeId === id ? DEFAULT_SERVERS[0].id : prev.activeId;
      const next: PersistedState = { servers, activeId };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const setActive = useCallback(
    (id: string) => {
      setState((prev) => {
        const next: PersistedState = { servers: prev.servers, activeId: id };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  const { servers, activeId } = state;

  const activeServer = useMemo(
    () => servers.find((s) => s.id === activeId) ?? servers[0] ?? DEFAULT_SERVERS[0],
    [servers, activeId],
  );

  const value = useMemo(
    () => ({
      servers,
      activeId,
      activeServer,
      loaded,
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
