import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import {
  completeHandler,
  createDownloadTask,
  getExistingDownloadTasks,
  setConfig,
  type DownloadTask,
} from '@kesha-antonov/react-native-background-downloader';
import type { ReactVideoSource } from 'react-native-video';
import { getTitle, type MediaItem } from '@/src/types';
import { originOf } from '@/src/utils/streamUrl';
import type { ServerResolver } from '@/src/services/playbackHeaders';
import { STREAMFLIX_PLAYBACK_HEADERS } from '@/src/services/StreamflixService';
import {
  fetchHlsVariants,
  fetchMediaPlaylist,
  probeTotalContentLength,
  rewriteMediaPlaylist,
  type Variant,
} from '@/src/utils/hlsVariants';
import {
  dismissJobNotification,
  ensureChannel as ensureNotifChannel,
  publishJobNotification,
} from './DownloadNotifier';
import { WyzieService } from './WyzieService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DownloadStatus =
  | 'queued'
  | 'resolving'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed';

/** Local subtitle sidecar bundled with a completed download. */
export interface LocalDownloadedSubtitle {
  id: string;
  language: string;
  display: string;
  localUri: string;
  isHearingImpaired?: boolean;
}

export interface DownloadJob {
  id: string;
  item: MediaItem;
  season?: number;
  episode?: number;
  title: string;
  qualityHeight: number;
  qualityLabel: string;
  status: DownloadStatus;
  /** Kind of media on disk (drives which player source we return). */
  kind: 'hls' | 'file';
  /** Original resolved stream URL from the scraper. */
  streamUri?: string;
  /** HLS variant playlist we picked (if HLS). */
  variantUri?: string;
  /** Total segments to download (HLS). 1 for direct-file. */
  totalSegments: number;
  completedSegments: number;
  /**
   * Segment indices that have been successfully written to disk. Persisted
   * as an array (Sets don't round-trip through `JSON.stringify`). Used to
   * make segment completion idempotent — see `markSegmentComplete`.
   */
  completedSegmentIndices?: number[];
  bytesWritten: number;
  totalBytes: number;
  /** Absolute directory URI holding the download. */
  localDir: string;
  /** Local playable URI once the job completes. */
  localUri?: string;
  /**
   * ISO 639-1 language requested for offline captions at enqueue time.
   * Empty/undefined means no subtitle download was requested.
   */
  subtitleLanguage?: string;
  /** Local subtitle files written next to the video (default language). */
  subtitles?: LocalDownloadedSubtitle[];
  headers: Record<string, string>;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ResolveRequest {
  baseUrl: string;
  tmdbId: number;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  /** Raw show/movie title. */
  title?: string;
  resolver?: ServerResolver;
}

export interface ResolvedStream {
  videoUrl: string;
  isWebM: boolean;
}

export type Resolver = (req: ResolveRequest) => Promise<ResolvedStream>;

export interface EnqueueOptions {
  serverUrl: string;
  qualityHeight: number;
  qualityLabel: string;
  season?: number;
  episode?: number;
  /** Human-readable label for the job (e.g. "Movie" or "S1 E3 — Pilot"). */
  title: string;
  /**
   * Pre-resolved stream URL. When the caller already ran the WebViewScraper
   * (e.g. to fetch HLS variants for the quality sheet) it can pass the
   * resulting URL here so we skip the redundant second resolve.
   */
  streamUri?: string;
  /**
   * ISO 639-1 code for the offline subtitle language to bundle (typically
   * the user's Settings default). Empty/undefined skips subtitle download.
   */
  subtitleLanguage?: string;
  resolver?: ServerResolver;
}

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'flick.downloads';
const SEGMENT_CONCURRENCY = 4;

const TAG = '[DownloadService]';
// eslint-disable-next-line no-console
const log = (...args: unknown[]) => console.log(TAG, ...args);

const pad = (n: number, width = 5) => n.toString().padStart(width, '0');

const inferKind = (url: string): 'hls' | 'file' => {
  const lower = url.split('?')[0].toLowerCase();
  if (lower.endsWith('.m3u8')) return 'hls';
  return 'file';
};

const extForUrl = (url: string, fallback = 'ts'): string => {
  const lower = url.split('?')[0].toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot === -1) return fallback;
  const ext = lower.slice(dot + 1);
  if (ext.length > 5) return fallback;
  return ext;
};

