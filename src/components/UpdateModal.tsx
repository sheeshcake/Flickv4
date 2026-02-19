import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import FontAwesome6 from '@react-native-vector-icons/fontawesome6';
import {updateService, UpdateInfo, DownloadProgress} from '../services/UpdateService';

// ─── TV-aware focusable pressable ────────────────────────────────
const FP: React.FC<{
  style?: any;
  focusedStyle?: any;
  onPress?: () => void;
  disabled?: boolean;
  hasTVPreferredFocus?: boolean;
  accessibilityLabel?: string;
  children: React.ReactNode;
}> = ({ style, focusedStyle, onPress, disabled, hasTVPreferredFocus, accessibilityLabel, children }) => {
  const [focused, setFocused] = useState(false);
  const tvProps: any = { hasTVPreferredFocus };
  return (
    <Pressable
      {...tvProps}
      style={[style, focused && focusedStyle]}
      onPress={disabled ? undefined : onPress}
      onFocus={useCallback(() => setFocused(true), [])}
      onBlur={useCallback(() => setFocused(false), [])}
      focusable={!disabled}
      accessible={true}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </Pressable>
  );
};

interface UpdateModalProps {
  visible: boolean;
  onClose: () => void;
  isDarkTheme: boolean;
  /** Pre-fetched update info (for background checks) */
  initialUpdateInfo?: UpdateInfo | null;
  /** Callback when user wants to skip this version */
  onSkipVersion?: () => void;
}

type UpdateState = 'checking' | 'available' | 'up-to-date' | 'downloading' | 'error';

