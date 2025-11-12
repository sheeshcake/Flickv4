import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  ReactNode,
} from 'react';
import {
  AppState,
  AppAction,
  AppActionType,
  AppContextType,
  WatchProgress,
  NetworkState,
} from '../types';
import {StorageService} from '../services/StorageService';
import {NetworkUtils} from '../utils/networkUtils';

// Initial state for the application
const initialState: AppState = {
  user: {
    preferences: {
      likedMovies: [],
      likedTVShows: [],
      continueWatching: [],
      theme: 'dark',
      autoplay: true,
      pictureInPicture: true,
      defaultSubtitleLanguage: undefined,
      autoSelectSubtitles: false,
    },
    likedContent: {
      movies: [],
      tvShows: [],
    },
    continueWatching: [],
  },
  content: {
    trendingMovies: [],
    trendingTVShows: [],
    searchResults: [],
    selectedContent: null,
  },
  ui: {
    theme: 'dark',
    loading: {
      initialLoad: true,
    },
    networkState: {
      isConnected: true,
      isInternetReachable: true,
      type: 'unknown',
    },
    offlineMode: false,
  },
};

// App reducer to handle state updates
const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    // User preference actions
    case AppActionType.SET_USER_PREFERENCES: {
      const mergedPreferences = {
        ...state.user.preferences,
        ...action.payload,
      };

      const continueWatching = Array.isArray(mergedPreferences.continueWatching)
        ? mergedPreferences.continueWatching
        : state.user.continueWatching;

      const sanitizedPreferences = {
        ...mergedPreferences,
        continueWatching,
      };

      const likedMovies = sanitizedPreferences.likedMovies || [];
      const likedTVShows = sanitizedPreferences.likedTVShows || [];
      const theme = sanitizedPreferences.theme || state.ui.theme;

      return {
        ...state,
        user: {
          ...state.user,
          preferences: sanitizedPreferences,
          likedContent: {
            movies: likedMovies,
            tvShows: likedTVShows,
          },
          continueWatching,
        },
        ui: {
          ...state.ui,
          theme,
        },
      };
    }

    case AppActionType.ADD_LIKED_CONTENT:
      const {id, contentType} = action.payload;
      const likedKey = contentType === 'movie' ? 'movies' : 'tvShows';
      const preferencesKey =
        contentType === 'movie' ? 'likedMovies' : 'likedTVShows';

      return {
        ...state,
        user: {
          ...state.user,
          likedContent: {
            ...state.user.likedContent,
            [likedKey]: [...state.user.likedContent[likedKey], id],
          },
          preferences: {
            ...state.user.preferences,
            [preferencesKey]: [...state.user.preferences[preferencesKey], id],
          },
        },
      };

    case AppActionType.REMOVE_LIKED_CONTENT:
      const {id: removeId, contentType: removeType} = action.payload;
      const removeLikedKey = removeType === 'movie' ? 'movies' : 'tvShows';
      const removePreferencesKey =
        removeType === 'movie' ? 'likedMovies' : 'likedTVShows';

      return {
        ...state,
        user: {
          ...state.user,
          likedContent: {
            ...state.user.likedContent,
            [removeLikedKey]: state.user.likedContent[removeLikedKey].filter(
              likedId => likedId !== removeId,
            ),
          },
          preferences: {
            ...state.user.preferences,
            [removePreferencesKey]: state.user.preferences[
              removePreferencesKey
            ].filter(likedId => likedId !== removeId),
          },
        },
      };

    case AppActionType.UPDATE_WATCH_PROGRESS:
      const progress: WatchProgress = action.payload;
      const existingProgressIndex = state.user.continueWatching.findIndex(
        item =>
          item.contentId === progress.contentId &&
          item.contentType === progress.contentType,
      );

      let updatedContinueWatching: WatchProgress[];
      if (existingProgressIndex >= 0) {
        updatedContinueWatching = [...state.user.continueWatching];
        updatedContinueWatching[existingProgressIndex] = progress;
      } else {
        updatedContinueWatching = [...state.user.continueWatching, progress];
      }

      // Sort by last watched date (most recent first)
      updatedContinueWatching.sort(
        (a, b) =>
          new Date(b.lastWatched).getTime() - new Date(a.lastWatched).getTime(),
      );

      return {
        ...state,
        user: {
          ...state.user,
          continueWatching: updatedContinueWatching,
          preferences: {
            ...state.user.preferences,
            continueWatching: updatedContinueWatching,
          },
        },
      };

    case AppActionType.SET_DEFAULT_SUBTITLE_LANGUAGE:
      return {
        ...state,
        user: {
          ...state.user,
          preferences: {
            ...state.user.preferences,
            defaultSubtitleLanguage: action.payload,
          },
        },
      };

    case AppActionType.SET_AUTO_SELECT_SUBTITLES:
      return {
        ...state,
        user: {
          ...state.user,
          preferences: {
            ...state.user.preferences,
            autoSelectSubtitles: action.payload,
          },
        },
      };

    // Content actions
    case AppActionType.SET_TRENDING_MOVIES:
      return {
        ...state,
        content: {
          ...state.content,
          trendingMovies: action.payload,
        },
      };

    case AppActionType.SET_TRENDING_TV_SHOWS:
      return {
        ...state,
        content: {
          ...state.content,
          trendingTVShows: action.payload,
        },
      };

    case AppActionType.SET_SEARCH_RESULTS:
      return {
        ...state,
        content: {
          ...state.content,
          searchResults: action.payload,
        },
      };

    case AppActionType.SET_SELECTED_CONTENT:
      return {
        ...state,
        content: {
          ...state.content,
          selectedContent: action.payload,
        },
      };

    // UI actions
    case AppActionType.SET_THEME:
      return {
        ...state,
        ui: {
          ...state.ui,
          theme: action.payload,
        },
        user: {
          ...state.user,
          preferences: {
            ...state.user.preferences,
            theme: action.payload,
          },
        },
      };

    case AppActionType.SET_LOADING:
      const {key, loading} = action.payload;
      return {
        ...state,
        ui: {
          ...state.ui,
          loading: {
            ...state.ui.loading,
            [key]: loading,
          },
        },
      };

    case AppActionType.SET_NETWORK_STATE:
      const networkState: NetworkState = action.payload;
      const isOffline =
        !networkState.isConnected || !networkState.isInternetReachable;

      return {
        ...state,
        ui: {
          ...state.ui,
          networkState,
          offlineMode: isOffline,
        },
      };

    case AppActionType.SET_OFFLINE_MODE:
      return {
        ...state,
        ui: {
          ...state.ui,
          offlineMode: action.payload,
        },
      };

    default:
      return state;
  }
};

