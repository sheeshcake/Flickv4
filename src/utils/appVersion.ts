import Constants from 'expo-constants';
import * as Application from 'expo-application';

/**
 * Version string shown in the UI.
 *
 * Prefers `Constants.expoConfig.version`, which comes from `APP_VERSION` in
 * `.env` via `app.config.js` (updates on Metro/Expo restart without a native
 * rebuild). Falls back to the installed binary when config is unavailable.
 */
export const getAppVersion = (): string =>
  Constants.expoConfig?.version ??
  Application.nativeApplicationVersion ??
  '0.0.0';

/**
 * Version of the installed native binary — use for update / APK comparisons
 * so bumping `APP_VERSION` in `.env` alone does not hide a real upgrade.
 */
export const getInstalledAppVersion = (): string =>
  Application.nativeApplicationVersion ??
  Constants.expoConfig?.version ??
  '0.0.0';
