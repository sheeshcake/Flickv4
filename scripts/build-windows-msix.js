#!/usr/bin/env node
/**
 * Release-build Flick for react-native-windows and copy the MSIX to build/Flick.msix.
 *
 * Must run on Windows (Visual Studio + RNW workloads). This machine's RN is
 * 0.86; react-native-windows latest stable is 0.84 — init/build may need
 * that pairing until Microsoft ships an 0.86 RNW line.
 *
 * If windows/ is missing, runs `react-native init-windows --overwrite` first.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

if (process.platform !== 'win32') {
  console.error(
    'windows:msix must be run on Windows (VS with C++/WinUI, matching RNW docs).',
  );
  process.exit(1);
}

const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] == null) process.env[key] = value;
  }
}

const windowsDir = path.join(ROOT, 'windows');
if (!fs.existsSync(path.join(windowsDir, 'Flick.sln'))) {
  console.log('windows/ missing — generating from RNW cpp-app template');
  const init = spawnSync('node', ['scripts/generate-windows-project.js'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (init.status !== 0) {
    process.exit(init.status ?? 1);
  }
}

function identityVersion() {
  const raw = process.env.APP_VERSION || '1.0.0';
  const parts = raw.split('.').map((n) => parseInt(n, 10));
  while (parts.length < 3) parts.push(0);
  const code = parseInt(process.env.ANDROID_VERSION_CODE || '0', 10);
  const rev = Number.isFinite(code) ? Math.min(Math.max(code, 0), 65535) : 0;
  return `${parts[0]}.${parts[1]}.${parts[2]}.${rev}`;
}

const manifest = path.join(windowsDir, 'Flick.Package', 'Package.appxmanifest');
if (fs.existsSync(manifest)) {
  const version = identityVersion();
  const xml = fs
    .readFileSync(manifest, 'utf8')
    .replace(/Version="[\d.]+"/, `Version="${version}"`);
  fs.writeFileSync(manifest, xml);
  console.log(`Stamped Package.appxmanifest Identity Version=${version}`);
}

const outDir = path.join(ROOT, 'build');
fs.mkdirSync(outDir, { recursive: true });

const run = spawnSync(
  'npx',
  [
    'react-native',
    'run-windows',
    '--release',
    '--no-launch',
    '--arch',
    'x64',
    '--logging',
  ],
  { cwd: ROOT, stdio: 'inherit', shell: true },
);
if (run.status !== 0) {
  process.exit(run.status ?? 1);
}

function findMsix(dir, depth = 0) {
  if (!fs.existsSync(dir) || depth > 8) return null;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      const nested = findMsix(full, depth + 1);
      if (nested) return nested;
    } else if (/\.(msix|appx)$/i.test(name)) {
      return full;
    }
  }
  return null;
}

const found =
  findMsix(path.join(windowsDir, 'AppPackages')) ||
  findMsix(path.join(windowsDir, 'AppxPackages')) ||
  findMsix(windowsDir);

if (!found) {
  console.error('No .msix/.appx found under windows/ after the Release build.');
  process.exit(1);
}

const dest = path.join(outDir, 'Flick.msix');
fs.copyFileSync(found, dest);
console.log(`MSIX: ${dest}`);