export const UpdateModal: React.FC<UpdateModalProps> = ({
  visible,
  onClose,
  isDarkTheme,
  initialUpdateInfo,
  onSkipVersion,
}) => {
  const [updateState, setUpdateState] = useState<UpdateState>('checking');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (visible) {
      // If we have initial update info, use it directly
      if (initialUpdateInfo) {
        setUpdateInfo(initialUpdateInfo);
        setUpdateState(initialUpdateInfo.hasUpdate ? 'available' : 'up-to-date');
      } else {
        checkForUpdates();
      }
    }
  }, [visible, initialUpdateInfo]);

  const checkForUpdates = async () => {
    setUpdateState('checking');
    setErrorMessage('');
    setDownloadProgress(null);

    try {
      const info = await updateService.checkForUpdates();
      setUpdateInfo(info);
      setUpdateState(info.hasUpdate ? 'available' : 'up-to-date');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to check for updates');
      setUpdateState('error');
    }
  };

  const handleDownload = async () => {
    if (!updateInfo?.downloadUrl) {
      // If no direct download, open the release page
      if (updateInfo?.releaseUrl) {
        handleOpenReleasePage();
      }
      return;
    }

    setUpdateState('downloading');
    setDownloadProgress({bytesWritten: 0, contentLength: 0, progress: 0});

    try {
      const downloadPath = await updateService.downloadUpdate(
        updateInfo.downloadUrl,
        (progress) => setDownloadProgress(progress),
      );

      Alert.alert(
        'Download Complete',
        'The update has been downloaded to your Downloads folder. Would you like to install it now?',
        [
          {
            text: 'Later',
            style: 'cancel',
            onPress: () => {
              setUpdateState('available');
              setDownloadProgress(null);
            },
          },
          {
            text: 'Install',
            onPress: async () => {
              try {
                await updateService.installApk(downloadPath);
              } catch (_installError) {
                Alert.alert(
                  'Installation',
                  'Please open the APK file from your Downloads folder to install the update.',
                  [{text: 'OK'}],
                );
              }
              setUpdateState('available');
              setDownloadProgress(null);
            },
          },
        ],
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Download failed');
      setUpdateState('error');
    }
  };

  const handleOpenReleasePage = async () => {
    if (updateInfo?.releaseUrl) {
      try {
        await updateService.openReleasePage(updateInfo.releaseUrl);
      } catch (_error) {
        Alert.alert('Error', 'Could not open the release page');
      }
    }
  };

  const styles = getStyles(isDarkTheme);

  const renderContent = () => {
    switch (updateState) {
      case 'checking':
        return (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color="#E50914" />
            <Text style={styles.statusText}>Checking for updates...</Text>
            <Text style={styles.versionText}>
              Current version: {updateService.getCurrentVersion()}
            </Text>
          </View>
        );

      case 'up-to-date':
        return (
          <View style={styles.centerContent}>
            <Text style={styles.checkIcon}>✓</Text>
            <Text style={styles.statusText}>You're up to date!</Text>
            <Text style={styles.versionText}>
              Version {updateInfo?.currentVersion} is the latest version.
            </Text>
            <FP
              style={styles.secondaryButton}
              focusedStyle={styles.secondaryButtonFocused}
              onPress={checkForUpdates}
              hasTVPreferredFocus={true}
              accessibilityLabel="Check again for updates"
            >
              <Text style={styles.secondaryButtonText}>Check Again</Text>
            </FP>
          </View>
        );

      case 'available':
        return (
          <ScrollView 
            style={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.updateHeader}>
              <FontAwesome6 name="download" iconStyle="solid" size={50} color="#E50914" />
              <Text style={styles.updateTitle}>Update Available!</Text>
            </View>

            <View style={styles.versionContainer}>
              <View style={styles.versionRow}>
                <Text style={styles.versionLabel}>Current Version</Text>
                <Text style={styles.versionValue}>{updateInfo?.currentVersion}</Text>
              </View>
              <View style={styles.versionRow}>
                <Text style={styles.versionLabel}>New Version</Text>
                <Text style={[styles.versionValue, styles.newVersion]}>
                  {updateInfo?.latestVersion}
                </Text>
              </View>
            </View>

            {updateInfo?.releaseDate && (
              <Text style={styles.releaseDate}>
                Released: {updateService.formatDate(updateInfo.releaseDate)}
              </Text>
            )}

            {updateInfo?.assetSize && (
              <Text style={styles.fileSize}>
                Download size: {updateService.formatFileSize(updateInfo.assetSize)}
              </Text>
            )}

            <View style={styles.releaseNotesContainer}>
              <Text style={styles.releaseNotesTitle}>What's New</Text>
              <Text style={styles.releaseNotes}>
                {updateInfo?.releaseNotes || 'No release notes available.'}
              </Text>
            </View>

            <View style={styles.buttonContainer}>
              {updateInfo?.downloadUrl ? (
                <FP
                  style={styles.primaryButton}
                  focusedStyle={styles.primaryButtonFocused}
                  onPress={handleDownload}
                  hasTVPreferredFocus={true}
                  accessibilityLabel="Download and install update"
                >
                  <Text style={styles.primaryButtonText}>
                    Download & Install
                  </Text>
                </FP>
              ) : (
                <FP
                  style={styles.primaryButton}
                  focusedStyle={styles.primaryButtonFocused}
                  onPress={handleOpenReleasePage}
                  hasTVPreferredFocus={true}
                  accessibilityLabel="View update on GitHub"
                >
                  <Text style={styles.primaryButtonText}>
                    View on GitHub
                  </Text>
                </FP>
              )}

              <FP
                style={styles.secondaryButton}
                focusedStyle={styles.secondaryButtonFocused}
                onPress={handleOpenReleasePage}
                accessibilityLabel="Open release page"
              >
                <Text style={styles.secondaryButtonText}>Release Page</Text>
              </FP>

              {onSkipVersion && (
                <FP
                  style={styles.skipButton}
                  focusedStyle={styles.skipButtonFocused}
                  onPress={onSkipVersion}
                  accessibilityLabel="Skip this version"
                >
                  <Text style={styles.skipButtonText}>Skip This Version</Text>
                </FP>
              )}
            </View>
          </ScrollView>
        );

      case 'downloading':
        return (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color="#E50914" />
            <Text style={styles.statusText}>Downloading update...</Text>
            {downloadProgress && (
              <>
                <View style={styles.progressBarContainer}>
                  <View 
                    style={[
                      styles.progressBar, 
                      {width: `${downloadProgress.progress}%`}
                    ]} 
                  />
                </View>
                <Text style={styles.progressText}>
                  {downloadProgress.progress.toFixed(1)}%
                </Text>
                <Text style={styles.downloadSizeText}>
                  {updateService.formatFileSize(downloadProgress.bytesWritten)} / 
                  {updateService.formatFileSize(downloadProgress.contentLength)}
                </Text>
              </>
            )}
          </View>
        );

      case 'error':
        return (
          <View style={styles.centerContent}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.statusText}>Error</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <FP
              style={styles.primaryButton}
              focusedStyle={styles.primaryButtonFocused}
              onPress={checkForUpdates}
              hasTVPreferredFocus={true}
              accessibilityLabel="Try checking for updates again"
            >
              <Text style={styles.primaryButtonText}>Try Again</Text>
            </FP>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>App Update</Text>
          <FP
            onPress={onClose}
            style={styles.closeButton}
            focusedStyle={styles.closeButtonFocused}
            accessibilityLabel="Close update modal"
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </FP>
        </View>
        
        <View style={styles.content}>
          {renderContent()}
        </View>
      </View>
    </Modal>
  );
};

const getStyles = (isDarkTheme: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDarkTheme ? '#000000' : '#FFFFFF',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 15,
      borderBottomWidth: 1,
      borderBottomColor: isDarkTheme ? '#333333' : '#E0E0E0',
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: isDarkTheme ? '#FFFFFF' : '#000000',
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDarkTheme ? '#333333' : '#E0E0E0',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    closeButtonFocused: {
      borderColor: '#E50914',
      backgroundColor: isDarkTheme ? '#4a1010' : '#f5c6c6',
    },
    closeButtonText: {
      fontSize: 18,
      color: isDarkTheme ? '#FFFFFF' : '#000000',
    },
    content: {
      flex: 1,
      padding: 20,
    },
    centerContent: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    scrollContent: {
      flex: 1,
    },
    statusText: {
      fontSize: 18,
      fontWeight: '600',
      color: isDarkTheme ? '#FFFFFF' : '#000000',
      marginTop: 20,
      textAlign: 'center',
    },
    versionText: {
      fontSize: 14,
      color: isDarkTheme ? '#CCCCCC' : '#666666',
      marginTop: 8,
      textAlign: 'center',
    },
    checkIcon: {
      fontSize: 60,
      color: '#4CAF50',
    },
    updateIcon: {
      fontSize: 50,
    },
    errorIcon: {
      fontSize: 50,
    },
    updateHeader: {
      alignItems: 'center',
      marginBottom: 24,
    },
    updateTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: isDarkTheme ? '#FFFFFF' : '#000000',
      marginTop: 12,
    },
    versionContainer: {
      backgroundColor: isDarkTheme ? '#1a1a1a' : '#f5f5f5',
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
    },
    versionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    versionLabel: {
      fontSize: 14,
      color: isDarkTheme ? '#CCCCCC' : '#666666',
    },
    versionValue: {
      fontSize: 16,
      fontWeight: '600',
      color: isDarkTheme ? '#FFFFFF' : '#000000',
    },
    newVersion: {
      color: '#E50914',
    },
    arrowText: {
      fontSize: 20,
      color: '#E50914',
    },
    releaseDate: {
      fontSize: 14,
      color: isDarkTheme ? '#CCCCCC' : '#666666',
      textAlign: 'center',
      marginBottom: 8,
    },
    fileSize: {
      fontSize: 14,
      color: isDarkTheme ? '#CCCCCC' : '#666666',
      textAlign: 'center',
      marginBottom: 16,
    },
    releaseNotesContainer: {
      backgroundColor: isDarkTheme ? '#1a1a1a' : '#f5f5f5',
      borderRadius: 12,
      padding: 16,
      marginBottom: 24,
    },
    releaseNotesTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: isDarkTheme ? '#FFFFFF' : '#000000',
      marginBottom: 12,
    },
    releaseNotes: {
      fontSize: 14,
      color: isDarkTheme ? '#CCCCCC' : '#666666',
      lineHeight: 22,
    },
    buttonContainer: {
      gap: 12,
      marginBottom: 20,
    },
    primaryButton: {
      backgroundColor: '#E50914',
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 8,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    primaryButtonFocused: {
      borderColor: '#FFFFFF',
      backgroundColor: '#FF1A1A',
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    secondaryButton: {
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderColor: isDarkTheme ? '#666666' : '#CCCCCC',
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 8,
      alignItems: 'center',
      marginTop: 12,
    },
    secondaryButtonFocused: {
      borderColor: '#E50914',
      backgroundColor: 'rgba(229,9,20,0.12)',
    },
    secondaryButtonText: {
      color: isDarkTheme ? '#FFFFFF' : '#000000',
      fontSize: 16,
      fontWeight: '500',
    },
    progressBarContainer: {
      width: '80%',
      height: 8,
      backgroundColor: isDarkTheme ? '#333333' : '#E0E0E0',
      borderRadius: 4,
      marginTop: 20,
      overflow: 'hidden',
    },
    progressBar: {
      height: '100%',
      backgroundColor: '#E50914',
      borderRadius: 4,
    },
    progressText: {
      fontSize: 16,
      fontWeight: '600',
      color: isDarkTheme ? '#FFFFFF' : '#000000',
      marginTop: 12,
    },
    downloadSizeText: {
      fontSize: 14,
      color: isDarkTheme ? '#CCCCCC' : '#666666',
      marginTop: 4,
    },
    errorText: {
      fontSize: 14,
      color: isDarkTheme ? '#CCCCCC' : '#666666',
      textAlign: 'center',
      marginTop: 8,
      marginBottom: 20,
    },
    skipButton: {
      paddingVertical: 12,
      paddingHorizontal: 24,
      alignItems: 'center',
      marginTop: 16,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    skipButtonFocused: {
      borderColor: '#888888',
      backgroundColor: 'rgba(136,136,136,0.12)',
    },
    skipButtonText: {
      color: isDarkTheme ? '#888888' : '#999999',
      fontSize: 14,
      fontWeight: '400',
    },
  });

export default UpdateModal;
