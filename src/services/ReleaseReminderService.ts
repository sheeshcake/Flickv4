import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getReleaseDate, getTitle, type MediaItem } from '@/src/types';

/**
 * Device-local release calendar.
 *
 * Reminders are scheduled with `expo-notifications` at 09:00 in the device's
 * own time zone on the title's TMDB release date. No account, server, or
 * device-calendar write is involved — the state lives in AsyncStorage and the
 * pending notification lives with the OS scheduler.
 */

export const RELEASE_REMINDER_CHANNEL_ID = 'coffehouse-release-reminders';

export interface ReleaseReminder {
  key: string;
  mediaType: 'movie' | 'tv';
  id: number;
  title: string;
  releaseDate: string;
  /** Epoch ms of the local notification fire time. */
  scheduledFor: number;
  notificationId: string | null;
  createdAt: number;
}

export type ReminderToggleResult =
  | { enabled: true; reminder: ReleaseReminder }
  | {
      enabled: false;
      reason?: 'no-date' | 'past-date' | 'permission' | 'unsupported';
    };

type Listener = (reminders: ReleaseReminder[]) => void;

const STORAGE_KEY = 'coffehouse.release-reminders.v1';
const REMINDER_HOUR = 9;
const listeners = new Set<Listener>();
let cached: ReleaseReminder[] | null = null;
let setupPromise: Promise<boolean> | null = null;

const localIsoDate = (date: Date): string =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

export const reminderKeyFor = (item: MediaItem): string =>
  `${item.media_type === 'tv' ? 'tv' : 'movie'}-${item.id}`;

const normalize = (raw: unknown): ReleaseReminder[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((value): value is ReleaseReminder => {
      const candidate = value as Partial<ReleaseReminder> | null;
      return (
        !!candidate &&
        typeof candidate.key === 'string' &&
        (candidate.mediaType === 'movie' || candidate.mediaType === 'tv') &&
        typeof candidate.id === 'number' &&
        typeof candidate.title === 'string' &&
        typeof candidate.releaseDate === 'string' &&
        typeof candidate.scheduledFor === 'number'
      );
    })
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
};

const notify = (reminders: ReleaseReminder[]) => {
  listeners.forEach((listener) => listener(reminders));
};

const persist = async (reminders: ReleaseReminder[]): Promise<void> => {
  cached = reminders;
  notify(reminders);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
  } catch {
    // Keep the in-memory copy so the current session stays consistent.
  }
};

const readStored = async (): Promise<ReleaseReminder[]> => {
  if (cached) return cached;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cached = raw ? normalize(JSON.parse(raw)) : [];
  } catch {
    cached = [];
  }
  return cached;
};

/** Resolve a TMDB date to a local 09:00 fire time, never in the past. */
const scheduleDateFor = (releaseDate: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(releaseDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const localDate = new Date(year, month - 1, day, REMINDER_HOUR, 0, 0, 0);
  if (Number.isNaN(localDate.getTime())) return null;

  const now = new Date();
  if (localDate.getTime() > now.getTime()) return localDate;

  // Release is today but the usual reminder slot has passed: still notify the
  // user shortly after they asked instead of silently dropping the reminder.
  if (localIsoDate(localDate) === localIsoDate(now)) {
    return new Date(now.getTime() + 2 * 60 * 1000);
  }
  return null;
};

/**
 * Set up the foreground presentation handler + Android channel once. This does
 * NOT prompt: permission is requested only when a user actually sets a reminder.
 */
export const bootstrapReleaseReminders = async (): Promise<boolean> => {
  if (Platform.OS === 'web') return false;
  if (setupPromise) return setupPromise;

  setupPromise = (async () => {
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(
          RELEASE_REMINDER_CHANNEL_ID,
          {
            name: 'Release reminders',
            description: 'Local alerts for movie and series release dates.',
            importance: Notifications.AndroidImportance.HIGH,
            lightColor: '#C47C48',
            enableVibrate: true,
            sound: 'default',
          },
        );
      }
      return true;
    } catch {
      return false;
    }
  })();

  return setupPromise;
};

