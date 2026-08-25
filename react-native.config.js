/**
 * The loopback HLS server is iOS-only (AVPlayer cannot play file:// HLS).
 * Disable Android/Windows autolink so those native bits never enter those
 * builds. Windows also unlinks packages with no RNW implementation.
 *
 * Do not require @react-native-windows/cli on macOS/Linux — it throws because
 * it looks up pwsh.exe at load time.
 */
const windowsCli =
  process.platform === 'win32'
    ? require('@react-native-windows/cli')
    : null;

module.exports = {
  ...(windowsCli
    ? {
        commands: windowsCli.commands,
        platforms: {
          windows: {
            linkConfig: () => null,
            projectConfig: windowsCli.projectConfig,
            dependencyConfig: windowsCli.dependencyConfig,
            npmPackageName: 'react-native-windows',
          },
        },
      }
    : {}),
  project: {
    windows: {
      sourceDir: 'windows',
      solutionFile: 'Flick.sln',
      project: {
        projectFile: 'Flick\\Flick.vcxproj',
      },
    },
  },
  dependencies: {
    '@dr.pogodin/react-native-fs': {
      platforms: { android: null, windows: null },
    },
    '@dr.pogodin/react-native-static-server': {
      platforms: { android: null, windows: null },
    },
    '@kesha-antonov/react-native-background-downloader': {
      platforms: { windows: null },
    },
    '@notifee/react-native': {
      platforms: { windows: null },
    },
    'react-native-webrtc': {
      platforms: { windows: null },
    },
    'react-native-video': {
      platforms: { windows: null },
    },
    'react-native-volume-manager': {
      platforms: { windows: null },
    },
    'react-native-youtube-iframe': {
      platforms: { windows: null },
    },
    'react-native-windows': {
      platforms: { ios: null, android: null },
    },
  },
};
