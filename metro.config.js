const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

const platforms = config.resolver.platforms ?? ['ios', 'android', 'native', 'web'];
if (!platforms.includes('windows')) {
  config.resolver.platforms = [...platforms, 'windows'];
}

const rnwRoot = path.resolve(__dirname, 'node_modules/react-native-windows');
const previousResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === 'windows' &&
    (moduleName === 'react-native' || moduleName.startsWith('react-native/'))
  ) {
    const subpath =
      moduleName === 'react-native'
        ? rnwRoot
        : path.join(rnwRoot, moduleName.slice('react-native/'.length));
    return {
      type: 'sourceFile',
      filePath: require.resolve(subpath),
    };
  }
  if (previousResolveRequest) {
    return previousResolveRequest(context, moduleName, platform);
  }
  const { resolve } = require('metro-resolver');
  return resolve(context, moduleName, platform);
};

module.exports = withNativewind(config, { inlineRem: 16 });
