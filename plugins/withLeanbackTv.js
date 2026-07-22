/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * withLeanbackTv — Expo config plugin that turns the Android build into an
 * Android TV / Google TV compatible launcher app.
 *
 * What it does:
 *   1. `withAndroidManifest`
 *      a. Adds `<uses-feature android:name="android.software.leanback"
 *         android:required="false"/>` so the app is optional-Leanback.
 *      b. Adds `<uses-feature android:name="android.hardware.touchscreen"
 *         android:required="false"/>` so it's installable on TVs (no touch).
 *      c. Adds a second `<intent-filter>` to MainActivity with categories
 *         `MAIN` + `LEANBACK_LAUNCHER` so the Android TV launcher lists us.
 *      d. Sets `android:banner="@drawable/tv_banner"` on `<application>`.
 *
 *   2. `withDangerousMod (android)` — copies a banner PNG into
 *      `android/app/src/main/res/drawable-xhdpi/tv_banner.png`. Prefers a
 *      user-supplied `assets/applogo/tv_banner.png`; if that's missing it
 *      auto-composites `assets/applogo/ic_launcher.png` centered on a
 *      #000000 background at 320x180 using `sharp` at prebuild time.
 *
 * After making changes here you MUST run:
 *   npx expo prebuild --clean && npx expo run:android --device
 */
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const BANNER_RES_DIR = 'drawable-xhdpi';
const BANNER_FILE = 'tv_banner.png';

/**
 * @param {import('@expo/config-plugins').ConfigPlugin} config
 */
const withLeanbackManifest = (config) =>
  withAndroidManifest(config, async (cfg) => {
    const manifest = cfg.modResults.manifest;

    // --- 1a & 1b: uses-feature declarations ---
    manifest['uses-feature'] = manifest['uses-feature'] ?? [];
    const ensureFeature = (name) => {
      const existing = manifest['uses-feature'].find(
        (f) => f?.$?.['android:name'] === name,
      );
      if (existing) {
        existing.$['android:required'] = 'false';
      } else {
        manifest['uses-feature'].push({
          $: { 'android:name': name, 'android:required': 'false' },
        });
      }
    };
    ensureFeature('android.software.leanback');
    ensureFeature('android.hardware.touchscreen');

    // --- 1c: LEANBACK_LAUNCHER intent filter on MainActivity ---
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    const mainActivity = application.activity?.find(
      (a) => a?.$?.['android:name'] === '.MainActivity',
    );
    if (mainActivity) {
      mainActivity['intent-filter'] = mainActivity['intent-filter'] ?? [];
      const already = mainActivity['intent-filter'].some((f) =>
        (f.category ?? []).some(
          (c) =>
            c?.$?.['android:name'] === 'android.intent.category.LEANBACK_LAUNCHER',
        ),
      );
      if (!already) {
        mainActivity['intent-filter'].push({
          action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
          category: [
            { $: { 'android:name': 'android.intent.category.LEANBACK_LAUNCHER' } },
          ],
        });
      }
    }

    // --- 1d: android:banner on <application> ---
    application.$ = application.$ ?? {};
    application.$['android:banner'] = '@drawable/tv_banner';

    return cfg;
  });

const compositeBanner = async (srcIcon, destBanner) => {
  const sharp = require('sharp');
  const width = 320;
  const height = 180;
  const iconSize = 140;

  // 1) Downscale ic_launcher to a square that fits inside the banner.
  const iconBuf = await sharp(srcIcon)
    .resize(iconSize, iconSize, { fit: 'contain' })
    .toBuffer();

  // 2) Compose it centered on a black 320x180 canvas.
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([{ input: iconBuf, gravity: 'center' }])
    .png()
    .toFile(destBanner);
};

/**
 * @param {import('@expo/config-plugins').ConfigPlugin} config
 */
const withLeanbackBanner = (config) =>
  withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const androidRoot = cfg.modRequest.platformProjectRoot;

      const userSupplied = path.join(projectRoot, 'assets/applogo/tv_banner.png');
      const drawableDir = path.join(
        androidRoot,
        'app/src/main/res',
        BANNER_RES_DIR,
      );
      const destBanner = path.join(drawableDir, BANNER_FILE);

      fs.mkdirSync(drawableDir, { recursive: true });

      if (fs.existsSync(userSupplied)) {
        fs.copyFileSync(userSupplied, destBanner);
      } else {
        // Fall back to compositing the launcher icon at 320x180.
        const srcIcon = path.join(
          projectRoot,
          'assets/applogo/ic_launcher.png',
        );
        if (!fs.existsSync(srcIcon)) {
          throw new Error(
            'withLeanbackTv: no tv_banner.png and no ic_launcher.png to fall back to',
          );
        }
        try {
          await compositeBanner(srcIcon, destBanner);
        } catch (err) {
          // If sharp is unavailable at prebuild time, degrade to a plain
          // copy so the build doesn't crash.
          // eslint-disable-next-line no-console
          console.warn(
            '[withLeanbackTv] sharp failed, copying ic_launcher.png verbatim:',
            err?.message ?? err,
          );
          fs.copyFileSync(srcIcon, destBanner);
        }
      }

      return cfg;
    },
  ]);

/**
 * @type {import('@expo/config-plugins').ConfigPlugin}
 */
const withLeanbackTv = (config) => {
  config = withLeanbackManifest(config);
  config = withLeanbackBanner(config);
  return config;
};

module.exports = withLeanbackTv;
