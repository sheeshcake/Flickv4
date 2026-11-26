import { useEffect, useState } from 'react';
import {
  getReleaseReminders,
  subscribeReleaseReminders,
  type ReleaseReminder,
} from '@/src/services/ReleaseReminderService';

/** Live view of the device-local release calendar. */
export const useReleaseReminders = () => {
  const [reminders, setReminders] = useState<ReleaseReminder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void getReleaseReminders()
      .then((next) => {
        if (alive) setReminders(next);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    const unsubscribe = subscribeReleaseReminders((next) => {
      if (alive) setReminders(next);
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  return { reminders, loading };
};
