/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * withMacCatalyst — Expo config plugin that flips the required Xcode build
 * settings so the generated iOS project can also be built as a Mac Catalyst
 * app, and keeps `:mac_catalyst_enabled => true` in the Podfile after prebuild.
 */
const fs = require('fs');
const path = require('path');
const { withXcodeProject, withDangerousMod } = require('@expo/config-plugins');

const CATALYST_SETTINGS = {
  SUPPORTS_MACCATALYST: 'YES',
  SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD: 'NO',
  DERIVE_MACCATALYST_PRODUCT_BUNDLE_IDENTIFIER: 'YES',
};

const CATALYST_POST_INSTALL = `
    catalyst_skip = %w[
      react-native-webrtc
      JitsiWebRTC
      ReactNativeStaticServer
      ReactNativeFs
      react-native-background-downloader
    ]
    catalyst_skip.each do |name|
      installer.pods_project.targets.each do |target|
        next unless target.name == name
        target.build_configurations.each do |config|
          config.build_settings['SUPPORTED_PLATFORMS'] = 'iphoneos iphonesimulator'
          config.build_settings['SUPPORTS_MACCATALYST'] = 'NO'
        end
      end
    end

    Dir.glob(File.join(__dir__, 'Pods/Target Support Files/Pods-Flick/Pods-Flick.*.xcconfig')).each do |file|
      text = File.read(file)
      %w[
        ReactNativeFs
        ReactNativeStaticServer
        react-native-background-downloader
        react-native-webrtc
      ].each do |lib|
        text.gsub!(/ -l"#{Regexp.escape(lib)}"/, '')
        text.gsub!(/ "\\$\\{PODS_CONFIGURATION_BUILD_DIR\\}\\/#{Regexp.escape(lib)}"/, '')
      end
      text.gsub!(/ -framework "WebRTC"/, '')
      File.write(file, text)
    end

    frameworks_sh = File.join(__dir__, 'Pods/Target Support Files/Pods-Flick/Pods-Flick-frameworks.sh')
    if File.exist?(frameworks_sh)
      sh = File.read(frameworks_sh)
      sh.gsub!(
        '  install_framework "\${PODS_XCFRAMEWORKS_BUILD_DIR}/JitsiWebRTC/WebRTC.framework"',
        '  if [ "\${EFFECTIVE_PLATFORM_NAME}" != "-maccatalyst" ]; then install_framework "\${PODS_XCFRAMEWORKS_BUILD_DIR}/JitsiWebRTC/WebRTC.framework"; fi',
      )
      File.write(frameworks_sh, sh)
    end

    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'
        config.build_settings['SWIFT_APPROACHABLE_CONCURRENCY'] = 'NO'
        config.build_settings['SWIFT_DEFAULT_ACTOR_ISOLATION'] = 'nonisolated'
      end
    end
`;

const withMacCatalystXcode = (config) =>
  withXcodeProject(config, (cfg) => {
    const xcodeProject = cfg.modResults;
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      const conf = configurations[key];
      if (!conf || typeof conf !== 'object') continue;
      if (!conf.buildSettings) continue;
      const productName = conf.buildSettings.PRODUCT_NAME;
      if (typeof productName === 'string' && productName.includes('Pods-')) {
        continue;
      }
      if (conf.buildSettings.WRAPPER_EXTENSION === '"bundle"') {
        continue;
      }
      for (const [k, v] of Object.entries(CATALYST_SETTINGS)) {
        conf.buildSettings[k] = v;
      }
    }
    return cfg;
  });

const withMacCatalystPodfile = (config) =>
  withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) return cfg;
      let contents = fs.readFileSync(podfilePath, 'utf8');
      contents = contents.replace(
        /:mac_catalyst_enabled\s*=>\s*false/,
        ':mac_catalyst_enabled => true',
      );
      if (!contents.includes('SWIFT_STRICT_CONCURRENCY')) {
        contents = contents.replace(/(\n  end\nend\s*)$/, `\n${CATALYST_POST_INSTALL}$1`);
      }
      fs.writeFileSync(podfilePath, contents);
      return cfg;
    },
  ]);

const withMacCatalyst = (config) =>
  withMacCatalystPodfile(withMacCatalystXcode(config));

module.exports = withMacCatalyst;
