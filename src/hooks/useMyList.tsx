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

const STORAGE_KEY = 'flick.myList';

const keyFor = (item: Pick<MediaItem, 'id' | 'media_type'>) =>
  `${item.media_type ?? 'movie'}-${item.id}`;

interface MyListContextValue {
  items: MediaItem[];
  loaded: boolean;
  isInList: (item: Pick<MediaItem, 'id' | 'media_type'>) => boolean;
  toggle: (item: MediaItem) => void;
}

const MyListContext = createContext<MyListContextValue>({
  items: [],
  loaded: false,
  isInList: () => false,
  toggle: () => {},
});

/**
 * Shared "My List" backed by AsyncStorage. Exposed via context so every screen
 * (Home, Detail, Hero) reads and mutates the same reactive, persisted list.
 */
export const MyListProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setItems(JSON.parse(raw) as MediaItem[]);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const isInList = useCallback(
    (item: Pick<MediaItem, 'id' | 'media_type'>) =>
      items.some((i) => keyFor(i) === keyFor(item)),
    [items],
  );

  const toggle = useCallback((item: MediaItem) => {
    setItems((prev) => {
      const exists = prev.some((i) => keyFor(i) === keyFor(item));
      const next = exists
        ? prev.filter((i) => keyFor(i) !== keyFor(item))
        : [item, ...prev];
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ items, loaded, isInList, toggle }),
    [items, loaded, isInList, toggle],
  );

  return <MyListContext.Provider value={value}>{children}</MyListContext.Provider>;
};

export const useMyList = () => useContext(MyListContext);
