import { useCallback, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { UpdateModal } from '@/src/components/UpdateModal';
import { updateService, type UpdateInfo } from '@/src/services/UpdateService';
import {
  clearSkippedVersion,
  isSkippedVersion,
  saveLastUpdateCheck,
  setSkippedVersion,
  shouldCheckForUpdates,
} from '@/src/utils/updateCheckStorage';

interface UpdateCheckerProps {
  /** Also re-check when the app returns to the foreground. Default: false. */
  checkOnForeground?: boolean;
}

/**
 * Optional foreground update polling. Cold-start checks are owned by
 * `SplashScreen` so the modal can gate entry into Main without a second
 * prompt racing from this component.
 */
export const UpdateChecker = ({
  checkOnForeground = false,
}: UpdateCheckerProps) => {
  const [visible, setVisible] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  const runCheck = useCallback(async (force = false) => {
    try {
      if (!force && !(await shouldCheckForUpdates())) return;
      const info = await updateService.checkForUpdates();
      await saveLastUpdateCheck();

      if (!info.hasUpdate) return;

      if (!force && (await isSkippedVersion(info.latestVersion))) return;

      // If the user previously skipped an older version, forget it — a
      // newer one is out.
      await clearSkippedVersion();

      setUpdateInfo(info);
      setVisible(true);
    } catch {
      // Background check failures never disturb the user.
    }
  }, []);

  // Foreground listener (opt-in). Boot-time checks live on Splash.
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

  const handleSkipVersion = useCallback(async () => {
    if (updateInfo?.latestVersion) {
      await setSkippedVersion(updateInfo.latestVersion);
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