const jobIdFor = (
  item: MediaItem,
  season: number | undefined,
  episode: number | undefined,
  qualityHeight: number,
): string => {
  const media = item.media_type ?? 'movie';
  const suffix =
    season != null && episode != null ? `-s${season}e${episode}` : '';
  return `${media}-${item.id}${suffix}-q${qualityHeight}`;
};

const buildHeaders = (
  serverUrl: string,
  resolver?: ServerResolver,
): Record<string, string> =>
  resolver === 'streamflix'
    ? { ...STREAMFLIX_PLAYBACK_HEADERS }
    : {
        Referer: `${serverUrl}/`,
        Origin: originOf(serverUrl),
      };

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

type Listener = (jobs: DownloadJob[]) => void;

class DownloadServiceImpl {
  private jobs: Map<string, DownloadJob> = new Map();
  private listeners = new Set<Listener>();
  private resolver: Resolver | null = null;
  private hydrated = false;
  /** Live DownloadTask instances per job, keyed by task id. Only used by
   *  the single-file path (large MP4s) that still goes through the
   *  background-downloader library. HLS segments no longer create UIDT
   *  jobs — see `downloadOneSegment` for the rationale. */
  private taskIndex = new Map<string, Map<string, DownloadTask>>();
  /** In-flight `expo-file-system` fetch controllers per job. `pause()` /
   *  `cancel()` abort every entry so segment downloads stop instantly. */
  private abortControllers = new Map<string, Set<AbortController>>();
  /** Cancellation flags per job. */
  private cancelled = new Set<string>();

  // -------------------------------------------------------------------------
  // Bootstrap / persistence
  // -------------------------------------------------------------------------

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;

    try {
      // The background-downloader library is only used by the single-file
      // (large MP4) path now — HLS segments run through `expo-file-system`
      // to avoid the UIDT-mandated notification-per-job churn that Android
      // 14+ imposes on every JobScheduler task.
      //
      // With `showNotificationsEnabled: false` the single leftover UIDT job
      // posts one IMPORTANCE_MIN silent notification (invisible on the
      // status bar; only appears at the bottom of the shade). Our notifee
      // module owns the visible progress notification.
      setConfig({
        showNotificationsEnabled: false,
        progressInterval: 1000,
        maxParallelDownloads: SEGMENT_CONCURRENCY,
      });
    } catch (e) {
      log('setConfig failed', e);
    }

    // Notifee channel (Android). Idempotent — safe to call every hydrate.
    try {
      await ensureNotifChannel();
    } catch (e) {
      log('ensureNotifChannel failed', e);
    }

