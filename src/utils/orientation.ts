import { Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { isTV } from '@/src/utils/tv';
import { isTablet } from '@/src/utils/responsive';

/** Phones hard-lock orientation; tablets/TV/web stay free. */
export const shouldLockOrientation = (): boolean =>
  !isTV && Platform.OS !== 'web' && !isTablet();

export const lockPortrait = async (): Promise<void> => {
  if (!shouldLockOrientation()) return;
  try {
    await ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.PORTRAIT_UP,
    );
  } catch {
    // Ignore — some environments (simulators) reject locks.
  }
};

export const lockLandscape = async (): Promise<void> => {
  if (!shouldLockOrientation()) return;
  try {
    await ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE,
    );
  } catch {
    // Ignore.
  }
};

/**
 * Hard-force landscape for the video player on every form factor (phones,
 * tablets, and — where applicable — anything that isn't web). Unlike
 * `lockLandscape`, this ignores the phone-only gate so the player is always
 * landscape as requested.
 */
export const forceLandscape = async (): Promise<void> => {
  if (Platform.OS === 'web') return;
  try {
    await ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE,
    );
  } catch {
    // Ignore — some environments (simulators) reject locks.
  }
};

/**
 * Restore the app's default orientation after leaving the player: portrait on
 * phones, free rotation (`DEFAULT`) on tablets/TV.
 */
export const restoreOrientation = async (): Promise<void> => {
  if (Platform.OS === 'web') return;
  try {
    if (shouldLockOrientation()) {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      );
    } else {
      await ScreenOrientation.unlockAsync();
    }
  } catch {
    // Ignore.
  }
};

/**
 * Subscribe to orientation changes. Invokes `onPortrait` when the device
 * reports a portrait orientation. Returns an unsubscribe fn.
 */
export const addPortraitListener = (
  onPortrait: () => void,
): (() => void) => {
  if (!shouldLockOrientation()) return () => {};

  const sub = ScreenOrientation.addOrientationChangeListener((event) => {
    const o = event.orientationInfo.orientation;
    if (
      o === ScreenOrientation.Orientation.PORTRAIT_UP ||
      o === ScreenOrientation.Orientation.PORTRAIT_DOWN
    ) {
      onPortrait();
    }
  });

  return () => {
    ScreenOrientation.removeOrientationChangeListener(sub);
  };
};
