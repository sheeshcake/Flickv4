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
}

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
  addServer: (name: string, url: string) => void;
  removeServer: (id: string) => void;
  setActive: (id: string) => void;
}

const ServersContext = createContext<ServersContextValue>({
  servers: DEFAULT_SERVERS,
  activeId: DEFAULT_SERVERS[0].id,
  activeServer: DEFAULT_SERVERS[0],
  loaded: false,
  addServer: () => {},
  removeServer: () => {},
  setActive: () => {},
});

const normalizeUrl = (url: string): string => {
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
    (name: string, url: string) => {
      const cleanUrl = normalizeUrl(url);
      const cleanName = name.trim();
      if (!cleanUrl || !cleanName) return;
      setState((prev) => {
        const server: PlaybackServer = {
          id: `custom-${Date.now()}`,
          name: cleanName,
          url: cleanUrl,
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
      removeServer,
      setActive,
    }),
    [servers, activeId, activeServer, loaded, addServer, removeServer, setActive],
  );

  return (
    <ServersContext.Provider value={value}>{children}</ServersContext.Provider>
  );
};

export const useServers = () => useContext(ServersContext);
