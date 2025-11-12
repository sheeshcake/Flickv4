import {useCallback} from 'react';
import {useAppContext} from '../context/AppContext';
import {
  AppActionType,
  Movie,
  TVShow,
  WatchProgress,
  UserPreferences,
} from '../types';
import {StorageService} from '../services/StorageService';

/**
 * Custom hook for managing app state with convenient action creators
 */
export const useAppState = () => {
  const {state, dispatch} = useAppContext();

  // User preference actions
  const setUserPreferences = useCallback(
    (preferences: UserPreferences) => {
      dispatch({
        type: AppActionType.SET_USER_PREFERENCES,
        payload: preferences,
      });
    },
    [dispatch],
  );

  const addLikedContent = useCallback(
    async (id: number, contentType: 'movie' | 'tv') => {
      try {
        // Update local storage
        await StorageService.addLikedContent(id, contentType);

        // Update state
        dispatch({
          type: AppActionType.ADD_LIKED_CONTENT,
          payload: {id, contentType},
        });
      } catch (error) {
        console.error('Failed to add liked content:', error);
        throw error;
      }
    },
    [dispatch],
  );

  const removeLikedContent = useCallback(
    async (id: number, contentType: 'movie' | 'tv') => {
      try {
        // Update local storage
        await StorageService.removeLikedContent(id, contentType);

        // Update state
        dispatch({
          type: AppActionType.REMOVE_LIKED_CONTENT,
          payload: {id, contentType},
        });
      } catch (error) {
        console.error('Failed to remove liked content:', error);
        throw error;
      }
    },
    [dispatch],
  );

  const updateWatchProgress = useCallback(
    async (progress: WatchProgress) => {
      try {
        // Update local storage
        await StorageService.updateWatchProgress(progress);

        // Update state
        dispatch({
          type: AppActionType.UPDATE_WATCH_PROGRESS,
          payload: progress,
        });
      } catch (error) {
        console.error('Failed to update watch progress:', error);
        throw error;
      }
    },
    [dispatch],
  );

  const removeFromContinueWatching = useCallback(
    async (contentId: number, contentType: 'movie' | 'tv') => {
      try {
        // Update local storage
        await StorageService.removeFromContinueWatching(contentId, contentType);

        // Update state by filtering out the item
        const updatedContinueWatching = state.user.continueWatching.filter(
          item =>
            !(item.contentId === contentId && item.contentType === contentType),
        );

        const updatedPreferences = {
          ...state.user.preferences,
          continueWatching: updatedContinueWatching,
        };

        dispatch({
          type: AppActionType.SET_USER_PREFERENCES,
          payload: updatedPreferences,
        });
      } catch (error) {
        console.error('Failed to remove from continue watching:', error);
        throw error;
      }
    },
    [dispatch, state.user.continueWatching, state.user.preferences],
  );

  // Content actions
  const setTrendingMovies = useCallback(
    (movies: Movie[]) => {
      dispatch({
        type: AppActionType.SET_TRENDING_MOVIES,
        payload: movies,
      });
    },
    [dispatch],
  );

  const setTrendingTVShows = useCallback(
    (tvShows: TVShow[]) => {
      dispatch({
        type: AppActionType.SET_TRENDING_TV_SHOWS,
        payload: tvShows,
      });
    },
    [dispatch],
  );

  const setSearchResults = useCallback(
    (results: (Movie | TVShow)[]) => {
      dispatch({
        type: AppActionType.SET_SEARCH_RESULTS,
        payload: results,
      });
    },
    [dispatch],
  );

  const setSelectedContent = useCallback(
    (content: Movie | TVShow | null) => {
      dispatch({
        type: AppActionType.SET_SELECTED_CONTENT,
        payload: content,
      });
    },
    [dispatch],
  );

  // UI actions
  const setTheme = useCallback(
    async (theme: 'light' | 'dark') => {
      try {
        // Update local storage
        await StorageService.saveTheme(theme);

        // Update state
        dispatch({
          type: AppActionType.SET_THEME,
          payload: theme,
        });
      } catch (error) {
        console.error('Failed to save theme:', error);
        throw error;
      }
    },
    [dispatch],
  );

  const setLoading = useCallback(
    (key: string, loading: boolean) => {
      dispatch({
        type: AppActionType.SET_LOADING,
        payload: {key, loading},
      });
    },
    [dispatch],
  );

  // Subtitle preference actions
  const setDefaultSubtitleLanguage = useCallback(
    async (language?: string) => {
      try {
        // Update state
        dispatch({
          type: AppActionType.SET_DEFAULT_SUBTITLE_LANGUAGE,
          payload: language,
        });
      } catch (error) {
        console.error('Failed to set default subtitle language:', error);
        throw error;
      }
    },
    [dispatch],
  );

  const setAutoSelectSubtitles = useCallback(
    async (autoSelect: boolean) => {
      try {
        // Update state
        dispatch({
          type: AppActionType.SET_AUTO_SELECT_SUBTITLES,
          payload: autoSelect,
        });
      } catch (error) {
        console.error('Failed to set auto select subtitles:', error);
        throw error;
      }
    },
    [dispatch],
  );

  // Utility functions
  const isContentLiked = useCallback(
    (id: number, contentType: 'movie' | 'tv'): boolean => {
      const likedList =
        contentType === 'movie'
          ? state.user.likedContent.movies
          : state.user.likedContent.tvShows;
      return likedList.includes(id);
    },
    [state.user.likedContent],
  );

  const getContentWatchProgress = useCallback(
    (contentId: number, contentType: 'movie' | 'tv'): WatchProgress | null => {
      return (
        state.user.continueWatching.find(
          item =>
            item.contentId === contentId && item.contentType === contentType,
        ) || null
      );
    },
    [state.user.continueWatching],
  );

  const isLoading = useCallback(
    (key: string): boolean => {
      return state.ui.loading[key] || false;
    },
    [state.ui.loading],
  );

  return {
    // State
    state,

    // User actions
    setUserPreferences,
    addLikedContent,
    removeLikedContent,
    updateWatchProgress,
    removeFromContinueWatching,

    // Content actions
    setTrendingMovies,
    setTrendingTVShows,
    setSearchResults,
    setSelectedContent,

    // UI actions
    setTheme,
    setLoading,

    // Subtitle preference actions
    setDefaultSubtitleLanguage,
    setAutoSelectSubtitles,

    // Utility functions
    isContentLiked,
    getContentWatchProgress,
    isLoading,
  };
};
