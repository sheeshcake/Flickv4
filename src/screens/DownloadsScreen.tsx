import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Alert,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { 
  DownloadItem, 
  DownloadStatus,
  DownloadNotification 
} from '../types';
import { downloadService } from '../services';
import { DownloadsList } from '../components/DownloadComponents';
import { COLORS } from '../utils/constants';
import type { RootStackScreenProps } from '../types/navigation';

type DownloadsScreenProps = RootStackScreenProps<'Downloads'>;

const DownloadsScreen: React.FC<DownloadsScreenProps> = ({ navigation }) => {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [storageInfo, setStorageInfo] = useState({
    totalDownloads: 0,
    completedDownloads: 0,
    totalSize: 0,
    usedSpace: 0,
    availableSpace: 0,
  });

  // Load downloads data
  const loadDownloads = useCallback(async () => {
    try {
      const allDownloads = downloadService.getAllDownloads();
      setDownloads(allDownloads);

      const info = await downloadService.getStorageInfo();
      setStorageInfo(info);
    } catch (error) {
      console.error('Failed to load downloads:', error);
    }
  }, []);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDownloads();
    setRefreshing(false);
  }, [loadDownloads]);

  // Handle notification
  const handleNotification = useCallback((notification: DownloadNotification) => {
    console.log('Download notification:', notification);
    // Reload downloads when there's a notification
    loadDownloads();
  }, [loadDownloads]);

  // Set up periodic refresh for active downloads
  useEffect(() => {
    const interval = setInterval(() => {
      const activeDownloads = downloads.filter(
        d => d.status === DownloadStatus.DOWNLOADING || d.status === DownloadStatus.PAUSED
      );
      
      if (activeDownloads.length > 0) {
        console.log('Refreshing downloads for active downloads:', activeDownloads.length);
        loadDownloads();
      }
    }, 2000); // Refresh every 2 seconds when there are active downloads

    return () => clearInterval(interval);
  }, [downloads, loadDownloads]);

  useEffect(() => {
    loadDownloads();

    // Set up notification listener
    downloadService.addNotificationListener(handleNotification);

    return () => {
      downloadService.removeNotificationListener(handleNotification);
    };
  }, [loadDownloads, handleNotification]);

  // Handle download item press (play downloaded content)
  const handleDownloadPress = useCallback((download: DownloadItem) => {
    if (download.status === DownloadStatus.COMPLETED && download.filePath) {
      navigation.navigate('Detail', {
        content: {
          id: download.contentId,
          title: download.title,
        },
        video: download.filePath,
        isLocal: true,
        autoPlay: true,
      });
    } else if (download.status === DownloadStatus.DOWNLOADING) {
      Alert.alert(
        'Download in Progress',
        `${download.title} is currently downloading (${Math.round(download.progress)}% complete).`,
        [
          { text: 'OK' },
          {
            text: 'Pause',
            onPress: async () => {
              try {
                await downloadService.pauseDownload(download.id);
                loadDownloads();
              } catch (error: any) {
                Alert.alert('Error', error.message || 'Failed to pause download');
              }
            },
          },
        ]
      );
    } else if (download.status === DownloadStatus.PAUSED) {
      Alert.alert(
        'Download Paused',
        `${download.title} download is paused.`,
        [
          { text: 'Cancel' },
          {
            text: 'Resume',
            onPress: async () => {
              try {
                await downloadService.resumeDownload(download.id);
                loadDownloads();
              } catch (error: any) {
                Alert.alert('Error', error.message || 'Failed to resume download');
              }
            },
          },
        ]
      );
    }
  }, [loadDownloads]);

  // Handle delete download
  const handleDeleteDownload = useCallback((download: DownloadItem) => {
    Alert.alert(
      'Delete Download',
      `Are you sure you want to delete ${download.title}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await downloadService.deleteDownload(download.id);
              loadDownloads();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete download');
            }
          },
        },
      ]
    );
  }, [loadDownloads]);

  // Handle cleanup failed downloads
  const handleCleanup = useCallback(async () => {
    Alert.alert(
      'Clean Up Downloads',
      'This will remove all failed and cancelled downloads. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clean Up',
          onPress: async () => {
            try {
              const cleanedCount = await downloadService.cleanupFailedDownloads();
              Alert.alert(
                'Cleanup Complete',
                `Removed ${cleanedCount} failed/cancelled downloads.`
              );
              loadDownloads();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to cleanup downloads');
            }
          },
        },
      ]
    );
  }, [loadDownloads]);

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Get downloads by status
  const downloadingItems = downloads.filter(d => d.status === DownloadStatus.DOWNLOADING);
  const pausedItems = downloads.filter(d => d.status === DownloadStatus.PAUSED);
  const failedItems = downloads.filter(d => d.status === DownloadStatus.FAILED);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Icon name="arrow-back" size={24} color={COLORS.NETFLIX_WHITE} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Downloads</Text>
        <TouchableOpacity
          style={styles.cleanupButton}
          onPress={handleCleanup}
          activeOpacity={0.7}
        >
          <Icon name="cleaning-services" size={24} color={COLORS.NETFLIX_WHITE} />
        </TouchableOpacity>
      </View>

      {/* Storage Info */}
      <View style={styles.storageInfo}>
        <View style={styles.storageRow}>
          <Text style={styles.storageLabel}>Total Downloads:</Text>
          <Text style={styles.storageValue}>
            {storageInfo.completedDownloads} of {storageInfo.totalDownloads}
          </Text>
        </View>
        <View style={styles.storageRow}>
          <Text style={styles.storageLabel}>Storage Used:</Text>
          <Text style={styles.storageValue}>
            {formatFileSize(storageInfo.usedSpace)}
          </Text>
        </View>
        <View style={styles.storageRow}>
          <Text style={styles.storageLabel}>Available Space:</Text>
          <Text style={styles.storageValue}>
            {formatFileSize(storageInfo.availableSpace)}
          </Text>
        </View>
      </View>

      {/* Status Summary */}
      {(downloadingItems.length > 0 || pausedItems.length > 0 || failedItems.length > 0) && (
        <View style={styles.statusSummary}>
          {downloadingItems.length > 0 && (
            <View style={styles.statusItem}>
              <Icon name="download" size={16} color="#0099ff" />
              <Text style={styles.statusText}>
                {downloadingItems.length} downloading
              </Text>
            </View>
          )}
          {pausedItems.length > 0 && (
            <View style={styles.statusItem}>
              <Icon name="pause" size={16} color="#ff9900" />
              <Text style={styles.statusText}>
                {pausedItems.length} paused
              </Text>
            </View>
          )}
          {failedItems.length > 0 && (
            <View style={styles.statusItem}>
              <Icon name="error" size={16} color={COLORS.NETFLIX_RED} />
              <Text style={styles.statusText}>
                {failedItems.length} failed
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Downloads List */}
      <DownloadsList
        downloads={downloads}
        onItemPress={handleDownloadPress}
        onDeletePress={handleDeleteDownload}
      />

      {/* Refresh Control */}
      <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.NETFLIX_BLACK,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 50,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.NETFLIX_DARK_GRAY,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  cleanupButton: {
    padding: 8,
  },
  storageInfo: {
    backgroundColor: COLORS.NETFLIX_DARK_GRAY,
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  storageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  storageLabel: {
    color: COLORS.NETFLIX_GRAY,
    fontSize: 14,
  },
  storageValue: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 14,
    fontWeight: '600',
  },
  statusSummary: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexWrap: 'wrap',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
    marginBottom: 8,
  },
  statusText: {
    color: COLORS.NETFLIX_LIGHT_GRAY,
    fontSize: 12,
    marginLeft: 4,
  },
});

export default DownloadsScreen;