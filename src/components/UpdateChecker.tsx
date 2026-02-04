import React, {useState, useEffect, useCallback} from 'react';
import {AppState, AppStateStatus} from 'react-native';
import {updateService, UpdateInfo} from '../services/UpdateService';
import {UpdateModal} from './UpdateModal';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UpdateCheckerProps {
  isDarkTheme?: boolean;
  /** Minimum hours between automatic update checks */
  checkIntervalHours?: number;
  /** Whether to check for updates on app foreground */
  checkOnForeground?: boolean;
}

const LAST_CHECK_KEY = '@flickv4_last_update_check';
const SKIPPED_VERSION_KEY = '@flickv4_skipped_version';

/**
 * Component that automatically checks for app updates on startup
 * and shows the update modal if a new version is available.
 */
export const UpdateChecker: React.FC<UpdateCheckerProps> = ({
  isDarkTheme = true,
  checkIntervalHours = 24,
  checkOnForeground = false,
}) => {
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  /**
   * Check if enough time has passed since last check
   */
  const shouldCheckForUpdates = useCallback(async (): Promise<boolean> => {
    try {
      const lastCheck = await AsyncStorage.getItem(LAST_CHECK_KEY);
      if (!lastCheck) {
        return true;
      }

      const lastCheckTime = parseInt(lastCheck, 10);
      const now = Date.now();
      const hoursSinceLastCheck = (now - lastCheckTime) / (1000 * 60 * 60);

      return hoursSinceLastCheck >= checkIntervalHours;
    } catch (error) {
      console.error('Error checking last update time:', error);
      return true;
    }
  }, [checkIntervalHours]);

  /**
   * Check if user has skipped this version
   */
  const isVersionSkipped = useCallback(async (version: string): Promise<boolean> => {
    try {
      const skippedVersion = await AsyncStorage.getItem(SKIPPED_VERSION_KEY);
      return skippedVersion === version;
    } catch (error) {
      console.error('Error checking skipped version:', error);
      return false;
    }
  }, []);

  /**
   * Save the current time as last check time
   */
  const saveLastCheckTime = useCallback(async () => {
    try {
      await AsyncStorage.setItem(LAST_CHECK_KEY, Date.now().toString());
    } catch (error) {
      console.error('Error saving last check time:', error);
    }
  }, []);

  /**
   * Skip a version so it won't show the update modal again
   */
  const skipVersion = useCallback(async (version: string) => {
    try {
      await AsyncStorage.setItem(SKIPPED_VERSION_KEY, version);
    } catch (error) {
      console.error('Error saving skipped version:', error);
    }
  }, []);

  /**
   * Clear skipped version (called when a new version is available that's different from skipped)
   */
  const clearSkippedVersion = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(SKIPPED_VERSION_KEY);
    } catch (error) {
      console.error('Error clearing skipped version:', error);
    }
  }, []);

  /**
   * Perform the update check
   */
  const checkForUpdates = useCallback(async (force: boolean = false) => {
    try {
      // Check if we should perform the check (time-based)
      if (!force) {
        const shouldCheck = await shouldCheckForUpdates();
        if (!shouldCheck) {
          console.log('Skipping update check - checked recently');
          return;
        }
      }

      console.log('Checking for app updates...');
      const info = await updateService.checkForUpdates();
      
      // Save the check time
      await saveLastCheckTime();

      if (info.hasUpdate) {
        // Check if this version was skipped
        const skipped = await isVersionSkipped(info.latestVersion);
        
        if (skipped && !force) {
          console.log(`Version ${info.latestVersion} was skipped by user`);
          return;
        }

        // Clear any previously skipped version if this is a newer one
        await clearSkippedVersion();

        console.log(`Update available: ${info.currentVersion} -> ${info.latestVersion}`);
        setUpdateInfo(info);
        setShowUpdateModal(true);
      } else {
        console.log('App is up to date');
      }
    } catch (error) {
      // Silently fail on automatic checks - don't disturb the user
      console.error('Background update check failed:', error);
    }
  }, [shouldCheckForUpdates, saveLastCheckTime, isVersionSkipped, clearSkippedVersion]);

  /**
   * Handle app state changes (foreground/background)
   */
  useEffect(() => {
    if (!checkOnForeground) {
      return;
    }

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        checkForUpdates();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [checkOnForeground, checkForUpdates]);

  /**
   * Check for updates on mount
   */
  useEffect(() => {
    // Small delay to let the app initialize properly
    const timer = setTimeout(() => {
      checkForUpdates();
    }, 2000);

    return () => clearTimeout(timer);
  }, [checkForUpdates]);

  /**
   * Handle modal close - optionally skip the version
   */
  const handleClose = useCallback(() => {
    setShowUpdateModal(false);
  }, []);

  /**
   * Handle "Skip this version" action
   */
  const handleSkipVersion = useCallback(async () => {
    if (updateInfo?.latestVersion) {
      await skipVersion(updateInfo.latestVersion);
    }
    setShowUpdateModal(false);
  }, [updateInfo, skipVersion]);

  return (
    <UpdateModal
      visible={showUpdateModal}
      onClose={handleClose} 
      isDarkTheme={isDarkTheme}
      initialUpdateInfo={updateInfo}
      onSkipVersion={handleSkipVersion}
    />
  );
};

export default UpdateChecker;
