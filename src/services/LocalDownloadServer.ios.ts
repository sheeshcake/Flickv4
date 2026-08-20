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

import StaticServer from '@dr.pogodin/react-native-static-server';

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
  const fileDir = fileUriToPath(localDirUri);
  if (server && servingDir === fileDir && origin) return origin;

  await stopLocalHlsServer();

  const next = new StaticServer({
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