// Create the context
const AppContext = createContext<AppContextType | undefined>(undefined);

// Context provider component
interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({children}) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Load initial data from storage on app start
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Set loading state
        dispatch({
          type: AppActionType.SET_LOADING,
          payload: {key: 'initialLoad', loading: true},
        });

        // Load user preferences
        const preferences = await StorageService.getUserPreferences();
        dispatch({
          type: AppActionType.SET_USER_PREFERENCES,
          payload: preferences,
        });

        // Liked content and continue watching are loaded as part of preferences
      } catch (error) {
        console.error('Failed to load initial data:', error);
      } finally {
        dispatch({
          type: AppActionType.SET_LOADING,
          payload: {key: 'initialLoad', loading: false},
        });
      }
    };

    loadInitialData();
  }, []);

  // Initialize network monitoring
  useEffect(() => {
    // Initialize network utilities
    NetworkUtils.initialize();

    // Get initial network state
    NetworkUtils.getCurrentState().then(networkState => {
      dispatch({
        type: AppActionType.SET_NETWORK_STATE,
        payload: networkState,
      });
    });

    // Listen for network changes
    const unsubscribe = NetworkUtils.addListener(networkState => {
      dispatch({
        type: AppActionType.SET_NETWORK_STATE,
        payload: networkState,
      });
    });

    return unsubscribe;
  }, []);

  // Persist user preferences whenever they change
  useEffect(() => {
    const persistPreferences = async () => {
      try {
        await StorageService.saveUserPreferences(state.user.preferences);
      } catch (error) {
        console.error('Failed to persist user preferences:', error);
      }
    };

    // Only persist if we have loaded initial data (avoid persisting initial empty state)
    if (!state.ui.loading.initialLoad) {
      persistPreferences();
    }
  }, [state.user.preferences, state.ui.loading.initialLoad]);

  const contextValue: AppContextType = {
    state,
    dispatch,
  };

  return (
    <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
  );
};

// Custom hook to use the app context
export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

export default AppContext;
