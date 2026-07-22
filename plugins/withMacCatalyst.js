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
 * Pods and test-target configurations are deliberately skipped because
 * CocoaPods' generated settings can't take `SUPPORTS_MACCATALYST` and
 * changing them there produces spurious Xcode warnings.
 *
 * After making changes here you MUST run:
 *   npx expo prebuild --clean
 * Then open `ios/Flick.xcworkspace` in Xcode, pick "My Mac (Mac Catalyst)"
 * as the run destination, and Cmd+R.
 */
const { withXcodeProject } = require('@expo/config-plugins');

const CATALYST_SETTINGS = {
  SUPPORTS_MACCATALYST: 'YES',
  SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD: 'NO',
  DERIVE_MACCATALYST_PRODUCT_BUNDLE_IDENTIFIER: 'YES',
};

/**
 * @type {import('@expo/config-plugins').ConfigPlugin}
 */
const withMacCatalyst = (config) =>
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

module.exports = withMacCatalyst;
