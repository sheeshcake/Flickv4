import { useCallback, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UpdateModal } from '@/src/components/UpdateModal';
import { updateService, type UpdateInfo } from '@/src/services/UpdateService';
import { UPDATE_CONFIG } from '@/src/config/env';

const LAST_CHECK_KEY = 'flick.lastUpdateCheck';
const SKIPPED_VERSION_KEY = 'flick.skippedVersion';

interface UpdateCheckerProps {
  /** Also re-check when the app returns to the foreground. Default: false. */
  checkOnForeground?: boolean;
}

/**
 * Silently polls the configured GitHub repo on mount (throttled to once per
 * `UPDATE_CONFIG.CHECK_INTERVAL_HOURS`) and shows an update modal when a new
 * release is available.
 *
 * Adapted from https://github.com/sheeshcake/Flickv4/blob/main/src/components/UpdateChecker.tsx
 * — storage keys renamed to the `flick.*` scheme used elsewhere in the app.
 */
export const UpdateChecker = ({
  checkOnForeground = false,
}: UpdateCheckerProps) => {
  const [visible, setVisible] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  const shouldCheck = useCallback(async (): Promise<boolean> => {
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
  }, []);

  const isSkipped = useCallback(async (version: string): Promise<boolean> => {
    try {
      const raw = await AsyncStorage.getItem(SKIPPED_VERSION_KEY);
      return raw === version;
    } catch {
      return false;
    }
  }, []);

  const saveLastCheck = useCallback(async () => {
    try {
      await AsyncStorage.setItem(LAST_CHECK_KEY, Date.now().toString());
    } catch {
      /* best-effort */
    }
  }, []);

  const clearSkipped = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(SKIPPED_VERSION_KEY);
    } catch {
      /* best-effort */
    }
  }, []);

  const runCheck = useCallback(
    async (force = false) => {
      try {
        if (!force && !(await shouldCheck())) return;
        const info = await updateService.checkForUpdates();
        await saveLastCheck();

        if (!info.hasUpdate) return;

        if (!force && (await isSkipped(info.latestVersion))) return;

        // If the user previously skipped an older version, forget it — a
        // newer one is out.
        await clearSkipped();

        setUpdateInfo(info);
        setVisible(true);
      } catch {
        // Background check failures never disturb the user.
      }
    },
    [shouldCheck, saveLastCheck, isSkipped, clearSkipped],
  );

  // Foreground listener (opt-in).
  useEffect(() => {
    if (!checkOnForeground) return;
    const sub = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state === 'active') void runCheck();
      },
    );
    return () => sub.remove();
  }, [checkOnForeground, runCheck]);

  // First check shortly after mount so app boot isn't blocked by network.
  useEffect(() => {
    const timer = setTimeout(() => {
      void runCheck();
    }, UPDATE_CONFIG.INITIAL_CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [runCheck]);

  const handleSkipVersion = useCallback(async () => {
    if (updateInfo?.latestVersion) {
      try {
        await AsyncStorage.setItem(
          SKIPPED_VERSION_KEY,
          updateInfo.latestVersion,
        );
      } catch {
        /* best-effort */
      }
    }
    setVisible(false);
  }, [updateInfo]);

  if (!visible) return null;

  return (
    <UpdateModal
      visible={visible}
      onClose={() => setVisible(false)}
      initialUpdateInfo={updateInfo}
      onSkipVersion={handleSkipVersion}
    />
  );
};
