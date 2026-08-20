/**
 * Android / web stub. AVPlayer is the only stack that cannot play `file://`
 * HLS; ExoPlayer plays on-disk playlists directly.
 */

export const serveLocalHls = async (_localDirUri: string): Promise<string> => {
  throw new Error('Loopback HLS server is iOS-only');
};

export const stopLocalHlsServer = async (): Promise<void> => {};
