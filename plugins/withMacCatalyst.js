/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * withMacCatalyst — Expo config plugin that flips the required Xcode build
 * settings so the generated iOS project can also be built as a Mac Catalyst
 * app (i.e. the same binary runs natively on macOS as a first-class Cocoa
 * app, reusing every Expo module we already depend on).
 *
 * What it does — on every app-target build configuration in
 * `ios/Flick.xcodeproj` (Debug / Release / Preview / etc):
 *
 *   1. `SUPPORTS_MACCATALYST = YES`
 *      Turns on the Mac Catalyst destination in Xcode's scheme.
 *
 *   2. `SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = NO`
 *      Disables the "Designed for iPad" mode (which would ship the raw iOS
 *      app to macOS via a compatibility shim). We want a proper Catalyst
 *      build with native macOS chrome, so this is explicitly opted out.
 *
 *   3. `DERIVE_MACCATALYST_PRODUCT_BUNDLE_IDENTIFIER = YES`
 *      Auto-derives a Catalyst-specific bundle id (`maccatalyst.<iOS id>`),
 *      which keeps our iOS + Catalyst provisioning profiles independent
 *      without any extra manual configuration.
 *
 *   4. Podfile `:mac_catalyst_enabled => true`
 *      RN's CocoaPods post_install applies Catalyst-specific pod settings.
 *      Leaving this false while the app target has Catalyst on commonly
 *      breaks a real Mac build.
 *
 *   5. `EXPO_USE_PRECOMPILED_MODULES=false` and
 *      `ios.buildReactNativeFromSource=true` in Podfile.properties.json
 *      Precompiled Expo xcframeworks have no Catalyst slice; prebuilt RN Core
 *      hides Fabric C++ vtables that source-built ExpoModulesCore needs.
 *
 *   6. Mac Catalyst entitlements (`macos/Flick.catalyst.entitlements`)
 *      Hardened Runtime camera / mic / file keys, applied only for the
 *      macosx SDK so iOS App Store signing is unchanged.
 *
 *   7. Info.plist folder usage strings for macOS Files and Folders TCC.
 *
 * Pods and test-target configurations are deliberately skipped because
 * CocoaPods' generated settings can't take `SUPPORTS_MACCATALYST` and
 * changing them there produces spurious Xcode warnings.
 *
 * After making changes here you MUST run:
 *   npx expo prebuild --clean
 * Then `npm run macos` (or open `ios/Flick.xcworkspace`, pick
 * "My Mac (Mac Catalyst)", and Cmd+R).
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withInfoPlist, withXcodeProject } = require('@expo/config-plugins');

const CATALYST_SETTINGS = {
  SUPPORTS_MACCATALYST: 'YES',
  SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD: 'NO',
  DERIVE_MACCATALYST_PRODUCT_BUNDLE_IDENTIFIER: 'YES',
  'CODE_SIGN_ENTITLEMENTS[sdk=macosx*]': '../macos/Flick.catalyst.entitlements',
  'ENABLE_HARDENED_RUNTIME[sdk=macosx*]': 'YES',
};

const MAC_PRIVACY_KEYS = {
  NSCameraUsageDescription:
    'Flick uses the camera so you can join a watch-party video call.',
  NSMicrophoneUsageDescription:
    'Flick uses the microphone so you can join a watch-party video call.',
  NSDocumentsFolderUsageDescription:
    'Flick uses Documents to store and open downloaded videos.',
  NSDownloadsFolderUsageDescription:
    'Flick uses Downloads so you can save and open local files.',
  NSDesktopFolderUsageDescription:
    'Flick uses Desktop so you can open local video files.',
};

/**
 * @type {import('@expo/config-plugins').ConfigPlugin}
 */
const withMacCatalystXcode = (config) =>
  withXcodeProject(config, (cfg) => {
    const xcodeProject = cfg.modResults;
    // App target is the one whose product name matches the iOS app name.
    // We fall back to modifying every non-Pods build configuration, which
    // is what most Catalyst plugins do — Pods filters get skipped so
    // CocoaPods doesn't fight us on the next `pod install`.
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      const conf = configurations[key];
      if (!conf || typeof conf !== 'object') continue;
      if (!conf.buildSettings) continue;
      const productName = conf.buildSettings.PRODUCT_NAME;
      // Skip Pods configurations — Xcode emits "unrecognized" warnings and
      // Cocoapods can strip our writes back to defaults on re-run.
      if (
        typeof productName === 'string' &&
        productName.includes('Pods-')
      ) {
        continue;
      }
      // Skip anything that isn't an app target (bundle/framework configs
      // don't need Catalyst flags either).
      if (conf.buildSettings.WRAPPER_EXTENSION === '"bundle"') {
        continue;
      }
      for (const [k, v] of Object.entries(CATALYST_SETTINGS)) {
        conf.buildSettings[k] = v;
      }
    }
    return cfg;
  });

/**
 * Keep RN's CocoaPods Catalyst path in sync across `expo prebuild --clean`.
 *
 * @type {import('@expo/config-plugins').ConfigPlugin}
 */
const withMacCatalystPodfile = (config) =>
  withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const iosRoot = cfg.modRequest.platformProjectRoot;
      const podfilePath = path.join(iosRoot, 'Podfile');
      if (fs.existsSync(podfilePath)) {
        let contents = fs.readFileSync(podfilePath, 'utf8');
        const next = contents.replace(
          /:mac_catalyst_enabled\s*=>\s*false/,
          ':mac_catalyst_enabled => true',
        );
        if (next !== contents) {
          fs.writeFileSync(podfilePath, next);
        }
      }

      // Precompiled Expo xcframeworks have no Mac Catalyst slice.
      const propsPath = path.join(iosRoot, 'Podfile.properties.json');
      if (fs.existsSync(propsPath)) {
        const props = JSON.parse(fs.readFileSync(propsPath, 'utf8'));
        let changed = false;
        if (props.EXPO_USE_PRECOMPILED_MODULES !== 'false') {
          props.EXPO_USE_PRECOMPILED_MODULES = 'false';
          changed = true;
        }
        // Prebuilt RN Core hides Fabric C++ vtables that ExpoModulesCore needs.
        if (props['ios.buildReactNativeFromSource'] !== 'true') {
          props['ios.buildReactNativeFromSource'] = 'true';
          changed = true;
        }
        if (changed) {
          fs.writeFileSync(propsPath, `${JSON.stringify(props, null, 2)}\n`);
        }
      }
      return cfg;
    },
  ]);

/**
 * @type {import('@expo/config-plugins').ConfigPlugin}
 */
const withMacCatalystInfoPlist = (config) =>
  withInfoPlist(config, (cfg) => {
    for (const [key, value] of Object.entries(MAC_PRIVACY_KEYS)) {
      if (!cfg.modResults[key]) {
        cfg.modResults[key] = value;
      }
    }
    cfg.modResults.LSSupportsOpeningDocumentsInPlace = true;
    return cfg;
  });

/**
 * @type {import('@expo/config-plugins').ConfigPlugin}
 */
const withMacCatalyst = (config) => {
  config = withMacCatalystXcode(config);
  config = withMacCatalystPodfile(config);
  config = withMacCatalystInfoPlist(config);
  return config;
};

module.exports = withMacCatalyst;
