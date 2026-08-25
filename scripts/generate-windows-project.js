#!/usr/bin/env node
/**
 * Expand react-native-windows' cpp-app template into windows/ without loading
 * the RNW CLI (it requires pwsh.exe). Expo's JS root is registered as "main".
 */
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const glob = require('glob');
const mustache = require('mustache');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE = path.join(
  ROOT,
  'node_modules/react-native-windows/templates/cpp-app',
);
const SKIP = new Set(['template.config.js', 'metro.config.js', 'jest.config.windows.js']);

const projectGuid = crypto.randomUUID();
const packageGuid = crypto.randomUUID();
const replacements = {
  useMustache: true,
  name: 'Flick',
  namespace: 'Flick',
  namespaceCpp: 'Flick',
  rnwVersion: '0.84.0',
  rnwPathFromProjectRoot: 'node_modules\\react-native-windows',
  mainComponentName: 'main',
  projectGuidLower: `{${projectGuid.toLowerCase()}}`,
  projectGuidUpper: `{${projectGuid.toUpperCase()}}`,
  packageGuidLower: `{${packageGuid.toLowerCase()}}`,
  packageGuidUpper: `{${packageGuid.toUpperCase()}}`,
  currentUser: os.userInfo().username,
  devMode: false,
  useNuGets: true,
  addReactNativePublicAdoFeed: true,
  cppNugetPackages: [],
  autolinkPropertiesForProps: '',
  autolinkProjectReferencesForTargets: '',
  autolinkCppIncludes: '',
  autolinkCppPackageProviders: '\n    UNREFERENCED_PARAMETER(packageProviders);',
};

const BINARY_EXT = new Set(['.png', '.jar', '.keystore', '.ico', '.rc']);

function destRel(file) {
  const base = path.basename(file);
  let rel = file;
  if (base === '_gitignore') {
    rel = path.join(path.dirname(file), '.gitignore');
  } else if (base === 'NuGet_Config') {
    rel = path.join(path.dirname(file), 'NuGet.config');
  }
  return rel.replace(/MyApp/g, 'Flick');
}

function main() {
  const files = glob.sync('**/*', { cwd: TEMPLATE, nodir: true, dot: true });
  for (const file of files) {
    if (SKIP.has(path.basename(file))) continue;
    const from = path.join(TEMPLATE, file);
    const to = path.join(ROOT, destRel(file));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (BINARY_EXT.has(path.extname(file).toLowerCase())) {
      fs.copyFileSync(from, to);
      continue;
    }
    const rendered = mustache.render(fs.readFileSync(from, 'utf8'), replacements);
    fs.writeFileSync(to, rendered);
  }

  const imagesDir = path.join(ROOT, 'windows', 'Flick.Package', 'Images');
  fs.mkdirSync(imagesDir, { recursive: true });
  const icon = path.join(ROOT, 'assets', 'applogo', 'ic_launcher.png');
  if (fs.existsSync(icon)) {
    for (const name of [
      'SplashScreen.scale-200.png',
      'LockScreenLogo.scale-200.png',
      'Square150x150Logo.scale-200.png',
      'Square44x44Logo.scale-200.png',
      'Square44x44Logo.targetsize-24_altform-unplated.png',
      'StoreLogo.png',
      'Wide310x150Logo.scale-200.png',
    ]) {
      fs.copyFileSync(icon, path.join(imagesDir, name));
    }
  }

  console.log('Wrote windows/ from RNW 0.84 cpp-app template (JS component: main).');
}

main();
