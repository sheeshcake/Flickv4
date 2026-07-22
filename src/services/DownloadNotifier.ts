/**
 * Notifee-backed notification driver for the download pipeline.
 *
 * Why not `expo-notifications`?  On Android `expo-notifications` has no
 * built-in "progress" notification style, so long HLS jobs with 300+
 * segments ended up either (a) spamming the tray with a new notification
 * per progress tick or (b) collapsing behind the OS-mandated
 * background-downloader UIDT summary.
 *
 * `@notifee/react-native` exposes `android.progress.{current,max,indeterminate}`
 * on `displayNotification`, which combined with a stable per-job id renders
 * exactly one live-updating progress notification per download.
 *
 * The public surface is intentionally tiny:
 *   - `ensureChannel()`      — call once at hydrate.
 *   - `publishJobNotification(job)` — call from every job state transition.
 *   - `dismissJobNotification(id)`  — call when a job is removed.
 *
 * Rate-limiting lives here rather than at every call site so that the four
 * parallel segment progress callbacks that hit `DownloadService.updateJob`
 * per tick can't overwhelm the notifee JSI bridge.
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

/**
 * Minimum ms between two `displayNotification` calls for the same job.
 * Notifee replaces atomically on same id — no visual spam even without
 * throttling — but each JSI call still round-trips native, so we keep it
 * to 500 ms.  Terminal states (`completed`, `failed`) bypass this.
 */
const MIN_PUBLISH_INTERVAL_MS = 500;

const lastPublishAt = new Map<string, number>();

let channelReady: Promise<void> | null = null;

/**
 * Idempotently create the download progress channel. Safe to call from
 * multiple places; the promise is memoized.
 */
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
      importance: AndroidImportance.LOW, // no heads-up, no sound
      visibility: AndroidVisibility.PUBLIC,
      vibration: false,
    })
    .then(() => undefined)
    .catch((e) => {
      // eslint-disable-next-line no-console
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

/**
 * Post or update the progress notification for `job`. Same job id maps to
 * the same notifee id, so this is an atomic replace on the tray — never a
 * new notification.
 *
 * Rate-limited to `MIN_PUBLISH_INTERVAL_MS` per job unless the status is
 * terminal (`completed` / `failed`), in which case the update always goes
 * through so users see the outcome immediately.
 */
export const publishJobNotification = async (
  job: DownloadJob,
): Promise<void> => {
  // Ensure the channel exists before the first ever call; safe on repeat
  // invocations (memoized).
  await ensureChannel();

  const now = Date.now();
  const terminal = isTerminalStatus(job);
  if (!terminal) {
    const last = lastPublishAt.get(job.id) ?? 0;
    if (now - last < MIN_PUBLISH_INTERVAL_MS) return;
    lastPublishAt.set(job.id, now);
  } else {
    // Terminal transitions always publish and clear the throttle bookkeeping.
    lastPublishAt.set(job.id, now);
  }

  const pct = computePct(job);
  const isActive =
    job.status === 'downloading' ||
    job.status === 'resolving' ||
    job.status === 'queued';

  // Show a real progress bar only when we actually have progress to display.
  // Indeterminate spinner while resolving or before the first byte lands.
  const showProgress =
    job.status === 'downloading' || job.status === 'paused' || job.status === 'resolving';
  const indeterminate = job.status === 'resolving' || pct === 0;

  try {
    await notifee.displayNotification({
      id: notifId(job.id),
      title: `${job.title} — ${job.qualityLabel}`,
      body: bodyFor(job, pct),
      android: {
        channelId: CHANNEL_ID,
        // `ic_launcher` is the app's launcher icon; Android will silhouette
        // it on API 26+. Users who want a proper monochrome badge can drop
        // a `notification_icon.png` into `android/app/src/main/res/drawable-*`
        // and swap the name here.
        smallIcon: 'ic_launcher',
        ongoing: isActive, // sticky while running, dismissable when done
        onlyAlertOnce: true, // never re-alert on updates
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
    // eslint-disable-next-line no-console
    console.log('[DownloadNotifier] publish failed', e);
  }
};

/**
 * Remove the notification for `jobId` (used when the user deletes a job).
 * Safe to call for jobs that have no notification posted.
 */
export const dismissJobNotification = async (jobId: string): Promise<void> => {
  lastPublishAt.delete(jobId);
  try {
    await notifee.cancelNotification(notifId(jobId));
  } catch {
    /* noop */
  }
};
