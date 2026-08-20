/**
 * The loopback HLS server is iOS-only (AVPlayer cannot play file:// HLS).
 * Disable Android autolink so lighttpd / CMake native bits never enter the
 * Android build.
 */
module.exports = {
  dependencies: {
    '@dr.pogodin/react-native-static-server': {
      platforms: { android: null },
    },
    '@dr.pogodin/react-native-fs': {
      platforms: { android: null },
    },
  },
};
