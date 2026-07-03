/**
 * Background Download Task
 *
 * Runs M3U8 downloads in a HeadlessJS context, separate from the UI thread.
 */

import BackgroundService from 'react-native-background-actions';
import RNFS from 'react-native-fs';
import { StorageService } from './StorageService';
import {
  isM3U8Url,
  fetchM3U8Playlist,
  downloadSegmentToFile,
  getSegmentPath,
  M3U8Segment,
} from '../utils/m3u8';

export { BackgroundService };

export interface BackgroundDownloadParams {
  downloadId: string;
  videoUrl: string;
  filePath: string;
  title: string;
  segmentsDir: string;
  selectedStreamUrl?: string;
}

// Configuration
const CONFIG = {
  M3U8_CONCURRENCY: 3,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  PROGRESS_UPDATE_INTERVAL: 3000,
};

const DOWNLOAD_STATE_KEY = '@flick:background_download_state';

interface DownloadState {
  downloadId: string;
  downloadedSegments: number[];
  failedSegments: { [key: number]: number };
  totalSegments: number;
  downloadedBytes: number;
  status: 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled';
  error?: string;
}

async function saveDownloadState(state: DownloadState): Promise<void> {
  try {
    const key = `${DOWNLOAD_STATE_KEY}:${state.downloadId}`;
    await StorageService.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.warn('[BackgroundDownload] Failed to save state:', error);
  }
}

async function loadDownloadState(downloadId: string): Promise<DownloadState | null> {
  try {
    const key = `${DOWNLOAD_STATE_KEY}:${downloadId}`;
    const data = await StorageService.getItem(key);
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn('[BackgroundDownload] Failed to load state:', error);
  }
  return null;
}

async function deleteDownloadState(downloadId: string): Promise<void> {
  try {
    const key = `${DOWNLOAD_STATE_KEY}:${downloadId}`;
    await StorageService.removeItem(key);
  } catch (error) {
    console.warn('[BackgroundDownload] Failed to delete state:', error);
  }
}

