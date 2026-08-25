/**
 * Loopback static server for iOS offline HLS.
 *
 * AVPlayer will not play `file://` media playlists (or raw MPEG-TS). Serving
 * the completed job directory over `http://127.0.0.1:<port>/local.m3u8`
 * is the supported path. `Info.plist` already has `NSAllowsLocalNetworking`.
 *
 * Only the downloads folder for the active job is exposed; the server is
 * bound to loopback and stopped when the player unmounts.
 */

// NOTE: `@dr.pogodin/react-native-static-server` (and its `react-native-fs`
// dependency) resolve their native side with `TurboModuleRegistry.getEnforcing`
// at module-evaluation time, which THROWS if the native module is absent. Those
// pods are intentionally stripped from the Mac Catalyst build
// (`plugins/withMacCatalyst.js` + `scripts/strip-catalyst-link-flags.py`), so a
// top-level `import` here would crash the whole JS bundle on launch (blank
// screen). We therefore keep only a type-only import (erased at build time) and
// `require()` the module lazily, guarded so it never loads on Mac Catalyst.
import type StaticServer from '@dr.pogodin/react-native-static-server';
import { isMacCatalyst } from '@/src/utils/tv';

type StaticServerModule = {
  default: new (options: {
    fileDir: string;
    hostname?: string;
    stopInBackground?: boolean;
    extraConfig?: string;
  }) => StaticServer;
};

let server: StaticServer | null = null;
let servingDir: string | null = null;
let origin: string | null = null;

/** Convert an Expo `file://` URI to a filesystem path for the native server. */
const fileUriToPath = (uri: string): string => {
  if (!uri.startsWith('file:')) return uri.replace(/\/$/, '');
  try {
    return decodeURIComponent(new URL(uri).pathname).replace(/\/$/, '');
  } catch {
    return uri.replace(/^file:\/\//, '').replace(/\/$/, '');
  }
};

export const serveLocalHls = async (localDirUri: string): Promise<string> => {
  if (isMacCatalyst) {
    // The loopback HLS server pod is not linked into the Mac Catalyst build.
    throw new Error('Loopback HLS server is unavailable on macOS (Catalyst)');
  }
  const fileDir = fileUriToPath(localDirUri);
  if (server && servingDir === fileDir && origin) return origin;

  await stopLocalHlsServer();

  // Lazy require so the native TurboModule is only evaluated on real iOS, never
  // during bundle load on Mac Catalyst (where it is stripped).
  const {
    default: StaticServerCtor,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
  } = require('@dr.pogodin/react-native-static-server') as StaticServerModule;

  const next = new StaticServerCtor({
    fileDir,
    hostname: '127.0.0.1',
    stopInBackground: false,
    extraConfig: [
      'mimetype.assign += (',
      '  ".m3u8" => "application/vnd.apple.mpegurl",',
      '  ".ts"   => "video/mp2t",',
      '  ".m4s"  => "video/iso.segment",',
      '  ".key"  => "application/octet-stream",',
      '  ".bin"  => "application/octet-stream"',
      ')',
    ].join('\n'),
  });
  const started = await next.start();
  server = next;
  servingDir = fileDir;
  origin = started;
  return started;
};

export const stopLocalHlsServer = async (): Promise<void> => {
  const current = server;
  server = null;
  servingDir = null;
  origin = null;
  if (!current) return;
  try {
    await current.stop();
  } catch {
    /* already stopped */
  }
};
