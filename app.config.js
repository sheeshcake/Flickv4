/**
 * Expo config — version fields come from `.env` so releases only need an
 * env bump (+ native rebuild), not edits to app.json.
 *
 * - APP_VERSION → expo.version (user-facing, e.g. "2.1.5")
 * - ANDROID_VERSION_CODE → android.versionCode (integer, must increase each APK)
 *
 * Static fields stay in app.json; this file merges overrides on top.
 */

const parseVersionCode = (raw) => {
  if (raw == null || String(raw).trim() === '') return undefined;
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** @param {{ config: import('expo/config').ExpoConfig }} ctx */
module.exports = ({ config }) => {
  const version =
    process.env.APP_VERSION?.trim() || config.version || '0.0.0';
  const versionCode =
    parseVersionCode(process.env.ANDROID_VERSION_CODE) ??
    config.android?.versionCode ??
    1;

  return {
    ...config,
    version,
    android: {
      ...config.android,
      versionCode,
    },
  };
};