async function downloadSegment(
  segment: M3U8Segment,
  segmentsDir: string,
  state: DownloadState,
  abortSignal?: AbortSignal,
): Promise<{ success: boolean; bytes: number }> {
  const segmentPath = getSegmentPath(segmentsDir, segment.index);

  try {
    if (state.downloadedSegments.includes(segment.index)) {
      return { success: true, bytes: 0 };
    }

    if (state.status === 'cancelled' || state.status === 'paused') {
      return { success: false, bytes: 0 };
    }

    const dirExists = await RNFS.exists(segmentsDir);
    if (!dirExists) {
      state.status = 'cancelled';
      return { success: false, bytes: 0 };
    }

    const bytes = await downloadSegmentToFile(segment.uri, segmentPath, abortSignal);

    if (state.status !== 'downloading' || abortSignal?.aborted) {
      return { success: false, bytes: 0 };
    }

    return { success: true, bytes };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isDirectoryDeleted =
      errorMessage.includes('ENOENT') || errorMessage.includes('No such file or directory');

    if (isDirectoryDeleted) {
      state.status = 'cancelled';
      return { success: false, bytes: 0 };
    }

    if (state.status !== 'cancelled' && state.status !== 'paused') {
      console.warn(`[BackgroundDownload] Failed to download segment ${segment.index}:`, error);
      const retryCount = (state.failedSegments[segment.index] || 0) + 1;
      state.failedSegments[segment.index] = retryCount;

      try {
        const exists = await RNFS.exists(segmentPath);
        if (exists) {
          await RNFS.unlink(segmentPath);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
    return { success: false, bytes: 0 };
  }
}

async function combineSegments(
  segmentsDir: string,
  outputPath: string,
  totalSegments: number,
): Promise<number> {
  let totalSize = 0;

  for (let i = 0; i < totalSegments; i++) {
    const segmentPath = getSegmentPath(segmentsDir, i);

    try {
      const segmentData = await RNFS.readFile(segmentPath, 'base64');

      if (i === 0) {
        await RNFS.writeFile(outputPath, segmentData, 'base64');
      } else {
        await RNFS.appendFile(outputPath, segmentData, 'base64');
      }

      const stat = await RNFS.stat(segmentPath);
      totalSize += stat.size;
    } catch (error) {
      console.error(`[BackgroundDownload] Failed to read segment ${i}:`, error);
    }
  }

  try {
    await RNFS.unlink(segmentsDir);
  } catch (e) {
    console.warn('[BackgroundDownload] Failed to cleanup segments:', e);
  }

  return totalSize;
}

export const backgroundDownloadTask = async (taskData?: BackgroundDownloadParams): Promise<void> => {
  if (!taskData) {
    return;
  }

  const { downloadId, videoUrl, filePath, title, segmentsDir, selectedStreamUrl } = taskData;

  console.log(`[BackgroundDownload] Starting download task for: ${title}`);

  let state: DownloadState = (await loadDownloadState(downloadId)) || {
    downloadId,
    downloadedSegments: [],
    failedSegments: {},
    totalSegments: 0,
    downloadedBytes: 0,
    status: 'downloading',
  };

  state.status = 'downloading';

  try {
    const dirExists = await RNFS.exists(segmentsDir);
    if (!dirExists) {
      await RNFS.mkdir(segmentsDir);
    }

    if (!isM3U8Url(videoUrl)) {
      console.log('[BackgroundDownload] Direct file download, using native downloader');
      return;
    }

    console.log('[BackgroundDownload] Parsing M3U8 playlist...');
    const playlist = await fetchM3U8Playlist(videoUrl, selectedStreamUrl);
    state.totalSegments = playlist.segments.length;

    console.log(`[BackgroundDownload] Found ${state.totalSegments} segments`);

    for (let i = 0; i < playlist.segments.length; i++) {
      const segmentPath = getSegmentPath(segmentsDir, i);
      try {
        const exists = await RNFS.exists(segmentPath);
        if (exists) {
          const stat = await RNFS.stat(segmentPath);
          if (stat.size > 0 && !state.downloadedSegments.includes(i)) {
            state.downloadedSegments.push(i);
            state.downloadedBytes += stat.size;
          }
        }
      } catch {
        // Ignore
      }
    }

    console.log(
      `[BackgroundDownload] Resuming with ${state.downloadedSegments.length}/${state.totalSegments} segments`,
    );

    const pendingSegments = playlist.segments.filter(
      (s) => !state.downloadedSegments.includes(s.index),
    );

    if (pendingSegments.length > 0) {
      const abortController = new AbortController();
      let activeDownloads = 0;
      const downloadQueue = [...pendingSegments];
      let lastProgressUpdate = 0;

      const processQueue = async (): Promise<void> => {
        const downloadPromises: Promise<void>[] = [];

        while (downloadQueue.length > 0 && state.status === 'downloading') {
          while (activeDownloads >= CONFIG.M3U8_CONCURRENCY && state.status === 'downloading') {
            await new Promise<void>((resolve) => setTimeout(() => resolve(), 100));
          }

          if (state.status !== 'downloading') break;

          const segment = downloadQueue.shift();
          if (!segment) break;

          activeDownloads++;

          const downloadPromise = (async () => {
            try {
              const result = await downloadSegment(segment, segmentsDir, state, abortController.signal);

              if (result.success) {
                if (!state.downloadedSegments.includes(segment.index)) {
                  state.downloadedSegments.push(segment.index);
                  state.downloadedBytes += result.bytes;
                }
                delete state.failedSegments[segment.index];

                const now = Date.now();
                if (now - lastProgressUpdate >= CONFIG.PROGRESS_UPDATE_INTERVAL) {
                  lastProgressUpdate = now;
                  const progress = Math.round(
                    (state.downloadedSegments.length / state.totalSegments) * 100,
                  );

                  await BackgroundService.updateNotification({
                    taskDesc: `Downloading ${title}: ${progress}%`,
                    progressBar: {
                      max: 100,
                      value: progress,
                      indeterminate: false,
                    },
                  });

                  await saveDownloadState(state);
                }
              }
            } finally {
              activeDownloads--;
            }
          })();

          downloadPromises.push(downloadPromise);
        }

        await Promise.allSettled(downloadPromises);
      };

      await processQueue();

      let retryAttempt = 0;
      while (
        Object.keys(state.failedSegments).length > 0 &&
        retryAttempt < CONFIG.MAX_RETRIES &&
        state.status === 'downloading'
      ) {
        retryAttempt++;
        console.log(
          `[BackgroundDownload] Retry attempt ${retryAttempt} for ${Object.keys(state.failedSegments).length} failed segments`,
        );

        await new Promise<void>((resolve) => setTimeout(() => resolve(), CONFIG.RETRY_DELAY));

        const failedIndices = Object.keys(state.failedSegments).map(Number);
        const retrySegments = failedIndices
          .map((index) => playlist.segments.find((s) => s.index === index)!)
          .filter(Boolean);

        for (const segment of retrySegments) {
          if (state.status !== 'downloading') break;
          const result = await downloadSegment(segment, segmentsDir, state);
          if (result.success) {
            if (!state.downloadedSegments.includes(segment.index)) {
              state.downloadedSegments.push(segment.index);
              state.downloadedBytes += result.bytes;
            }
            delete state.failedSegments[segment.index];
          }
        }
      }

      if (state.status !== 'downloading') {
        await saveDownloadState(state);
        return;
      }

      if (state.downloadedSegments.length < state.totalSegments) {
        const remaining = state.totalSegments - state.downloadedSegments.length;
        state.status = 'failed';
        state.error = `Failed to download ${remaining} segments after ${CONFIG.MAX_RETRIES} retries`;
        await saveDownloadState(state);
        throw new Error(state.error);
      }
    }

    console.log('[BackgroundDownload] Combining segments...');
    await BackgroundService.updateNotification({
      taskDesc: `Finalizing ${title}...`,
      progressBar: {
        max: 100,
        value: 100,
        indeterminate: true,
      },
    });

    await combineSegments(segmentsDir, filePath, state.totalSegments);

    const outputStats = await RNFS.stat(filePath);
    if (outputStats.size === 0) {
      throw new Error('Combined video file is empty');
    }

    console.log(
      `[BackgroundDownload] Download completed! File size: ${Math.round(outputStats.size / 1024 / 1024)}MB`,
    );

    state.status = 'completed';
    await saveDownloadState(state);
    await deleteDownloadState(downloadId);
  } catch (error) {
    console.error('[BackgroundDownload] Download failed:', error);
    state.status = 'failed';
    state.error = error instanceof Error ? error.message : 'Unknown error';
    await saveDownloadState(state);
    throw error;
  }
};

export async function startBackgroundDownload(params: BackgroundDownloadParams): Promise<void> {
  const options = {
    taskName: 'FlickDownload',
    taskTitle: 'Downloading',
    taskDesc: `Downloading ${params.title}...`,
    taskIcon: {
      name: 'ic_launcher',
      type: 'mipmap',
    },
    color: '#e50914',
    parameters: params,
    progressBar: {
      max: 100,
      value: 0,
      indeterminate: true,
    },
    linkingURI: 'flickv4://downloads',
    foregroundServiceType: 'dataSync',
  };

  await BackgroundService.start(backgroundDownloadTask, options);
}

export async function stopBackgroundDownload(): Promise<void> {
  await BackgroundService.stop();
}

export function isBackgroundDownloadRunning(): boolean {
  return BackgroundService.isRunning();
}

export async function updateBackgroundNotification(desc: string, progress?: number): Promise<void> {
  if (BackgroundService.isRunning()) {
    await BackgroundService.updateNotification({
      taskDesc: desc,
      progressBar:
        progress !== undefined
          ? {
              max: 100,
              value: progress,
              indeterminate: false,
            }
          : undefined,
    });
  }
}
