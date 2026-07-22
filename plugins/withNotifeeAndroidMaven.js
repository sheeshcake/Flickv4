/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * withNotifeeAndroidMaven — Expo config plugin that teaches Gradle where to
 * find the `app.notifee:core` artifact.
 *
 * Why this exists:
 *   `@notifee/react-native` doesn't ship a first-party Expo config plugin
 *   (v9.x). At build time Gradle needs `app.notifee:core:+`, which is
 *   published only to the local Maven repo bundled with the package at
 *   `node_modules/@notifee/react-native/android/libs`. Without this repo
 *   registered, `expo run:android` fails with:
 *
 *     Could not find any matches for app.notifee:core:+ as no versions of
 *     app.notifee:core are available.
 *
 *   This plugin patches `android/build.gradle` to add a `maven { url … }`
 *   entry pointing at that bundled repo, inside the `allprojects` block.
 *
 * Idempotent: re-applies safely across `expo prebuild --clean` runs.
 */

const { withProjectBuildGradle } = require('@expo/config-plugins');

const MARKER = 'notifee-android-maven';
const REPO_LINE =
  `        // ${MARKER}: notifee bundles its Android artifact as a local Maven repo.\n` +
  `        maven { url "$rootDir/../node_modules/@notifee/react-native/android/libs" }`;

/**
 * @type {import('@expo/config-plugins').ConfigPlugin}
 */
const withNotifeeAndroidMaven = (config) =>
  withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error(
        `withNotifeeAndroidMaven: expected groovy build.gradle, got ${cfg.modResults.language}`,
      );
    }
    const src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg;

    // Inject just before the closing brace of `allprojects { repositories { … } }`.
    // We locate the `allprojects` block and add our maven line at the end of
    // its `repositories` list. If we can't find it (unexpected upstream
    // template change), fail loudly rather than silently produce a broken
    // build.
    const patched = src.replace(
      /allprojects\s*\{\s*repositories\s*\{([\s\S]*?)\}\s*\}/,
      (match, inner) => {
        const trimmed = inner.replace(/\s+$/, '');
        return `allprojects {\n    repositories {${trimmed}\n${REPO_LINE}\n    }\n}`;
      },
    );

    if (patched === src) {
      throw new Error(
        'withNotifeeAndroidMaven: could not find `allprojects { repositories { … } }` block in android/build.gradle',
      );
    }

    cfg.modResults.contents = patched;
    return cfg;
  });

module.exports = withNotifeeAndroidMaven;
