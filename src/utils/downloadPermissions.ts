import { Alert, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

/**
 * Permission helper for the download stack.
 *
 * Downloads themselves write to app-scoped storage, so no traditional
 * `WRITE_EXTERNAL_STORAGE` permission is required on Android or iOS. What we
 * *do* need is `POST_NOTIFICATIONS` (Android 13+) / user notification
 * authorization (iOS) — otherwise the background downloader can't show the
 * progress notification we rely on to signal that a download is happening.
 *
 * We use `expo-notifications` here because our progress notifications are
 * scheduled through it (see `DownloadService.showOrUpdateNotification`).
 *
 * Contract:
 * - `bootstrapDownloadPermissions()` runs once per install on first app
 *   launch (guarded by `AsyncStorage` flag) and prompts if the OS hasn't
 *   asked yet. Silent no-op on subsequent launches.
 * - `ensureDownloadPermissions()` is called every time the user actually
 *   taps a Download button. If we already have permission, it resolves
 *   `true` immediately. If we don't, it re-prompts (or, on Android, sends
 *   the user to the app settings) and returns whether we can proceed.
 */

const BOOTSTRAPPED_KEY = 'flick.downloads.permissionBootstrapped';

const canAskAgain = (
  status: Notifications.PermissionResponse,
): boolean => {
  if (Platform.OS === 'ios') {
    // On iOS, once the user has answered we can't ask again — they must go
    // to Settings.
    return status.canAskAgain === true;
  }
  return status.canAskAgain !== false;
};

const openSettings = () => {
  Linking.openSettings().catch(() => {
    /* noop */
  });
};

/**
 * Fire-and-forget: called from `App.tsx` on mount. Prompts for notification
 * permission the very first time the app opens so downloads can surface
 * progress notifications. Silent on subsequent launches.
 */
export const bootstrapDownloadPermissions = async (): Promise<void> => {
  try {
    const alreadyRan = await AsyncStorage.getItem(BOOTSTRAPPED_KEY);
    if (alreadyRan) return;
    await AsyncStorage.setItem(BOOTSTRAPPED_KEY, '1');
    const current = await Notifications.getPermissionsAsync();
    if (current.granted || current.status === 'granted') return;
    if (!canAskAgain(current)) return;
    await Notifications.requestPermissionsAsync({
      android: {},
      ios: {
        allowAlert: true,
        allowBadge: false,
        allowSound: false,
      },
    });
  } catch {
    // Never let permission bootstrap crash the app.
  }
};

/**
 * Called right before we kick off a download from the UI. Returns whether we
 * can proceed. If the permission was previously denied but the OS still lets
 * us ask, we re-prompt. If the OS has locked us out (user chose "Don't ask
 * again"), we surface an actionable Alert that offers to jump to Settings.
 */
export const ensureDownloadPermissions = async (): Promise<boolean> => {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted || current.status === 'granted') return true;

    if (canAskAgain(current)) {
      const next = await Notifications.requestPermissionsAsync({
        android: {},
        ios: {
          allowAlert: true,
          allowBadge: false,
          allowSound: false,
        },
      });
      if (next.granted || next.status === 'granted') return true;
      // Fall through to the "please open settings" prompt below.
    }

    // Ask the user whether they want to enable it via Settings. We still
    // allow downloads to proceed even if they say no — the queue works
    // without notifications, they just won't see a system indicator.
    return await new Promise<boolean>((resolve) => {
      Alert.alert(
        'Enable download notifications',
        'Flick uses notifications to show download progress. You can turn this on in Settings.',
        [
          {
            text: 'Not now',
            style: 'cancel',
            onPress: () => resolve(true),
          },
          {
            text: 'Open settings',
            onPress: () => {
              openSettings();
              resolve(true);
            },
          },
        ],
        { cancelable: true, onDismiss: () => resolve(true) },
      );
    });
  } catch {
    return true;
  }
};
