import {useMemo} from 'react';
import {useAppContext} from '../context/AppContext';
import {Movie, TVShow, WatchProgress, UserPreferences} from '../types';

/**
 * Custom hooks for selecting specific parts of the app state
 * These selectors help optimize re-renders by only subscribing to specific state slices
 */

// User-related selectors
export const useUserPreferences = (): UserPreferences => {
  const {state} = useAppContext();
  return state.user.preferences;
};

export const useLikedContent = () => {
  const {state} = useAppContext();
  return useMemo(
    () => ({
      movies: state.user.likedContent.movies,
      tvShows: state.user.likedContent.tvShows,
      totalLiked:
        state.user.likedContent.movies.length +
        state.user.likedContent.tvShows.length,
    }),
    [state.user.likedContent],
  );
};

export const useContinueWatching = (): WatchProgress[] => {
  const {state} = useAppContext();
  return state.user.continueWatching;
};

// Content-related selectors
export const useTrendingMovies = (): Movie[] => {
  const {state} = useAppContext();
  return state.content.trendingMovies;
};

export const useTrendingTVShows = (): TVShow[] => {
  const {state} = useAppContext();
  return state.content.trendingTVShows;
};

export const useSearchResults = (): (Movie | TVShow)[] => {
  const {state} = useAppContext();
  return state.content.searchResults;
};

export const useSelectedContent = (): Movie | TVShow | null => {
  const {state} = useAppContext();
  return state.content.selectedContent;
};

// UI-related selectors
export const useTheme = (): 'light' | 'dark' => {
  const {state} = useAppContext();
  return state.ui.theme;
};

export const useLoadingStates = () => {
  const {state} = useAppContext();
  return useMemo(
    () => ({
      loading: state.ui.loading,
      isAnyLoading: Object.values(state.ui.loading).some(loading => loading),
      isLoading: (key: string) => state.ui.loading[key] || false,
    }),
    [state.ui.loading],
  );
};

export const useNetworkState = () => {
  const {state} = useAppContext();
  return useMemo(
    () => ({
      networkState: state.ui.networkState,
      isOffline: state.ui.offlineMode,
      isOnline: !state.ui.offlineMode,
    }),
    [state.ui.networkState, state.ui.offlineMode],
  );
};

// Combined selector for app state
export const useAppSelectors = () => {
  const {state} = useAppContext();
  return useMemo(
    () => ({
      selectedContent: state.content.selectedContent,
      theme: state.ui.theme,
    }),
    [
      state.content.selectedContent,
      state.ui.theme,
    ],
  );
};

// Combined selectors for common use cases
export const useHomeScreenData = () => {
  const {state} = useAppContext();
  return useMemo(
    () => ({
      trendingMovies: state.content.trendingMovies,
      trendingTVShows: state.content.trendingTVShows,
      continueWatching: state.user.continueWatching,
      isLoading: state.ui.loading.homeScreen || false,
      theme: state.ui.theme,
      isOffline: state.ui.offlineMode,
      networkState: state.ui.networkState,
    }),
    [
      state.content.trendingMovies,
      state.content.trendingTVShows,
      state.user.continueWatching,
      state.ui.loading.homeScreen,
      state.ui.theme,
      state.ui.offlineMode,
      state.ui.networkState,
    ],
  );
};

export const useSearchScreenData = () => {
  const {state} = useAppContext();
  return useMemo(
    () => ({
      searchResults: state.content.searchResults,
      isLoading: state.ui.loading.search || false,
      theme: state.ui.theme,
      isOffline: state.ui.offlineMode,
      networkState: state.ui.networkState,
    }),
    [
      state.content.searchResults,
      state.ui.loading.search,
      state.ui.theme,
      state.ui.offlineMode,
      state.ui.networkState,
    ],
  );
};

export const useSettingsScreenData = () => {
  const {state} = useAppContext();
  return useMemo(
    () => ({
      preferences: state.user.preferences,
      likedContent: state.user.likedContent,
      theme: state.ui.theme,
      isLoading: state.ui.loading.settings || false,
    }),
    [
      state.user.preferences,
      state.user.likedContent,
      state.ui.theme,
      state.ui.loading.settings,
    ],
  );
};

// Content-specific selectors
export const useContentLikeStatus = (
  contentId: number,
  contentType: 'movie' | 'tv',
): boolean => {
  const {state} = useAppContext();
  return useMemo(() => {
    const likedList =
      contentType === 'movie'
        ? state.user.likedContent.movies
        : state.user.likedContent.tvShows;
    return likedList.includes(contentId);
  }, [state.user.likedContent, contentId, contentType]);
};

export const useContentWatchProgress = (
  contentId: number,
  contentType: 'movie' | 'tv',
): WatchProgress | null => {
  const {state} = useAppContext();
  return useMemo(() => {
    return (
      state.user.continueWatching.find(
        item =>
          item.contentId === contentId && item.contentType === contentType,
      ) || null
    );
  }, [state.user.continueWatching, contentId, contentType]);
};

// Statistics selectors
export const useAppStatistics = () => {
  const {state} = useAppContext();
  return useMemo(
    () => ({
      totalLikedMovies: state.user.likedContent.movies.length,
      totalLikedTVShows: state.user.likedContent.tvShows.length,
      totalLikedContent:
        state.user.likedContent.movies.length +
        state.user.likedContent.tvShows.length,
      totalContinueWatching: state.user.continueWatching.length,
      totalTrendingMovies: state.content.trendingMovies.length,
      totalTrendingTVShows: state.content.trendingTVShows.length,
      totalSearchResults: state.content.searchResults.length,
      activeLoadingOperations: Object.values(state.ui.loading).filter(
        loading => loading,
      ).length,
    }),
    [
      state.user.likedContent,
      state.user.continueWatching.length,
      state.content.trendingMovies.length,
      state.content.trendingTVShows.length,
      state.content.searchResults.length,
      state.ui.loading,
    ],
  );
};
