import React, {useState, useEffect, useCallback, useMemo} from 'react';
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

const CARD_WIDTH = getGridItemWidth(3, spacing.md * 1.5);
const DEBOUNCE_DELAY = 500; // 500ms debounce
const safeArea = getSafeAreaPadding();

export const SearchScreen: React.FC<Props> = ({navigation}) => {
  const {state, dispatch} = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [popularContent, setPopularContent] = useState<Content[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const isOffline = state.ui.offlineMode;

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
    async (query: string) => {
      try {
        setIsSearching(true);
        setError(null);

        const response = await tmdbService.searchMulti(query);

        // Filter out person results and content without posters
        const filteredResults = response.results.filter(
          (item: any) =>
            item.media_type !== 'person' &&
            item.poster_path &&
            (item.title || item.name), // Ensure it has a title/name
        );

        dispatch({
          type: AppActionType.SET_SEARCH_RESULTS,
          payload: filteredResults,
        });

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
        dispatch({
          type: AppActionType.SET_SEARCH_RESULTS,
          payload: [],
        });
      } finally {
        setIsSearching(false);
      }
    },
    [tmdbService, dispatch],
  );

  // Load popular content when component mounts
  useEffect(() => {
    loadPopularContent();
  }, [loadPopularContent]);

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        performSearch(searchQuery.trim());
      } else {
        // Clear search results when query is empty
        dispatch({
          type: AppActionType.SET_SEARCH_RESULTS,
          payload: [],
        });
      }
    }, DEBOUNCE_DELAY);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, performSearch, dispatch]);

  const handleContentPress = useCallback(
    (content: Content) => {
      navigation.navigate('Detail', {content});
    },
    [navigation],
  );

  const handleRetry = useCallback(() => {
    if (searchQuery.trim()) {
      performSearch(searchQuery.trim());
    } else {
      loadPopularContent();
    }
  }, [searchQuery, performSearch, loadPopularContent]);

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

  const renderHeader = () => (
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
          onChangeText={setSearchQuery}
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
  );

  const renderEmptyState = () => {
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

    if (searchQuery.trim() && state.content.searchResults.length === 0) {
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
  };

  const renderSectionHeader = () => {
    if (searchQuery.trim()) {
      return state.content.searchResults.length > 0 ? (
        <Text style={styles.sectionTitle}>
          Search Results ({state.content.searchResults.length})
        </Text>
      ) : null;
    }

    return popularContent.length > 0 ? (
      <Text style={styles.sectionTitle}>Popular Movies & TV Shows</Text>
    ) : null;
  };

  const displayData = searchQuery.trim()
    ? state.content.searchResults
    : popularContent;

  const isLoading = state.ui.loading.popularContent || isSearching;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Offline Banner */}
      <OfflineBanner onRetry={handleRetry} />

      <FlatList
        data={displayData}
        renderItem={renderContent}
        keyExtractor={item => `${item.id}-${'title' in item ? 'movie' : 'tv'}`}
        numColumns={3}
        ListHeaderComponent={
          <View>
            {renderHeader()}
            {isOffline && displayData.length > 0 && (
              <View style={styles.offlineIndicator}>
                <Text style={styles.offlineText}>
                  📱 Showing cached content - Connect to search for new content
                </Text>
              </View>
            )}
            {renderSectionHeader()}
          </View>
        }
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={[
          styles.contentContainer,
          displayData.length === 0 && styles.emptyContentContainer,
        ]}
        columnWrapperStyle={displayData.length > 0 ? styles.row : undefined}
        showsVerticalScrollIndicator={false}
        refreshing={isLoading}
        onRefresh={searchQuery.trim() ? undefined : loadPopularContent}
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  gridItem: {
    width: CARD_WIDTH,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl + spacing.sm,
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
});
