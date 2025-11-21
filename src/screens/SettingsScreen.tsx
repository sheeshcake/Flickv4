import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
} from 'react-native';
import type {MainTabScreenProps} from '../types/navigation';
import {useAppContext} from '../context/AppContext';
import {AppActionType} from '../types';
import {StorageService} from '../services/StorageService';
import {TMDBService} from '../services/TMDBService';
import {downloadService} from '../services/DownloadService';
import {SubtitleSettings} from '../components';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../types/navigation';

type Props = MainTabScreenProps<'Settings'>;

export const SettingsScreen: React.FC<Props> = () => {
  const {state, dispatch} = useAppContext();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [storageInfo, setStorageInfo] = useState<{
    keys: string[];
    totalSize: number;
  }>({keys: [], totalSize: 0});
  const [downloadStorageInfo, setDownloadStorageInfo] = useState({
    totalDownloads: 0,
    completedDownloads: 0,
    usedSpace: 0,
  });
  const [showLikedContent, setShowLikedContent] = useState(false);
  const [showSubtitleSettings, setShowSubtitleSettings] = useState(false);

  const isDarkTheme = state.ui.theme === 'dark';
  const appVersion = '1.0.1'; // From package.json

  // Load storage info on component mount
  useEffect(() => {
    loadStorageInfo();
  }, []);

  const loadStorageInfo = async () => {
    try {
      const info = await StorageService.getStorageInfo();
      setStorageInfo(info);

      const downloadInfo = await downloadService.getStorageInfo();
      setDownloadStorageInfo(downloadInfo);
    } catch (error) {
      console.error('Failed to load storage info:', error);
    }
  };

  // const handleThemeToggle = async (value: boolean) => {
  //   const newTheme = value ? 'dark' : 'light';

  //   try {
  //     // Update theme in context (this will also persist via useEffect in AppContext)
  //     dispatch({
  //       type: AppActionType.SET_THEME,
  //       payload: newTheme,
  //     });
  //   } catch (error) {
  //     console.error('Failed to update theme:', error);
  //     Alert.alert('Error', 'Failed to update theme preference');
  //   }
  // };

  const handleAutoplayToggle = async (value: boolean) => {
    try {
      const updatedPreferences = {
        ...state.user.preferences,
        autoplay: value,
      };

      dispatch({
        type: AppActionType.SET_USER_PREFERENCES,
        payload: updatedPreferences,
      });
    } catch (error) {
      console.error('Failed to update autoplay preference:', error);
      Alert.alert('Error', 'Failed to update autoplay preference');
    }
  };

  const handlePictureInPictureToggle = async (value: boolean) => {
    try {
      const updatedPreferences = {
        ...state.user.preferences,
        pictureInPicture: value,
      };

      dispatch({
        type: AppActionType.SET_USER_PREFERENCES,
        payload: updatedPreferences,
      });
    } catch (error) {
      console.error('Failed to update Picture-in-Picture preference:', error);
      Alert.alert('Error', 'Failed to update Picture-in-Picture preference');
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'This will clear all cached data including liked content and watch progress. Are you sure?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await StorageService.clearAllData();

              // Reset state to defaults
              dispatch({
                type: AppActionType.SET_USER_PREFERENCES,
                payload: {
                  likedMovies: [],
                  likedTVShows: [],
                  continueWatching: [],
                  theme: 'dark',
                  autoplay: true,
                  pictureInPicture: true,
                },
              });

              // Reload storage info
              await loadStorageInfo();

              Alert.alert('Success', 'Cache cleared successfully');
            } catch (error) {
              console.error('Failed to clear cache:', error);
              Alert.alert('Error', 'Failed to clear cache');
            }
          },
        },
      ],
    );
  };

  const handleResetPreferences = () => {
    Alert.alert(
      'Reset Preferences',
      'This will reset all your preferences to default values. Are you sure?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              const defaultPreferences = {
                likedMovies: [],
                likedTVShows: [],
                continueWatching: [],
                theme: 'dark' as const,
                autoplay: true,
                pictureInPicture: true,
              };

              dispatch({
                type: AppActionType.SET_USER_PREFERENCES,
                payload: defaultPreferences,
              });

              Alert.alert('Success', 'Preferences reset successfully');
            } catch (error) {
              console.error('Failed to reset preferences:', error);
              Alert.alert('Error', 'Failed to reset preferences');
            }
          },
        },
      ],
    );
  };

  const handleRemoveLikedContent = (
    contentId: number,
    contentType: 'movie' | 'tv',
  ) => {
    Alert.alert(
      'Remove from Liked',
      `Are you sure you want to remove this ${
        contentType === 'movie' ? 'movie' : 'TV show'
      } from your liked content?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            dispatch({
              type: AppActionType.REMOVE_LIKED_CONTENT,
              payload: {id: contentId, contentType},
            });
          },
        },
      ],
    );
  };

  const formatStorageSize = (bytes: number): string => {
    if (bytes === 0) {
      return '0 B';
    }
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const styles = getStyles(isDarkTheme);

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={isDarkTheme ? 'light-content' : 'dark-content'}
        backgroundColor={isDarkTheme ? '#000000' : '#FFFFFF'}
      />
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Manage your preferences</Text>
      </View>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}>
        <View style={styles.content}>

          {/* Theme Section */}
          <View style={styles.section}>
            {/* <View style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Dark Theme</Text>
                <Text style={styles.settingDescription}>
                  Use dark theme for better viewing in low light
                </Text>
              </View>
              <Switch
                value={isDarkTheme}
                onValueChange={handleThemeToggle}
                trackColor={{false: '#767577', true: '#E50914'}}
                thumbColor={isDarkTheme ? '#FFFFFF' : '#f4f3f4'}
              />
            </View> */}

            <View style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Autoplay</Text>
                <Text style={styles.settingDescription}>
                  Automatically play videos when selected
                </Text>
              </View>
              <Switch
                value={state.user.preferences.autoplay}
                onValueChange={handleAutoplayToggle}
                trackColor={{false: '#767577', true: '#E50914'}}
                thumbColor={
                  state.user.preferences.autoplay ? '#FFFFFF' : '#f4f3f4'
                }
              />
            </View>
            <View style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Enable Picture-in-Picture</Text>
                <Text style={styles.settingDescription}>
                  Allow videos to continue playing in a small window when you leave the app
                </Text>
              </View>
              <Switch
                value={state.user.preferences.pictureInPicture}
                onValueChange={handlePictureInPictureToggle}
                trackColor={{false: '#767577', true: '#E50914'}}
                thumbColor={
                  state.user.preferences.pictureInPicture ? '#FFFFFF' : '#f4f3f4'
                }
              />
            </View>
          </View>

          {/* Subtitle Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Subtitles</Text>

            <TouchableOpacity 
              style={styles.settingItem}
              onPress={() => setShowSubtitleSettings(true)}
            >
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Subtitle Preferences</Text>
                <Text style={styles.settingDescription}>
                  Configure default subtitle language and auto-selection
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>

            <View style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Current Settings</Text>
                <Text style={styles.settingDescription}>
                  {state.user.preferences.autoSelectSubtitles 
                    ? `Auto-select: ${state.user.preferences.defaultSubtitleLanguage?.toUpperCase() || 'Not set'}`
                    : 'Auto-select disabled'
                  }
                </Text>
              </View>
            </View>
          </View>

          {/* Storage Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Storage</Text>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>App Cache Size</Text>
              <Text style={styles.infoValue}>
                {formatStorageSize(storageInfo.totalSize)}
              </Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Downloads Size</Text>
              <Text style={styles.infoValue}>
                {formatStorageSize(downloadStorageInfo.usedSpace)}
              </Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Downloaded Items</Text>
              <Text style={styles.infoValue}>
                {downloadStorageInfo.completedDownloads} of {downloadStorageInfo.totalDownloads}
              </Text>
            </View>

            <TouchableOpacity 
              style={[styles.button, styles.secondaryButton]}
              onPress={() => navigation.navigate('Downloads')}
            >
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>
                Manage Downloads
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.button} onPress={handleClearCache}>
              <Text style={styles.buttonText}>Clear Cache</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={handleResetPreferences}>
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>
                Reset Preferences
              </Text>
            </TouchableOpacity>
          </View>

          {/* Liked Content Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My Content</Text>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Liked Movies</Text>
              <Text style={styles.infoValue}>
                {state.user.preferences.likedMovies.length}
              </Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Liked TV Shows</Text>
              <Text style={styles.infoValue}>
                {state.user.preferences.likedTVShows.length}
              </Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Continue Watching</Text>
              <Text style={styles.infoValue}>
                {state.user.continueWatching.length}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={() => setShowLikedContent(!showLikedContent)}>
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>
                {showLikedContent ? 'Hide' : 'Manage'} Liked Content
              </Text>
            </TouchableOpacity>

            {showLikedContent && (
              <View style={styles.likedContentContainer}>
                {state.user.preferences.likedMovies.length === 0 &&
                state.user.preferences.likedTVShows.length === 0 ? (
                  <Text style={styles.emptyText}>
                    No liked content yet. Start exploring and like some movies
                    or TV shows!
                  </Text>
                ) : (
                  <>
                    {state.user.preferences.likedMovies.length > 0 && (
                      <View style={styles.likedSection}>
                        <Text style={styles.likedSectionTitle}>
                          Liked Movies (
                          {state.user.preferences.likedMovies.length})
                        </Text>
                        {state.user.preferences.likedMovies.map(movieId => (
                          <LikedContentItem
                            key={`movie-${movieId}`}
                            contentId={movieId}
                            contentType="movie"
                            onRemove={handleRemoveLikedContent}
                            isDarkTheme={isDarkTheme}
                          />
                        ))}
                      </View>
                    )}

                    {state.user.preferences.likedTVShows.length > 0 && (
                      <View style={styles.likedSection}>
                        <Text style={styles.likedSectionTitle}>
                          Liked TV Shows (
                          {state.user.preferences.likedTVShows.length})
                        </Text>
                        {state.user.preferences.likedTVShows.map(tvShowId => (
                          <LikedContentItem
                            key={`tv-${tvShowId}`}
                            contentId={tvShowId}
                            contentType="tv"
                            onRemove={handleRemoveLikedContent}
                            isDarkTheme={isDarkTheme}
                          />
                        ))}
                      </View>
                    )}
                  </>
                )}
              </View>
            )}
          </View>

          {/* App Information Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>App Information</Text>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Version</Text>
              <Text style={styles.infoValue}>{appVersion}</Text>
            </View>

            {/* <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Build</Text>
              <Text style={styles.infoValue}>React Native</Text>
            </View> */}

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Data Source</Text>
              <Text style={styles.infoValue}>The Movie Database (TMDB)</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Subtitle Settings Modal */}
      <Modal
        visible={showSubtitleSettings}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSubtitleSettings(false)}
      >
        <SubtitleSettings onClose={() => setShowSubtitleSettings(false)} />
      </Modal>
    </View>
  );
};

// Component for displaying individual liked content items
interface LikedContentItemProps {
  contentId: number;
  contentType: 'movie' | 'tv';
  onRemove: (contentId: number, contentType: 'movie' | 'tv') => void;
  isDarkTheme: boolean;
}

const LikedContentItem: React.FC<LikedContentItemProps> = ({
  contentId,
  contentType,
  onRemove,
  isDarkTheme,
}) => {
  const [content, setContent] = useState<{
    title: string;
    poster_path: string;
    vote_average: number;
    release_date: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchContentDetails = async () => {
      try {
        setLoading(true);
        setError(false);

        // Create a TMDBService instance
        const tmdbService = new TMDBService();

        let contentData;
        if (contentType === 'movie') {
          const movieDetails = await tmdbService.getMovieDetails(contentId);
          contentData = {
            title: movieDetails.title,
            poster_path: movieDetails.poster_path,
            vote_average: movieDetails.vote_average,
            release_date: movieDetails.release_date,
          };
        } else {
          const tvDetails = await tmdbService.getTVShowDetails(contentId);
          contentData = {
            title: tvDetails.name,
            poster_path: tvDetails.poster_path,
            vote_average: tvDetails.vote_average,
            release_date: tvDetails.first_air_date,
          };
        }

        setContent(contentData);
      } catch (err) {
        console.error('Failed to fetch content details:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchContentDetails();
  }, [contentId, contentType]);

  const styles = getLikedItemStyles(isDarkTheme);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholder} />
        <View style={styles.info}>
          <View style={styles.titlePlaceholder} />
          <View style={styles.detailsPlaceholder} />
        </View>
        <View style={styles.removeButton}>
          <Text style={styles.removeButtonText}>•••</Text>
        </View>
      </View>
    );
  }

  if (error || !content) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholder} />
        <View style={styles.info}>
          <Text style={styles.title}>
            {contentType === 'movie' ? 'Movie' : 'TV Show'} (ID: {contentId})
          </Text>
          <Text style={styles.details}>Failed to load details</Text>
        </View>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => onRemove(contentId, contentType)}>
          <Text style={styles.removeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const imageUrl = content.poster_path
    ? `https://image.tmdb.org/t/p/w92${content.poster_path}`
    : '';

  const year = content.release_date
    ? new Date(content.release_date).getFullYear()
    : 'N/A';

  const rating = content.vote_average ? content.vote_average.toFixed(1) : 'N/A';

  return (
    <View style={styles.container}>
      <View style={styles.poster}>
        {imageUrl ? (
          <Text style={styles.posterPlaceholder}>📽️</Text>
        ) : (
          <Text style={styles.posterPlaceholder}>📽️</Text>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {content.title}
        </Text>
        <Text style={styles.details}>
          {year} • ⭐ {rating}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => onRemove(contentId, contentType)}>
        <Text style={styles.removeButtonText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
};

const getLikedItemStyles = (isDarkTheme: boolean) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginVertical: 4,
      backgroundColor: isDarkTheme ? '#1a1a1a' : '#f5f5f5',
      borderRadius: 8,
    },
    poster: {
      width: 40,
      height: 60,
      backgroundColor: isDarkTheme ? '#333333' : '#e0e0e0',
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    posterPlaceholder: {
      fontSize: 20,
    },
    placeholder: {
      width: 40,
      height: 60,
      backgroundColor: isDarkTheme ? '#333333' : '#e0e0e0',
      borderRadius: 4,
      marginRight: 12,
    },
    info: {
      flex: 1,
      marginRight: 12,
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
      color: isDarkTheme ? '#FFFFFF' : '#000000',
      marginBottom: 4,
    },
    details: {
      fontSize: 14,
      color: isDarkTheme ? '#CCCCCC' : '#666666',
    },
    titlePlaceholder: {
      height: 16,
      backgroundColor: isDarkTheme ? '#333333' : '#e0e0e0',
      borderRadius: 4,
      marginBottom: 4,
    },
    detailsPlaceholder: {
      height: 14,
      width: '60%',
      backgroundColor: isDarkTheme ? '#333333' : '#e0e0e0',
      borderRadius: 4,
    },
    removeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: '#E50914',
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: 'bold',
    },
  });

const getStyles = (isDarkTheme: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDarkTheme ? '#000000' : '#FFFFFF',
    },
    header: {
      paddingTop: 40,
      paddingHorizontal: 20,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      flex: 1,
      padding: 20,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: isDarkTheme ? '#FFFFFF' : '#000000',
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: isDarkTheme ? '#CCCCCC' : '#666666',
      marginBottom: 10,
    },
    section: {
      marginBottom: 30,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: isDarkTheme ? '#FFFFFF' : '#000000',
      marginBottom: 15,
    },
    settingItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 15,
      borderBottomWidth: 1,
      borderBottomColor: isDarkTheme ? '#333333' : '#E0E0E0',
    },
    settingInfo: {
      flex: 1,
      marginRight: 15,
    },
    settingLabel: {
      fontSize: 16,
      fontWeight: '500',
      color: isDarkTheme ? '#FFFFFF' : '#000000',
      marginBottom: 4,
    },
    settingDescription: {
      fontSize: 14,
      color: isDarkTheme ? '#CCCCCC' : '#666666',
    },
    infoItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: isDarkTheme ? '#333333' : '#E0E0E0',
    },
    infoLabel: {
      fontSize: 16,
      color: isDarkTheme ? '#FFFFFF' : '#000000',
    },
    infoValue: {
      fontSize: 16,
      color: isDarkTheme ? '#CCCCCC' : '#666666',
      fontWeight: '500',
    },
    button: {
      backgroundColor: '#E50914',
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 8,
      marginTop: 15,
      alignItems: 'center',
    },
    buttonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    secondaryButton: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: isDarkTheme ? '#666666' : '#CCCCCC',
    },
    secondaryButtonText: {
      color: isDarkTheme ? '#FFFFFF' : '#000000',
    },
    likedContentContainer: {
      marginTop: 15,
      padding: 15,
      backgroundColor: isDarkTheme ? '#1a1a1a' : '#f8f8f8',
      borderRadius: 8,
    },
    likedSection: {
      marginBottom: 20,
    },
    likedSectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: isDarkTheme ? '#FFFFFF' : '#000000',
      marginBottom: 10,
    },
    emptyText: {
      fontSize: 14,
      color: isDarkTheme ? '#CCCCCC' : '#666666',
      textAlign: 'center',
      fontStyle: 'italic',
      paddingVertical: 20,
    },
    chevron: {
      fontSize: 24,
      color: isDarkTheme ? '#CCCCCC' : '#666666',
      marginLeft: 8,
    },
  });