const ensurePermission = async (): Promise<boolean> => {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted || current.status === 'granted') return true;
    if (!current.canAskAgain) return false;
    const next = await Notifications.requestPermissionsAsync({
      android: {},
      ios: {
        allowAlert: true,
        allowBadge: false,
        allowSound: true,
      },
    });
    return next.granted || next.status === 'granted';
  } catch {
    return false;
  }
};

/** Upcoming reminders, oldest release date first; stale entries are pruned. */
export const getReleaseReminders = async (): Promise<ReleaseReminder[]> => {
  const stored = await readStored();
  const today = localIsoDate(new Date());
  const active = stored.filter((reminder) => reminder.releaseDate >= today);

  if (active.length !== stored.length) {
    await Promise.all(
      stored
        .filter((reminder) => reminder.releaseDate < today)
        .map(async (reminder) => {
          if (!reminder.notificationId) return;
          try {
            await Notifications.cancelScheduledNotificationAsync(
              reminder.notificationId,
            );
          } catch {
            // Already fired or cancelled by the OS — nothing to do.
          }
        }),
    );
    await persist(active);
  }
  return active;
};

export const subscribeReleaseReminders = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const isReleaseReminderEnabled = async (
  item: MediaItem,
): Promise<boolean> => {
  const key = reminderKeyFor(item);
  return (await getReleaseReminders()).some((reminder) => reminder.key === key);
};

/** Toggle a release reminder and return the new state. */
export const toggleReleaseReminder = async (
  item: MediaItem,
): Promise<ReminderToggleResult> => {
  const releaseDate = getReleaseDate(item);
  if (!releaseDate) return { enabled: false, reason: 'no-date' };

  const ready = await bootstrapReleaseReminders();
  if (!ready) return { enabled: false, reason: 'unsupported' };

  const key = reminderKeyFor(item);
  const stored = await getReleaseReminders();
  const existing = stored.find((reminder) => reminder.key === key);

  if (existing) {
    if (existing.notificationId) {
      try {
        await Notifications.cancelScheduledNotificationAsync(
          existing.notificationId,
        );
      } catch {
        // Cancellation is best-effort; still remove our local record.
      }
    }
    await persist(stored.filter((reminder) => reminder.key !== key));
    return { enabled: false };
  }

  const scheduledFor = scheduleDateFor(releaseDate);
  if (!scheduledFor) return { enabled: false, reason: 'past-date' };

  const permitted = await ensurePermission();
  if (!permitted) return { enabled: false, reason: 'permission' };

  const mediaType: 'movie' | 'tv' = item.media_type === 'tv' ? 'tv' : 'movie';
  const title = getTitle(item);

  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Release day',
        body: `${title} is out today.`,
        sound: true,
        data: { reminderKey: key, mediaType, id: item.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: scheduledFor,
        channelId: RELEASE_REMINDER_CHANNEL_ID,
      },
    });

    const reminder: ReleaseReminder = {
      key,
      mediaType,
      id: item.id,
      title,
      releaseDate,
      scheduledFor: scheduledFor.getTime(),
      notificationId,
      createdAt: Date.now(),
    };
    await persist([...stored, reminder]);
    return { enabled: true, reminder };
  } catch {
    return { enabled: false, reason: 'unsupported' };
  }
};

export const removeReleaseReminder = async (key: string): Promise<void> => {
  const stored = await getReleaseReminders();
  const target = stored.find((reminder) => reminder.key === key);
  if (target?.notificationId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(
        target.notificationId,
      );
    } catch {
      // Ignore OS-side cancellation failures.
    }
  }
  await persist(stored.filter((reminder) => reminder.key !== key));
};

/** Small helper for UI badges that need a stable key from a stored reminder. */
export const reminderKeyFromRecord = (reminder: ReleaseReminder): string =>
  `${reminder.mediaType}-${reminder.id}`;
