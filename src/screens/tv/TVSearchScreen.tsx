import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useAppContext } from '../../context/AppContext';
import { TMDBService } from '../../services/TMDBService';
import { TVContentCard } from '../../components/tv/TVContentCard';
import { AppActionType, Content, AppError } from '../../types';
import { Movie, TVShow } from '../../types';
import { preloadMixedContent } from '../../utils/imagePreloader';
import { COLORS } from '../../utils/constants';

const { width: screenWidth } = Dimensions.get('window');
const COLUMNS = 4;
const CARD_GAP = 20;
const SIDE_PADDING = 60;
const CARD_WIDTH =
  (screenWidth - SIDE_PADDING * 2 - CARD_GAP * (COLUMNS - 1)) / COLUMNS *  0.85;
const CARD_HEIGHT = Math.round(CARD_WIDTH * 0.6);

const DEBOUNCE_DELAY = 500;

interface TVSearchScreenProps {
  onNavigateToDetail: (content: Movie | TVShow) => void;
}

export const TVSearchScreen: React.FC<TVSearchScreenProps> = ({
  onNavigateToDetail,
}) => {
  const { state, dispatch } = useAppContext();
  const tmdbService = useMemo(() => new TMDBService(), []);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [popularContent, setPopularContent] = useState<Content[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const searchResultsRef = useRef<Content[]>([]);
  useEffect(() => {
    searchResultsRef.current = state.content.searchResults;
  }, [state.content.searchResults]);

  const loadPopularContent = useCallback(async () => {
    try {
      dispatch({
        type: AppActionType.SET_LOADING,
        payload: { key: 'popularContent', loading: true },
      });
      const [moviesRes, tvRes] = await Promise.all([
        tmdbService.getPopularMovies(),
        tmdbService.getPopularTVShows(),
      ]);
      const combined = [
        ...moviesRes.results.slice(0, 12),
        ...tvRes.results.slice(0, 12),
      ].sort(() => Math.random() - 0.5);
      setPopularContent(combined);
      setError(null);
      preloadMixedContent(combined.slice(0, 16), { priority: 'low', batchSize: 16 });
    } catch (err) {
      setError(err as AppError);
    } finally {
      dispatch({
        type: AppActionType.SET_LOADING,
        payload: { key: 'popularContent', loading: false },
      });
    }
  }, [tmdbService, dispatch]);

  const performSearch = useCallback(
    async (query: string, page: number = 1, isLoadMore = false) => {
      try {
        if (isLoadMore) setIsLoadingMore(true);
        else setIsSearching(true);
        setError(null);

        const response = await tmdbService.searchMulti(query, page);
        const filtered = response.results.filter(
          (item: any) =>
            item.media_type !== 'person' &&
            item.poster_path &&
            (item.title || item.name),
        );

        if (isLoadMore) {
          const updated = [...searchResultsRef.current, ...filtered];
          dispatch({ type: AppActionType.SET_SEARCH_RESULTS, payload: updated });
        } else {
          dispatch({ type: AppActionType.SET_SEARCH_RESULTS, payload: filtered });
        }

        setCurrentPage(page);
        setHasMore(page < response.total_pages && response.total_pages > 1);
        if (filtered.length > 0) {
          preloadMixedContent(filtered.slice(0, 12), { priority: 'normal', batchSize: 12 });
        }
      } catch (err) {
        setError(err as AppError);
        if (!isLoadMore) {
          dispatch({ type: AppActionType.SET_SEARCH_RESULTS, payload: [] });
        }
      } finally {
        setIsSearching(false);
        setIsLoadingMore(false);
      }
    },
    [tmdbService, dispatch],
  );

  useEffect(() => {
    loadPopularContent();
  }, [loadPopularContent]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setDebouncedQuery('');
      setCurrentPage(1);
      setHasMore(true);
      dispatch({ type: AppActionType.SET_SEARCH_RESULTS, payload: [] });
      return;
    }
    const id = setTimeout(() => {
      setDebouncedQuery(trimmed);
      setCurrentPage(1);
      setHasMore(true);
      performSearch(trimmed, 1, false);
    }, DEBOUNCE_DELAY);
    return () => clearTimeout(id);
  }, [searchQuery, dispatch, performSearch]);

  const displayData = useMemo(
    () => (debouncedQuery ? state.content.searchResults : popularContent),
    [debouncedQuery, state.content.searchResults, popularContent],
  );

  const handleEndReached = useCallback(() => {
    if (debouncedQuery && hasMore && !isLoadingMore && !isSearching) {
      performSearch(debouncedQuery, currentPage + 1, true);
    }
  }, [debouncedQuery, hasMore, isLoadingMore, isSearching, currentPage, performSearch]);

  const renderItem = useCallback(
    ({ item }: { item: Content }) => (
      <TVContentCard
        item={item as Movie | TVShow}
        onPress={onNavigateToDetail}
        width={CARD_WIDTH}
        height={CARD_HEIGHT}
      />
    ),
    [onNavigateToDetail],
  );

  const isLoading = state.ui.loading.popularContent || isSearching;

  return (
    <View style={styles.container}>
      {/* Header + Search Input */}
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
        <View style={styles.searchBox}>
          <TextInput
            style={styles.input}
            placeholder="Search movies and TV shows…"
            placeholderTextColor="#555555"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessible
            accessibilityLabel="Search input"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              style={styles.clearBtn}
            >
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content Grid */}
      {isLoading && displayData.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.NETFLIX_RED} />
          <Text style={styles.loadingText}>
            {isSearching ? 'Searching…' : 'Loading…'}
          </Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error.message}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => debouncedQuery ? performSearch(debouncedQuery) : loadPopularContent()}
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : displayData.length === 0 && debouncedQuery ? (
        <View style={styles.center}>
          <Text style={styles.noResultsText}>No results for "{debouncedQuery}"</Text>
          <Text style={styles.noResultsSub}>Try a different search term</Text>
        </View>
      ) : (
        <>
          <Text style={styles.sectionTitle}>
            {debouncedQuery
              ? `Results for "${debouncedQuery}" (${displayData.length})`
              : 'Popular Movies & TV Shows'}
          </Text>
          <FlatList
            data={displayData}
            renderItem={renderItem}
            keyExtractor={item =>
              `${item.id}-${'title' in item ? 'movie' : 'tv'}`
            }
            numColumns={COLUMNS}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.row}
            showsVerticalScrollIndicator={false}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              isLoadingMore ? (
                <View style={styles.footer}>
                  <ActivityIndicator color={COLORS.NETFLIX_RED} />
                </View>
              ) : null
            }
          />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.NETFLIX_BLACK,
  },
  header: {
    paddingHorizontal: SIDE_PADDING,
    paddingTop: 32,
    paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  title: {
    fontSize: 34,
    fontWeight: 'bold',
    color: COLORS.NETFLIX_WHITE,
    marginBottom: 16,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#333333',
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    fontSize: 20,
    color: COLORS.NETFLIX_WHITE,
    paddingVertical: 14,
  },
  clearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  clearBtnText: {
    color: '#888888',
    fontSize: 18,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.NETFLIX_LIGHT_GRAY,
    paddingHorizontal: SIDE_PADDING,
    paddingVertical: 12,
  },
  grid: {
    paddingHorizontal: SIDE_PADDING,
    paddingBottom: 60,
    overflow: 'visible',
  },
  row: {
    marginBottom: CARD_GAP,
    gap: CARD_GAP,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: COLORS.NETFLIX_LIGHT_GRAY,
    fontSize: 18,
  },
  errorText: {
    color: '#FF4444',
    fontSize: 18,
    textAlign: 'center',
    marginHorizontal: 40,
  },
  retryBtn: {
    backgroundColor: COLORS.NETFLIX_RED,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  retryBtnText: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 18,
    fontWeight: '600',
  },
  noResultsText: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 22,
    fontWeight: '600',
  },
  noResultsSub: {
    color: COLORS.NETFLIX_LIGHT_GRAY,
    fontSize: 16,
  },
  footer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
});

export default TVSearchScreen;
