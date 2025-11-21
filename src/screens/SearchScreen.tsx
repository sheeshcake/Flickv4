import React, {useState, useEffect, useCallback, useMemo, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TextInput,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import type {MainTabScreenProps} from '../types/navigation';
import {useAppContext} from '../context/AppContext';
import {TMDBService} from '../services/TMDBService';
import {ContentCard} from '../components/ContentCard';

import {OfflineBanner} from '../components/OfflineBanner';
import {AppActionType, Content, AppError} from '../types';
import {preloadMixedContent} from '../utils/imagePreloader';
import {
  getGridItemWidth,
  spacing,
  typography,
  getSafeAreaPadding,
} from '../utils/responsive';
import {
  accessibilityLabels,
  accessibilityHints,
  accessibilityRoles,
} from '../utils/accessibility';
import {commonStyles} from '../utils/theme';

type Props = MainTabScreenProps<'Search'>;

const CARD_WIDTH = getGridItemWidth(3, spacing.md * 1.2);
const DEBOUNCE_DELAY = 1000; // 500ms debounce
const safeArea = getSafeAreaPadding();

export const SearchScreen: React.FC<Props> = ({navigation}) => {
  const {state, dispatch} = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [popularContent, setPopularContent] = useState<Content[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMorePages, setHasMorePages] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const isOffline = state.ui.offlineMode;

  // Use ref to track current search results to avoid stale closures
  const searchResultsRef = useRef<Content[]>([]);
  
  // Keep ref in sync with state
  useEffect(() => {
    searchResultsRef.current = state.content.searchResults;
  }, [state.content.searchResults]);

  const tmdbService = useMemo(() => new TMDBService(), []);

  const loadPopularContent = useCallback(async () => {
    try {
      dispatch({
        type: AppActionType.SET_LOADING,
        payload: {key: 'popularContent', loading: true},
      });

      const [moviesResponse, tvShowsResponse] = await Promise.all([
        tmdbService.getPopularMovies(),
        tmdbService.getPopularTVShows(),
      ]);

      // Combine and shuffle popular content
      const combined = [
        ...moviesResponse.results.slice(0, 10),
        ...tvShowsResponse.results.slice(0, 10),
      ];

      // Shuffle the array for variety
      const shuffled = combined.sort(() => Math.random() - 0.5);
      setPopularContent(shuffled);
      setError(null);

      // Preload images for popular content
      preloadMixedContent(shuffled.slice(0, 15), {
        priority: 'low',
        batchSize: 15,
      });
    } catch (err) {
      console.error('Failed to load popular content:', err);
      setError(err as AppError);
    } finally {
      dispatch({
        type: AppActionType.SET_LOADING,
        payload: {key: 'popularContent', loading: false},
      });
    }
  }, [tmdbService, dispatch]);

  const performSearch = useCallback(
    async (query: string, page: number = 1, isLoadMore: boolean = false) => {
      try {
        if (isLoadMore) {
          setIsLoadingMore(true);
        } else {
          setIsSearching(true);
        }
        setError(null);

        const response = await tmdbService.searchMulti(query, page);

        // Filter out person results and content without posters
        const filteredResults = response.results.filter(
          (item: any) =>
            item.media_type !== 'person' &&
            item.poster_path &&
            (item.title || item.name), // Ensure it has a title/name
        );

        if (isLoadMore) {
          // Append to existing results using ref for current state
          const updatedResults = [...searchResultsRef.current, ...filteredResults];
          dispatch({
            type: AppActionType.SET_SEARCH_RESULTS,
            payload: updatedResults,
          });
        } else {
          // Replace results for new search
          dispatch({
            type: AppActionType.SET_SEARCH_RESULTS,
            payload: filteredResults,
          });
        }

        // Update pagination state
        setCurrentPage(page);
        setHasMorePages(page < response.total_pages && response.total_pages > 1);

        // Preload images for search results
        if (filteredResults.length > 0) {
          preloadMixedContent(filteredResults.slice(0, 12), {
            priority: 'normal',
            batchSize: 12,
          });
        }
      } catch (err) {
        console.error('Search failed:', err);
        setError(err as AppError);
        if (!isLoadMore) {
          dispatch({
            type: AppActionType.SET_SEARCH_RESULTS,
            payload: [],
          });
        }
      } finally {
        setIsSearching(false);
        setIsLoadingMore(false);
      }
    },
    [tmdbService, dispatch],
  );

  const loadMoreResults = useCallback(() => {
    if (!isLoadingMore && hasMorePages && debouncedQuery && !isSearching) {
      performSearch(debouncedQuery, currentPage + 1, true);
    }
  }, [isLoadingMore, hasMorePages, debouncedQuery, currentPage, isSearching, performSearch]);

  // Load popular content when component mounts
  useEffect(() => {
    loadPopularContent();
  }, [loadPopularContent]);

  // Debounced search effect
  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    
    // Clear results immediately if query is empty
    if (!trimmedQuery) {
      setDebouncedQuery('');
      setCurrentPage(1);
      setHasMorePages(true);
      dispatch({
        type: AppActionType.SET_SEARCH_RESULTS,
        payload: [],
      });
      return;
    }
    
    // Only apply debounce when query length is 1 or more
    if (trimmedQuery.length >= 1) {
      const timeoutId = setTimeout(() => {
        setDebouncedQuery(trimmedQuery);
        setCurrentPage(1);
        setHasMorePages(true);
        performSearch(trimmedQuery, 1, false);
      }, DEBOUNCE_DELAY);

      return () => clearTimeout(timeoutId);
    }
  }, [searchQuery, dispatch, performSearch]);

  const handleContentPress = useCallback(
    (content: Content) => {
      navigation.navigate('Detail', {content});
    },
    [navigation],
  );

  const handleRetry = useCallback(() => {
    if (debouncedQuery) {
      setCurrentPage(1);
      setHasMorePages(true);
      performSearch(debouncedQuery, 1, false);
    } else {
      loadPopularContent();
    }
  }, [debouncedQuery, performSearch, loadPopularContent]);

  const renderContent = useCallback(
    ({item}: {item: Content}) => (
      <ContentCard
        item={item}
        onPress={handleContentPress}
        size="small"
        style={styles.gridItem}
      />
    ),
    [handleContentPress],
  );

  // Memoize search input handler to prevent re-creation
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
  }, []);

  const SearchHeader = useMemo(
    () => (
      <View style={styles.header}>
        <Text
          style={styles.title}
          accessible={true}
          accessibilityRole={accessibilityRoles.header}>
          Search
        </Text>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search movies and TV shows..."
            placeholderTextColor="#666666"
            value={searchQuery}
            onChangeText={handleSearchChange}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessible={true}
            accessibilityLabel={accessibilityLabels.searchInput}
            accessibilityHint={accessibilityHints.searchInput}
            accessibilityRole={accessibilityRoles.search}
          />
        </View>
      </View>
    ),
    [searchQuery, handleSearchChange],
  );

  const renderEmptyState = useCallback(() => {
    if (isSearching) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#E50914" />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error.message}</Text>
          {error.code !== 'OFFLINE_SEARCH' && (
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          )}
          {error.code === 'OFFLINE_SEARCH' && (
            <Text style={styles.offlineSearchText}>
              Connect to internet to search for content
            </Text>
          )}
        </View>
      );
    }

    if (debouncedQuery && state.content.searchResults.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.noResultsText}>No results found</Text>
          <Text style={styles.noResultsSubtext}>
            Try searching for something else
          </Text>
        </View>
      );
    }

    return null;
  }, [isSearching, error, handleRetry, debouncedQuery, state.content.searchResults.length]);

  const displayData = useMemo(
    () => (debouncedQuery ? state.content.searchResults : popularContent),
    [debouncedQuery, state.content.searchResults, popularContent],
  );

  const isLoading = state.ui.loading.popularContent || isSearching;

  const OfflineIndicatorComponent = useMemo(() => {
    if (isOffline && displayData.length > 0) {
      return (
        <View style={styles.offlineIndicator}>
          <Text style={styles.offlineText}>
            📱 Showing cached content - Connect to search for new content
          </Text>
        </View>
      );
    }
    return null;
  }, [isOffline, displayData.length]);

  const SectionHeaderComponent = useMemo(() => {
    if (debouncedQuery) {
      return state.content.searchResults.length > 0 ? (
        <Text style={styles.sectionTitle}>
          Search Results ({state.content.searchResults.length})
        </Text>
      ) : null;
    }

    return popularContent.length > 0 ? (
      <Text style={styles.sectionTitle}>Popular Movies & TV Shows</Text>
    ) : null;
  }, [debouncedQuery, state.content.searchResults.length, popularContent.length]);

  const ListHeaderComponent = useMemo(() => (
    <View>
      {OfflineIndicatorComponent}
      {SectionHeaderComponent}
    </View>
  ), [OfflineIndicatorComponent, SectionHeaderComponent]);

  const ListFooterComponent = useMemo(() => {
    if (isLoadingMore && debouncedQuery) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color="#E50914" />
          <Text style={styles.footerLoaderText}>Loading more...</Text>
        </View>
      );
    }
    return null;
  }, [isLoadingMore, debouncedQuery]);

  const handleEndReached = useCallback(() => {
    if (debouncedQuery && hasMorePages && !isLoadingMore && !isSearching) {
      loadMoreResults();
    }
  }, [debouncedQuery, hasMorePages, isLoadingMore, isSearching, loadMoreResults]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Offline Banner */}
      <OfflineBanner onRetry={handleRetry} />

      {/* Sticky Header with Search Bar */}
      {SearchHeader}

      <FlatList
        data={displayData}
        renderItem={renderContent}
        keyExtractor={item => `${item.id}-${'title' in item ? 'movie' : 'tv'}`}
        numColumns={3}
        ListHeaderComponent={ListHeaderComponent}
        ListFooterComponent={ListFooterComponent}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={[
          styles.contentContainer,
          displayData.length === 0 && styles.emptyContentContainer,
        ]}
        columnWrapperStyle={displayData.length > 0 ? styles.row : undefined}
        showsVerticalScrollIndicator={false}
        refreshing={isLoading}
        onRefresh={debouncedQuery ? undefined : loadPopularContent}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </View>
  );
};
const styles = StyleSheet.create({
  container: {
    ...commonStyles.container,
  },
  contentContainer: {
    paddingBottom: spacing.lg,
  },
  emptyContentContainer: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: safeArea.top + spacing.lg,
    paddingBottom: spacing.lg,
    backgroundColor: '#000000',
  },
  title: {
    fontSize: typography.h2,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: spacing.lg,
  },
  searchContainer: {
    marginBottom: spacing.sm,
  },
  searchInput: {
    ...commonStyles.textInput,
    fontSize: typography.body,
  },
  sectionTitle: {
    fontSize: typography.h5,
    fontWeight: '600',
    color: '#FFFFFF',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  row: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  gridItem: {
    width: CARD_WIDTH,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 300,
  },
  loadingText: {
    color: '#CCCCCC',
    fontSize: typography.body,
    marginTop: spacing.sm,
  },
  errorText: {
    ...commonStyles.errorText,
    marginBottom: spacing.lg,
  },
  retryButton: {
    ...commonStyles.primaryButton,
  },
  retryButtonText: {
    ...commonStyles.primaryButtonText,
  },
  noResultsText: {
    color: '#FFFFFF',
    fontSize: typography.h5,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  noResultsSubtext: {
    color: '#CCCCCC',
    fontSize: typography.body,
    textAlign: 'center',
  },
  offlineIndicator: {
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    borderColor: '#FF6B35',
    borderWidth: 1,
    borderRadius: spacing.sm,
    padding: spacing.sm + 4,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  offlineText: {
    color: '#FF6B35',
    fontSize: typography.body,
    textAlign: 'center',
    fontWeight: '500',
  },
  offlineSearchText: {
    color: '#CCCCCC',
    fontSize: typography.body,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  footerLoader: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLoaderText: {
    color: '#CCCCCC',
    fontSize: typography.small,
    marginTop: spacing.sm,
  },
});
