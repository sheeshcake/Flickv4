/**
 * TV Settings Screen
 * Large, easy-to-navigate settings for TV remote control
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { TVSettingItem, TVSidebar } from '../../components/tv';
import { useAppContext } from '../../context/AppContext';
import { AppActionType } from '../../types';
import { StorageService } from '../../services/StorageService';
import { version as appVersion } from '../../../package.json';

interface TVSettingsScreenProps {
  navigation: any;
}

export const TVSettingsScreen: React.FC<TVSettingsScreenProps> = ({ navigation }) => {
  const { state, dispatch } = useAppContext();
  const [storageInfo, setStorageInfo] = useState<{ keys: string[]; totalSize: number }>({ keys: [], totalSize: 0 });

  useEffect(() => {
    loadStorageInfo();
  }, []);

  const loadStorageInfo = async () => {
    try {
      const info = await StorageService.getStorageInfo();
      setStorageInfo(info);
    } catch (error) {
      console.error('Failed to load storage info:', error);
    }
  };

  const handleAutoplayToggle = useCallback(
    async (value: boolean) => {
      try {
        dispatch({
          type: AppActionType.SET_USER_PREFERENCES,
          payload: {
            ...state.user.preferences,
            autoplay: value,
          },
        });
      } catch (error) {
        console.error('Failed to update autoplay:', error);
        Alert.alert('Error', 'Failed to update setting');
      }
    },
    [dispatch, state.user.preferences]
  );

  const handlePictureInPictureToggle = useCallback(
    async (value: boolean) => {
      try {
        dispatch({
          type: AppActionType.SET_USER_PREFERENCES,
          payload: {
            ...state.user.preferences,
            pictureInPicture: value,
          },
        });
      } catch (error) {
        console.error('Failed to update PiP:', error);
        Alert.alert('Error', 'Failed to update setting');
      }
    },
    [dispatch, state.user.preferences]
  );

  const handleClearCache = useCallback(() => {
    Alert.alert(
      'Clear Cache',
      'This will clear all cached data. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await StorageService.clearAllData();
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
              await loadStorageInfo();
              Alert.alert('Success', 'Cache cleared successfully');
            } catch {
              Alert.alert('Error', 'Failed to clear cache');
            }
          },
        },
      ]
    );
  }, [dispatch]);

  const navItems = [
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'search', label: 'Search', icon: 'magnify' },
    { key: 'downloads', label: 'Downloads', icon: 'download' },
    { key: 'settings', label: 'Settings', icon: 'cog' },
  ];

  const handleNavPress = (key: string) => {
    switch (key) {
      case 'home':
        navigation.navigate('Main');
        break;
      case 'search':
        navigation.navigate('Search');
        break;
      case 'downloads':
        navigation.navigate('Downloads');
        break;
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <View style={styles.container}>
      {/* Sidebar */}
      <TVSidebar
        items={navItems}
        activeKey="settings"
        onItemPress={handleNavPress}
      />

      {/* Main Content */}
      <View style={styles.mainContent}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Settings</Text>

          {/* Playback Section */}
          <Text style={styles.sectionTitle}>Playback</Text>
          <TVSettingItem
            title="Autoplay"
            description="Automatically play next episode"
            icon="play-circle"
            type="toggle"
            value={state.user.preferences.autoplay}
            onToggle={handleAutoplayToggle}
            hasTVPreferredFocus
          />
          <TVSettingItem
            title="Picture-in-Picture"
            description="Enable PiP when navigating away"
            icon="picture-in-picture-bottom-right"
            type="toggle"
            value={state.user.preferences.pictureInPicture}
            onToggle={handlePictureInPictureToggle}
          />

          {/* Storage Section */}
          <Text style={styles.sectionTitle}>Storage</Text>
          <TVSettingItem
            title="Cache Size"
            description={formatBytes(storageInfo.totalSize)}
            icon="database"
            type="button"
          />
          <TVSettingItem
            title="Clear Cache"
            description="Remove all cached data"
            icon="delete"
            type="button"
            onPress={handleClearCache}
          />

          {/* About Section */}
          <Text style={styles.sectionTitle}>About</Text>
          <TVSettingItem
            title="App Version"
            description={`Version ${appVersion}`}
            icon="information"
            type="button"
          />
          <TVSettingItem
            title="Platform"
            description="Android TV"
            icon="television"
            type="button"
          />
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#000000',
  },
  mainContent: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 48,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: 'bold',
    paddingHorizontal: 48,
    marginBottom: 32,
  },
  sectionTitle: {
    color: '#888888',
    fontSize: 18,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 48,
    marginTop: 24,
    marginBottom: 16,
  },
});

export default TVSettingsScreen;
