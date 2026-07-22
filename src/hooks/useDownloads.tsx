import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DownloadService,
  type DownloadJob,
} from '@/src/services/DownloadService';
import type { MediaItem } from '@/src/types';

interface DownloadsContextValue {
  jobs: DownloadJob[];
  getJobFor: (
    item: Pick<MediaItem, 'id' | 'media_type'>,
    season?: number,
    episode?: number,
  ) => DownloadJob | undefined;
  enqueue: typeof DownloadService.enqueue;
  pause: typeof DownloadService.pause;
  resume: typeof DownloadService.resume;
  cancel: typeof DownloadService.cancel;
  remove: typeof DownloadService.remove;
  getLocalSource: typeof DownloadService.getLocalSource;
}

const DownloadsContext = createContext<DownloadsContextValue | null>(null);

export const DownloadsProvider = ({ children }: { children: ReactNode }) => {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);

  useEffect(() => {
    // Hydrate first, then subscribe. `subscribe` synchronously emits the
    // current snapshot.
    void DownloadService.hydrate();
    return DownloadService.subscribe(setJobs);
  }, []);

  const value = useMemo<DownloadsContextValue>(
    () => ({
      jobs,
      getJobFor: (item, season, episode) =>
        DownloadService.getJobFor(item, season, episode),
      enqueue: DownloadService.enqueue.bind(DownloadService),
      pause: DownloadService.pause.bind(DownloadService),
      resume: DownloadService.resume.bind(DownloadService),
      cancel: DownloadService.cancel.bind(DownloadService),
      remove: DownloadService.remove.bind(DownloadService),
      getLocalSource: DownloadService.getLocalSource.bind(DownloadService),
    }),
    [jobs],
  );

  return (
    <DownloadsContext.Provider value={value}>
      {children}
    </DownloadsContext.Provider>
  );
};

export const useDownloads = (): DownloadsContextValue => {
  const ctx = useContext(DownloadsContext);
  if (!ctx) {
    throw new Error('useDownloads must be used within DownloadsProvider');
  }
  return ctx;
};
