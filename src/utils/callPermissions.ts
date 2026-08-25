import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import { permissions } from 'react-native-webrtc';
import { isMacCatalyst } from '@/src/utils/tv';

const NAMES = ['camera', 'microphone'] as const;

const openSettings = () => {
  Linking.openSettings().catch(() => {
    /* noop */
  });
};

const isGranted = (value: unknown): boolean =>
  value === true ||
  value === permissions.RESULT.GRANTED ||
  value === PermissionsAndroid.RESULTS.GRANTED;

const requestOne = async (name: (typeof NAMES)[number]): Promise<boolean> => {
  try {
    const current = await permissions.query({ name });
    if (isGranted(current) || current === permissions.RESULT.GRANTED) {
      return true;
    }
    const first = await permissions.request({ name });
    if (isGranted(first)) return true;
    const retry = await permissions.request({ name });
    return isGranted(retry);
  } catch {
    return false;
  }
};

const promptSettings = (): Promise<boolean> =>
  new Promise((resolve) => {
    Alert.alert(
      'Camera and microphone',
      'Flick needs camera and microphone access for the party video call. Enable them in Settings, then tap Join camera again.',
      [
        {
          text: 'Not now',
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: 'Open settings',
          onPress: () => {
            openSettings();
            resolve(false);
          },
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });

/**
 * Ask for camera, then microphone. If either is denied, ask that one again.
 * When the OS will not show another dialog, offer Settings.
 */
export const ensureCallPermissions = async (): Promise<boolean> => {
  if (Platform.OS === 'web') return true;
  // WebRTC (and its permission bridge) is not linked on Mac Catalyst.
  if (isMacCatalyst) return false;

  const cameraOk = await requestOne('camera');
  const micOk = await requestOne('microphone');
  if (cameraOk && micOk) return true;

  return promptSettings();
};
