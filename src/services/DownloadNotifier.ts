/**
 * Notifee-backed notification driver for the download pipeline.
 */

import notifee, {
  AndroidImportance,
  AndroidVisibility,
} from '@notifee/react-native';
import { Platform } from 'react-native';
import type { DownloadJob } from './DownloadService';

const CHANNEL_ID = 'flick-downloads';
const CHANNEL_NAME = 'Downloads';

const notifId = (jobId: string): string => `flick-download-${jobId}`;

const MIN_PUBLISH_INTERVAL_MS = 500;
const lastPublishAt = new Map<string, number>();

let channelReady: Promise<void> | null = null;

export const ensureChannel = (): Promise<void> => {
  if (channelReady) return channelReady;
  if (Platform.OS !== 'android') {
    channelReady = Promise.resolve();
    return channelReady;
  }
  channelReady = notifee
    .createChannel({
      id: CHANNEL_ID,
      name: CHANNEL_NAME,
      importance: AndroidImportance.LOW,
      visibility: AndroidVisibility.PUBLIC,
      vibration: false,
    })
    .then(() => undefined)
    .catch((e) => {
      console.log('[DownloadNotifier] ensureChannel failed', e);
    });
  return channelReady;
};

const computePct = (job: DownloadJob): number => {
  if (job.totalSegments > 0) {
    return Math.round((job.completedSegments / job.totalSegments) * 100);
  }
  if (job.totalBytes > 0) {
    return Math.round((job.bytesWritten / job.totalBytes) * 100);
  }
  return 0;
};

const bodyFor = (job: DownloadJob, pct: number): string => {
  switch (job.status) {
    case 'resolving':
      return 'Preparing…';
    case 'queued':
      return 'Queued';
    case 'paused':
      return `Paused — ${pct}%`;
    case 'failed':
      return `Failed: ${job.error ?? 'unknown error'}`;
    case 'completed':
      return 'Download complete';
    case 'downloading':
    default:
      return `${pct}%`;
  }
};

const isTerminalStatus = (job: DownloadJob): boolean =>
  job.status === 'completed' || job.status === 'failed';

export const publishJobNotification = async (
  job: DownloadJob,
): Promise<void> => {
  const terminal = isTerminalStatus(job);

  // iOS Fix: iOS cannot do silent progress updates without spamming banners.
  // Only alert on iOS when completed or failed.
  if (Platform.OS === 'ios' && !terminal) {
    return;
  }

  await ensureChannel();

  const now = Date.now();
  if (!terminal) {
    const last = lastPublishAt.get(job.id) ?? 0;
    if (now - last < MIN_PUBLISH_INTERVAL_MS) return;
    lastPublishAt.set(job.id, now);
  } else {
    lastPublishAt.set(job.id, now);
  }

  const pct = computePct(job);
  const isActive =
    job.status === 'downloading' ||
    job.status === 'resolving' ||
    job.status === 'queued';

  const showProgress =
    job.status === 'downloading' || job.status === 'paused' || job.status === 'resolving';
  const indeterminate = job.status === 'resolving' || pct === 0;

  try {
    await notifee.displayNotification({
      id: notifId(job.id),
      title: `${job.title} — ${job.qualityLabel}`,
      body: bodyFor(job, pct),
      ios: {
        // Keeps iOS notifications silent upon completion
        sound: undefined,
      },
      android: {
        channelId: CHANNEL_ID,
        smallIcon: 'ic_launcher',
        ongoing: isActive,
        onlyAlertOnce: true,
        showTimestamp: false,
        progress: showProgress
          ? {
              max: 100,
              current: pct,
              indeterminate,
            }
          : undefined,
      },
    });
  } catch (e) {
    console.log('[DownloadNotifier] publish failed', e);
  }
};

export const dismissJobNotification = async (jobId: string): Promise<void> => {
  lastPublishAt.delete(jobId);
  try {
    await notifee.cancelNotification(notifId(jobId));
  } catch {
    /* noop */
  }
};