    // Load persisted jobs.
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DownloadJob[];
        for (const job of parsed) {
          // Any job that was mid-flight when the app died gets marked paused
          // so the user can decide whether to resume it.
          if (
            job.status === 'downloading' ||
            job.status === 'resolving' ||
            job.status === 'queued'
          ) {
            job.status = 'paused';
          }
          // Backfill for jobs persisted before we tracked segment indices.
          if (!job.completedSegmentIndices) {
            job.completedSegmentIndices = [];
          }
          this.jobs.set(job.id, job);
        }
      }
    } catch (e) {
      log('hydrate: failed to load jobs', e);
    }

    // Reattach any tasks the OS kept alive across a process death.
    try {
      const existing = await getExistingDownloadTasks();
      for (const task of existing) {
        // We don't know which job it belongs to unless we tag it via metadata;
        // metadata support is limited here, so we simply cancel orphaned tasks.
        try {
          await task.stop();
        } catch {
          /* noop */
        }
      }
    } catch (e) {
      log('getExistingDownloadTasks failed', e);
    }

    this.emit();
  }

  setResolver(resolver: Resolver | null): void {
    this.resolver = resolver;
  }

  /**
   * Run the currently-registered resolver directly. Used by the DetailScreen
   * to peek at the stream URL so we can fetch HLS variants for the quality
   * sheet before we actually enqueue a job.
   */
  async resolveStream(req: ResolveRequest): Promise<ResolvedStream> {
    if (!this.resolver) throw new Error('Resolver not ready');
    return this.resolver(req);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    // Emit current snapshot immediately.
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  snapshot(): DownloadJob[] {
    // Order by `createdAt` (set once at enqueue, never mutated) so the
    // Downloads list stays stable while jobs progress. `updatedAt` was
    // bumped on every progress delta, which made rows jump around as
    // bytes landed.
    return Array.from(this.jobs.values()).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  }

  getJob(id: string): DownloadJob | undefined {
    return this.jobs.get(id);
  }

  getJobFor(
    item: Pick<MediaItem, 'id' | 'media_type'>,
    season?: number,
    episode?: number,
  ): DownloadJob | undefined {
    const media = item.media_type ?? 'movie';
    return Array.from(this.jobs.values()).find(
      (j) =>
        (j.item.media_type ?? 'movie') === media &&
        j.item.id === item.id &&
        j.season === season &&
        j.episode === episode,
    );
  }

  getLocalSource(id: string): ReactVideoSource | null {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'completed' || !job.localUri) return null;
    return {
      uri: job.localUri,
      type: job.kind === 'hls' ? 'm3u8' : undefined,
    };
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async enqueue(item: MediaItem, opts: EnqueueOptions): Promise<DownloadJob> {
    await this.hydrate();
    if (!this.resolver) {
      throw new Error(
        'DownloadService has no resolver. Mount <DownloadResolverHost /> at the app root.',
      );
    }

    const id = jobIdFor(item, opts.season, opts.episode, opts.qualityHeight);

    // If a job already exists for this key, return it (avoid duplicates).
    const existing = this.jobs.get(id);
    if (existing) return existing;

    const localDir = `${Paths.document.uri}downloads/${id}`;
    try {
      new Directory(localDir).create({ intermediates: true });
    } catch {
      /* directory already exists */
    }

    const now = Date.now();
    const job: DownloadJob = {
      id,
      item,
      season: opts.season,
      episode: opts.episode,
      title: opts.title,
      qualityHeight: opts.qualityHeight,
      qualityLabel: opts.qualityLabel,
      status: 'queued',
      kind: opts.streamUri ? inferKind(opts.streamUri) : 'hls',
      streamUri: opts.streamUri,
      totalSegments: 0,
      completedSegments: 0,
      completedSegmentIndices: [],
      bytesWritten: 0,
      totalBytes: 0,
      localDir,
      subtitleLanguage: opts.subtitleLanguage?.trim() || undefined,
      headers: buildHeaders(opts.serverUrl, opts.resolver),
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(id, job);
    this.persist();
    this.emit();

    // Kick off pipeline async — do not block the caller.
    void this.process(id, opts).catch((e) => {
      log('unhandled process error for', id, e);
    });

    return job;
  }

  async pause(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    if (job.status !== 'downloading' && job.status !== 'resolving') return;
    this.cancelled.add(id);
    // Physically stop every in-flight native task (single-file MP4 case)
    // so pause feels instant instead of "wait for the current batch to
    // drain".
    const tasks = this.taskIndex.get(id);
    if (tasks) {
      for (const task of tasks.values()) {
        try {
          await task.stop();
        } catch {
          /* task may already be finished */
        }
      }
      tasks.clear();
    }
    // Also abort every in-flight expo-file-system segment download so HLS
    // jobs stop within a segment's worth of bytes.
    const aborts = this.abortControllers.get(id);
    if (aborts) {
      for (const ctrl of aborts) {
        try {
          ctrl.abort();
        } catch {
          /* already aborted */
        }
      }
      aborts.clear();
    }
    this.updateJob(id, { status: 'paused' });
  }

  async resume(id: string, serverUrl?: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    if (job.status !== 'paused' && job.status !== 'failed') return;
    this.cancelled.delete(id);
    this.updateJob(id, { status: 'queued', error: undefined });
    void this.process(id, {
      serverUrl: serverUrl ?? this.serverUrlFromHeaders(job.headers),
      qualityHeight: job.qualityHeight,
      qualityLabel: job.qualityLabel,
      season: job.season,
      episode: job.episode,
      title: job.title,
      subtitleLanguage: job.subtitleLanguage,
      resolver: job.headers.Referer?.includes('vidrock.net')
        ? 'streamflix'
        : undefined,
    }).catch((e) => log('resume: process failed', e));
  }

  async cancel(id: string): Promise<void> {
    this.cancelled.add(id);
    const job = this.jobs.get(id);
    if (!job) return;
    await this.remove(id);
  }

  async remove(id: string): Promise<void> {
    this.cancelled.add(id);
    const job = this.jobs.get(id);
    if (!job) return;
    // Stop any in-flight native tasks and fetches before deleting the
    // directory beneath them — otherwise the OkHttp writers would race
    // against `dir.delete()` and log spurious ENOENT errors.
    const tasks = this.taskIndex.get(id);
    if (tasks) {
      for (const task of tasks.values()) {
        try {
          await task.stop();
        } catch {
          /* noop */
        }
      }
      this.taskIndex.delete(id);
    }
    const aborts = this.abortControllers.get(id);
    if (aborts) {
      for (const ctrl of aborts) {
        try {
          ctrl.abort();
        } catch {
          /* noop */
        }
      }
      this.abortControllers.delete(id);
    }
    try {
      const dir = new Directory(job.localDir);
      if (dir.exists) dir.delete();
    } catch (e) {
      log('remove: failed to delete dir', e);
    }
    this.jobs.delete(id);
    this.persist();
    void dismissJobNotification(id);
    this.emit();
  }

  // -------------------------------------------------------------------------
  // Pipeline
  // -------------------------------------------------------------------------

  private async process(
    id: string,
    opts: EnqueueOptions,
  ): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;

    // 1) Resolve stream URL if we haven't yet.
    let streamUri = job.streamUri;
    if (!streamUri) {
      this.updateJob(id, { status: 'resolving' });
      try {
        const resolved = await this.resolver!({
          baseUrl: opts.serverUrl,
          tmdbId: job.item.id,
          type: job.item.media_type === 'tv' ? 'tv' : 'movie',
          season: job.season,
          episode: job.episode,
          title: getTitle(job.item),
          resolver: opts.resolver,
        });
        streamUri = resolved.videoUrl;
        this.updateJob(id, {
          streamUri,
          kind: inferKind(streamUri),
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        this.updateJob(id, { status: 'failed', error: message });
        return;
      }
    }

    if (this.cancelled.has(id)) return;

    // 2) Branch: HLS multi-segment, or single-file.
    const kind = this.jobs.get(id)?.kind ?? inferKind(streamUri);
    if (kind === 'file') {
      await this.downloadSingleFile(id, streamUri, opts.qualityLabel);
    } else {
      await this.downloadHls(id, streamUri, opts.qualityHeight);
    }

    // 3) Soft-fail subtitle sidecar — video is already playable offline even
    // if Wyzie is unreachable or has no track for the requested language.
    const after = this.jobs.get(id);
    if (after?.status === 'completed') {
      const lang = opts.subtitleLanguage?.trim() || after.subtitleLanguage;
      if (lang) {
        await this.downloadDefaultSubtitle(id, lang);
      }
    }
  }

  /**
   * Fetch the user's preferred Wyzie language and write it next to the video
   * as `subs/{lang}.srt`. Never fails the job — offline video still works
   * without captions.
   */
  private async downloadDefaultSubtitle(
    id: string,
    language: string,
  ): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;

    try {
      // Prefer WebVTT so offline native sidecars work on iOS (VTT-only) and
      // Android; our cue parser also accepts VTT for App captions mode.
      const results = await WyzieService.searchSubtitles({
        tmdbId: job.item.id,
        season: job.season,
        episode: job.episode,
        language,
        format: 'vtt',
      });
      if (!results.length) {
        log('no Wyzie tracks for', id, language);
        return;
      }
      const track =
        results.find((r) => !r.isHearingImpaired) ?? results[0];

      const text = await WyzieService.fetchSubtitleText(track.url);
      const subsDirUri = `${job.localDir}/subs`;
      try {
        new Directory(subsDirUri).create({ intermediates: true });
      } catch {
        /* exists */
      }

      const fileName = `${language}.vtt`;
      const dest = new File(subsDirUri, fileName);
      if (dest.exists) dest.delete();
      dest.create();
      dest.write(text);

      const entry: LocalDownloadedSubtitle = {
        id: track.id,
        language: track.language || language,
        display: track.display,
        localUri: dest.uri,
        isHearingImpaired: track.isHearingImpaired,
      };
      this.updateJob(id, { subtitles: [entry] });
      log('wrote offline subtitle', id, dest.uri);
    } catch (e) {
      log('subtitle download soft-failed for', id, e);
    }
  }

  private async downloadSingleFile(
    id: string,
    url: string,
    _label: string,
  ): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;

    this.updateJob(id, { status: 'downloading', totalSegments: 1 });

    const ext = extForUrl(url, 'mp4');
    const dest = `${job.localDir}/video.${ext}`;

    await new Promise<void>((resolve, reject) => {
      const task = createDownloadTask({
        id,
        url,
        destination: dest,
        headers: job.headers as unknown as Record<string, string>,
        metadata: { jobId: id, kind: 'file' },
      });
      this.trackTask(id, task);

      task.begin(({ expectedBytes }) => {
        this.updateJob(id, { totalBytes: expectedBytes || 0 });
      });
      task.progress(({ bytesDownloaded, bytesTotal }) => {
        if (this.cancelled.has(id)) return;
        this.updateJob(id, {
          bytesWritten: bytesDownloaded,
          totalBytes: bytesTotal || undefined,
        });
      });
      task.done(() => {
        this.untrackTask(id, id);
        this.updateJob(id, {
          status: 'completed',
          completedSegments: 1,
          localUri: dest,
        });
        void completeHandler(id);
        resolve();
      });
      task.error(({ error }) => {
        this.untrackTask(id, id);
        this.updateJob(id, { status: 'failed', error });
        void completeHandler(id);
        reject(new Error(error));
      });

      // Kick the task off. `createDownloadTask` alone leaves the task in the
      // PENDING state — nothing is dispatched to the native downloader until
      // `.start()` is called. Skipping this was why progress stayed at 0.
      task.start();
    }).catch((e) => log('single-file download failed', e));
  }

  private async downloadHls(
    id: string,
    masterUri: string,
    qualityHeight: number,
  ): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;

    // 1) Fetch master playlist and pick variant.
    let variantUri = masterUri;
    let variants: Variant[] = [];
    try {
      variants = await fetchHlsVariants(masterUri, job.headers);
      if (variants.length) {
        const closest = pickClosest(variants, qualityHeight);
        if (closest) variantUri = closest.uri;
      }
    } catch (e) {
      log('fetchHlsVariants failed', e);
    }
    if (this.cancelled.has(id)) return;
    this.updateJob(id, { variantUri });

    // 2) Fetch media playlist. `fetchMediaPlaylist` returns the raw text
    // alongside the parsed data so step 6 can rewrite the playlist without
    // a second (potentially-hanging) network round trip — which is what was
    // leaving jobs stuck at 100%.
    const media = await fetchMediaPlaylist(variantUri, job.headers);
    if (!media.segments.length) {
      this.updateJob(id, {
        status: 'failed',
        error: 'No segments in playlist',
      });
      return;
    }

    // 3) Build the URL map and prepare the segments folder.
    const segmentsDirUri = `${job.localDir}/segments`;
    try {
      new Directory(segmentsDirUri).create({ intermediates: true });
    } catch {
      /* exists */
    }

    const urlMap = new Map<string, string>();

    if (media.mapInit) {
      urlMap.set(media.mapInit, `segments/init.${extForUrl(media.mapInit, 'mp4')}`);
    }
    if (media.key) {
      urlMap.set(media.key.uri, 'segments/key.bin');
    }
    media.segments.forEach((seg, idx) => {
      urlMap.set(seg.uri, `segments/${pad(idx)}.${extForUrl(seg.uri, 'ts')}`);
    });

    // Reset progress counters — `markSegmentComplete` is idempotent and
    // will re-tally as segments (already on disk or freshly downloaded)
    // flow through it.
    this.updateJob(id, {
      status: 'downloading',
      totalSegments: media.segments.length,
      completedSegments: 0,
      completedSegmentIndices: [],
      bytesWritten: 0,
      totalBytes: 0,
    });

    // 3b) HEAD-probe every segment (and init/key sidecars) to learn the true
    //     total download size. Runs in parallel with the sidecar downloads
    //     below so it doesn't delay actual bytes hitting disk.
    const probeUris = [
      ...(media.mapInit ? [media.mapInit] : []),
      ...(media.key ? [media.key.uri] : []),
      ...media.segments.map((s) => s.uri),
    ];
    void probeTotalContentLength(probeUris, job.headers)
      .then((total) => {
        if (total != null && total > 0 && !this.cancelled.has(id)) {
          this.updateJob(id, { totalBytes: total });
        }
      })
      .catch(() => {
        /* leave totalBytes at 0 — UI will just show downloaded bytes */
      });

    // 4) Download every sidecar file (init + key) first.
    if (media.mapInit) {
      await this.downloadSidecar(id, media.mapInit, `${job.localDir}/${urlMap.get(media.mapInit)!}`);
      if (this.cancelled.has(id)) return;
    }
    if (media.key) {
      await this.downloadSidecar(id, media.key.uri, `${job.localDir}/${urlMap.get(media.key.uri)!}`);
      if (this.cancelled.has(id)) return;
    }

    // 5) Segments — concurrent with a small pool.
    const queue = media.segments.map((seg, idx) => ({ seg, idx }));
    let cursor = 0;

    const runner = async () => {
      while (cursor < queue.length) {
        if (this.cancelled.has(id)) return;
        const my = cursor++;
        const entry = queue[my];
        const rel = urlMap.get(entry.seg.uri)!;
        const absDest = `${job.localDir}/${rel}`;
        await this.downloadOneSegment(id, my, entry.seg.uri, absDest);
      }
    };

    const workers = Array.from(
      { length: Math.min(SEGMENT_CONCURRENCY, queue.length) },
      () => runner(),
    );
    await Promise.all(workers);

    if (this.cancelled.has(id)) return;

    const jobAfter = this.jobs.get(id);
    if (!jobAfter) return;
    if (jobAfter.completedSegments < media.segments.length) {
      this.updateJob(id, {
        status: 'failed',
        error: 'Some segments failed',
      });
      return;
    }

    // 6) Rewrite playlist to local relative paths and save as local.m3u8.
    // Reuses the raw text captured in step 2 — the network is *not* touched
    // here, so a stale/hung CDN cannot leave the job stuck at 100%.
    try {
      const rewritten = rewriteMediaPlaylist(media.rawText, variantUri, urlMap);
      const localPlaylist = new File(job.localDir, 'local.m3u8');
      if (localPlaylist.exists) localPlaylist.delete();
      localPlaylist.create();
      localPlaylist.write(rewritten);
      this.updateJob(id, {
        status: 'completed',
        localUri: localPlaylist.uri,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.updateJob(id, {
        status: 'failed',
        error: `Playlist write: ${message}`,
      });
    }
  }

  /**
   * Download a small HLS sidecar (init.mp4 or key.bin) via `expo-file-system`.
   *
   * Deliberately avoids `createDownloadTask` from the background-downloader
   * library: on Android 14+ every UIDT job posts a mandatory notification,
   * and even at IMPORTANCE_MIN the churn from 4 concurrent segment jobs
   * looks like spam in the notification shade.  A direct `File.downloadFileAsync`
   * uses OkHttp underneath with zero notifications.
   *
   * Never rejects — segment-level errors are handled at the pipeline level
   * via `completedSegments < totalSegments`. This mirrors the previous
   * best-effort behaviour of the UIDT variant.
   */
  private async downloadSidecar(
    id: string,
    url: string,
    destUri: string,
  ): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    const destFile = new File(destUri);
    // Skip if already present on disk from a previous run.
    try {
      if (destFile.exists) return;
    } catch {
      /* fall through */
    }

    const controller = new AbortController();
    this.trackAbort(id, controller);
    try {
      await File.downloadFileAsync(url, destFile, {
        headers: job.headers,
        idempotent: true,
        signal: controller.signal,
      });
    } catch (e) {
      // Any failure (abort, network, non-2xx) leaves a partial or missing
      // file behind — delete it so a future resume re-fetches cleanly.
      try {
        if (destFile.exists) destFile.delete();
      } catch {
        /* noop */
      }
      log('sidecar download failed', url, e);
    } finally {
      this.untrackAbort(id, controller);
    }
  }

  /**
   * Download one HLS segment via `expo-file-system`.
   *
   * See `downloadSidecar` for why we don't use the background-downloader
   * library here.  In short: HLS jobs have hundreds of segments and every
   * UIDT task on Android 14+ posts its own notification; the "silent"
   * channel is not grouped when `showNotificationsEnabled: false`, so the
   * shade fills with per-segment IMPORTANCE_MIN entries as segments cycle.
   */
  private async downloadOneSegment(
    id: string,
    idx: number,
    url: string,
    destUri: string,
  ): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;

    const destFile = new File(destUri);
    // Skip segments that already exist on disk (e.g. from a previous pass
    // that was paused mid-way). This keeps resume-after-pause O(remaining)
    // instead of re-downloading the whole thing.
    try {
      if (destFile.exists) {
        this.markSegmentComplete(id, idx);
        return;
      }
    } catch {
      /* fall through and download */
    }

    const controller = new AbortController();
    this.trackAbort(id, controller);
    let last = 0;
    try {
      await File.downloadFileAsync(url, destFile, {
        headers: job.headers,
        idempotent: true,
        signal: controller.signal,
        onProgress: ({ bytesWritten }) => {
          const delta = bytesWritten - last;
          last = bytesWritten;
          if (delta <= 0) return;
          const current = this.jobs.get(id);
          if (!current || this.cancelled.has(id)) return;
          this.updateJob(id, {
            bytesWritten: current.bytesWritten + delta,
          });
        },
      });
      this.markSegmentComplete(id, idx);
    } catch (e) {
      // Abort or network error — remove the partial file so a future
      // resume doesn't mistake garbage bytes for a completed segment.
      try {
        if (destFile.exists) destFile.delete();
      } catch {
        /* noop */
      }
      // Roll back the byte counter for whatever we already reported so
      // totalBytes/bytesWritten stays honest across a retry.
      if (last > 0) {
        const current = this.jobs.get(id);
        if (current) {
          this.updateJob(id, {
            bytesWritten: Math.max(0, current.bytesWritten - last),
          });
        }
      }
      // Don't rethrow — the pipeline tally decides success/failure.
      log('segment', idx, 'error', e);
    } finally {
      this.untrackAbort(id, controller);
    }
  }

  /**
   * Idempotently record segment `idx` as complete for `jobId`.  Prevents the
   * "stuck at 99% then 101%" bug that used to happen when pause raced with
   * the segment runner picking up the same index twice — every path that
   * finalizes a segment (found-on-disk or task.done) funnels through here.
   */
  private markSegmentComplete(jobId: string, idx: number): void {
    const current = this.jobs.get(jobId);
    if (!current) return;
    const already = current.completedSegmentIndices ?? [];
    if (already.includes(idx)) return;
    const nextIndices = [...already, idx];
    this.updateJob(jobId, {
      completedSegmentIndices: nextIndices,
      completedSegments: nextIndices.length,
    });
  }

  // -------------------------------------------------------------------------
  // Task tracking
  // -------------------------------------------------------------------------

  private trackTask(jobId: string, task: DownloadTask): void {
    let map = this.taskIndex.get(jobId);
    if (!map) {
      map = new Map();
      this.taskIndex.set(jobId, map);
    }
    map.set(task.id, task);
  }

  private untrackTask(jobId: string, taskId: string): void {
    this.taskIndex.get(jobId)?.delete(taskId);
  }

  private trackAbort(jobId: string, ctrl: AbortController): void {
    let set = this.abortControllers.get(jobId);
    if (!set) {
      set = new Set();
      this.abortControllers.set(jobId, set);
    }
    set.add(ctrl);
  }

  private untrackAbort(jobId: string, ctrl: AbortController): void {
    const set = this.abortControllers.get(jobId);
    if (!set) return;
    set.delete(ctrl);
    if (set.size === 0) this.abortControllers.delete(jobId);
  }

  private serverUrlFromHeaders(
    headers: Record<string, string>,
  ): string {
    const referer = headers.Referer ?? '';
    return referer.endsWith('/') ? referer.slice(0, -1) : referer;
  }

  // -------------------------------------------------------------------------
  // Reactivity helpers
  // -------------------------------------------------------------------------

  private updateJob(id: string, patch: Partial<DownloadJob>): void {
    const current = this.jobs.get(id);
    if (!current) return;
    const next: DownloadJob = { ...current, ...patch, updatedAt: Date.now() };
    this.jobs.set(id, next);
    this.persist();
    this.emit();
    // Publish a notification off the same source-of-truth as the UI. This
    // is the *only* place we notify from — segment progress and terminal
    // transitions both flow through here, so we don't have to sprinkle
    // notification calls across the download pipeline.
    //
    // `publishJobNotification` has its own 500 ms throttle per job, so
    // calling it from every progress tick is safe.
    void publishJobNotification(next);
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
  }

  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      try {
        AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(Array.from(this.jobs.values())),
        );
      } catch (e) {
        log('persist failed', e);
      }
    }, 150);
  }
}

// Pick the variant whose height is <= target, or the lowest available.
const pickClosest = (variants: Variant[], targetHeight: number): Variant | null => {
  if (!variants.length) return null;
  const sorted = [...variants].sort((a, b) => b.height - a.height);
  const capped = sorted.find((v) => v.height <= targetHeight);
  return capped ?? sorted[sorted.length - 1] ?? null;
};

export const formatBytes = (bytes: number): string => {
  if (!bytes || !Number.isFinite(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export const DownloadService = new DownloadServiceImpl();
