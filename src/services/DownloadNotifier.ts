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

const MIN_PUBLISH_INTERVAL_MS = 1000;
const lastPublishAt = new Map<string, number>();
const iosMilestones = new Map<string, Set<number>>();

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
      return 'Download complete! Ready to watch offline.';
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
  await ensureChannel();

  const pct = computePct(job);
  const terminal = isTerminalStatus(job);
  const now = Date.now();

  // On iOS: only post notifications at Start (0%), 50%, and Finish (100% or Failed)
  if (Platform.OS === 'ios') {
    if (!iosMilestones.has(job.id)) {
      iosMilestones.set(job.id, new Set());
    }
    const milestones = iosMilestones.get(job.id)!;

    let shouldPublishIOS = false;
    if (job.status === 'downloading' && !milestones.has(0)) {
      milestones.add(0);
      shouldPublishIOS = true;
    } else if (pct >= 50 && !milestones.has(50)) {
      milestones.add(50);
      shouldPublishIOS = true;
    } else if (terminal && !milestones.has(100)) {
      milestones.add(100);
      shouldPublishIOS = true;
    }

    if (!shouldPublishIOS) return;
  }

  if (!terminal) {
    const last = lastPublishAt.get(job.id) ?? 0;
    if (now - last < MIN_PUBLISH_INTERVAL_MS) return;
    lastPublishAt.set(job.id, now);
  } else {
    lastPublishAt.set(job.id, now);
  }

  const isActive =
    job.status === 'downloading' ||
    job.status === 'resolving' ||
    job.status === 'queued';

  try {
    await notifee.displayNotification({
      id: notifId(job.id),
      title: `${job.title} — ${job.qualityLabel}`,
      body: bodyFor(job, pct),
      ios: {
        sound: terminal ? 'default' : undefined,
      },
      android: {
        channelId: CHANNEL_ID,
        smallIcon: 'ic_launcher',
        ongoing: isActive,
        onlyAlertOnce: true,
        showTimestamp: false,
        progress: {
          max: 100,
          current: pct,
          indeterminate: job.status === 'resolving' || pct === 0,
        },
      },
    });
  } catch (e) {
    console.log('[DownloadNotifier] publish failed', e);
  }
};

export const dismissJobNotification = async (jobId: string): Promise<void> => {
  lastPublishAt.delete(jobId);
  iosMilestones.delete(jobId);
  try {
    await notifee.cancelNotification(notifId(jobId));
  } catch {}
};
