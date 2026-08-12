import AsyncStorage from '@react-native-async-storage/async-storage';
import { UPDATE_CONFIG } from '@/src/config/env';

const LAST_CHECK_KEY = 'flick.lastUpdateCheck';
const SKIPPED_VERSION_KEY = 'flick.skippedVersion';

/** Whether enough time has passed since the last automatic update check. */
export const shouldCheckForUpdates = async (): Promise<boolean> => {
  try {
    const raw = await AsyncStorage.getItem(LAST_CHECK_KEY);
    if (!raw) return true;
    const last = parseInt(raw, 10);
    if (!Number.isFinite(last)) return true;
    const hours = (Date.now() - last) / (1000 * 60 * 60);
    return hours >= UPDATE_CONFIG.CHECK_INTERVAL_HOURS;
  } catch {
    return true;
  }
};

export const saveLastUpdateCheck = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(LAST_CHECK_KEY, Date.now().toString());
  } catch {
    /* best-effort */
  }
};

export const isSkippedVersion = async (version: string): Promise<boolean> => {
  try {
    const raw = await AsyncStorage.getItem(SKIPPED_VERSION_KEY);
    return raw === version;
  } catch {
    return false;
  }
};

export const setSkippedVersion = async (version: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(SKIPPED_VERSION_KEY, version);
  } catch {
    /* best-effort */
  }
};

export const clearSkippedVersion = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(SKIPPED_VERSION_KEY);
  } catch {
    /* best-effort */
  }
};
