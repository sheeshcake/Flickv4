/**
 * Notifee-backed notification driver for the download pipeline.
 */

import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AuthorizationStatus,
} from '@notifee/react-native';
import { Platform } from 'react-native';
import type { DownloadJob } from './DownloadService';

const CHANNEL_ID = 'flick-downloads';
const CHANNEL_NAME = 'Downloads';

const notifId = (jobId: string): string => `flick-download-${jobId}`;

// 1 second throttle per job prevents iOS UserNotifications daemon flooding
const MIN_PUBLISH_INTERVAL_MS = 1000;
const lastPublishAt = new Map<string, number>();

let channelReady: Promise<void> | null = null;

export const ensureChannel = async (): Promise<void> => {
  if (channelReady) return channelReady;

  if (Platform.OS === 'ios') {
    channelReady = (async () => {
      try {
        const settings = await notifee.getNotificationSettings();
        if (settings.authorizationStatus < AuthorizationStatus.AUTHORIZED) {
          await notifee.requestPermission({
            alert: true,
            badge: true,
            sound: true,
          });
        }
      } catch (e) {
        console.log('[DownloadNotifier] iOS permission error', e);
      }
    })();
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

// Generates a visual progress meter for iOS lock screen cards
const buildProgressBar = (pct: number): string => {
  const totalBlocks = 10;
  const filledBlocks = Math.round((pct / 100) * totalBlocks);
  const emptyBlocks = totalBlocks - filledBlocks;
  return `[${'■'.repeat(filledBlocks)}${'□'.repeat(emptyBlocks)}] ${pct}%`;
};

const bodyFor = (job: DownloadJob, pct: number): string => {
  switch (job.status) {
    case 'resolving':
      return 'Preparing stream…';
    case 'queued':
      return 'Waiting in queue…';
    case 'paused':
      return `Paused — ${pct}%`;
    case 'failed':
      return `Failed: ${job.error ?? 'Download error'}`;
    case 'completed':
      return 'Download complete! Ready to watch offline.';
    case 'downloading':
    default:
      return Platform.OS === 'ios' ? buildProgressBar(pct) : `${pct}%`;
  }
};

const isTerminalStatus = (job: DownloadJob): boolean =>
  job.status === 'completed' || job.status === 'failed';

export const publishJobNotification = async (
  job: DownloadJob,
): Promise<void> => {
  await ensureChannel();

  const pct = computePct(job);
  const terminal = isTerminalStatus(job);
  const now = Date.now();

  const last = lastPublishAt.get(job.id) ?? 0;
  if (!terminal && now - last < MIN_PUBLISH_INTERVAL_MS) {
    return;
  }
  lastPublishAt.set(job.id, now);

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
        threadId: notifId(job.id),
        interruptionLevel: 'timeSensitive',
        foregroundPresentationOptions: {
          banner: true,
          list: true,
        },
        sound: terminal && job.status === 'completed' ? 'default' : undefined,
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
