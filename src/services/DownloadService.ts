import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
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
import type { PlaybackServer } from '@/src/hooks/useServers';
import type { ServerResolver } from '@/src/services/playbackHeaders';
import { STREAMFLIX_PLAYBACK_HEADERS } from '@/src/services/StreamflixService';
import {
  fetchHlsVariants,
  fetchMediaPlaylist,
  rewriteMediaPlaylist,
  type Variant,
} from '@/src/utils/hlsVariants';
import {
  dismissJobNotification,
  ensureChannel as ensureNotifChannel,
  publishJobNotification,
} from './DownloadNotifier';
import { serveLocalHls, stopLocalHlsServer } from './LocalDownloadServer';
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
  /** Server used to resolve this job — resume uses this, not the playback server. */
  serverId?: string;
  serverName?: string;
  /** Snapshot of the download server so resume can re-scrape without the global picker. */
  server?: PlaybackServer;
  /** IMDb id used for servers whose embed pattern needs `{imdbId}`. */
  imdbId?: string | null;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ResolveRequest {
  server: PlaybackServer;
  tmdbId: number;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  /** Raw show/movie title. */
  title?: string;
  imdbId?: string | null;
}

export interface ResolvedStream {
  videoUrl: string;
  isWebM: boolean;
}

export type Resolver = (req: ResolveRequest) => Promise<ResolvedStream>;

export interface EnqueueOptions {
  /** Full server used for this download (not the global playback picker). */
  server: PlaybackServer;
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
  imdbId?: string | null;
  /** Override request headers (e.g. Streamflix source Referer/Origin). */
  headers?: Record<string, string>;
  /** Display name for the Downloads list (may include Streamflix source). */
  serverName?: string;
}

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'flick.downloads';
const SEGMENT_CONCURRENCY = 4;
const SEGMENT_RETRIES = 3;

const TAG = '[DownloadService]';
// eslint-disable-next-line no-console
const log = (...args: unknown[]) => console.log(TAG, ...args);

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

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

const IOS_UNSUPPORTED_EXTS = new Set(['webm', 'mkv', 'avi']);

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
      isNetwork: false,
      type: job.kind === 'hls' ? 'm3u8' : undefined,
    };
  }

  /**
   * Ready a completed job for `<Video>`. On iOS, HLS is served over a
   * loopback HTTP server because AVPlayer will not play `file://` playlists.
   * Android uses the on-disk `file://` URI.
   */
  async prepareLocalPlayback(id: string): Promise<ReactVideoSource | null> {
    const base = this.getLocalSource(id);
    if (!base) return null;
    const job = this.jobs.get(id);
    if (!job) return null;
    if (Platform.OS === 'ios' && job.kind === 'hls') {
      try {
        const origin = await serveLocalHls(job.localDir);
        return {
          uri: `${origin.replace(/\/$/, '')}/local.m3u8`,
          isNetwork: true,
          type: 'm3u8',
        };
      } catch (e) {
        log('prepareLocalPlayback: loopback server failed', e);
        return null;
      }
    }
    return base;
  }

  async stopLocalPlayback(): Promise<void> {
    await stopLocalHlsServer();
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
      headers: opts.headers ?? buildHeaders(opts.server.url, opts.server.resolver),
      serverId: opts.server.id,
      serverName: opts.serverName ?? opts.server.name,
      server: opts.server,
      imdbId: opts.imdbId,
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

  async resume(id: string, server?: PlaybackServer): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    if (job.status !== 'paused' && job.status !== 'failed') return;
    this.cancelled.delete(id);
    this.updateJob(id, { status: 'queued', error: undefined });
    const resolvedServer =
      server ??
      job.server ??
      ({
        id: job.serverId ?? '',
        name: job.serverName ?? '',
        url: this.serverUrlFromHeaders(job.headers),
      } satisfies PlaybackServer);
    if (server) {
      this.updateJob(id, {
        server,
        serverId: server.id,
        serverName: server.name,
        headers: buildHeaders(server.url, server.resolver),
      });
    }
    void this.process(id, {
      server: resolvedServer,
      qualityHeight: job.qualityHeight,
      qualityLabel: job.qualityLabel,
      season: job.season,
      episode: job.episode,
      title: job.title,
      subtitleLanguage: job.subtitleLanguage,
      imdbId: job.imdbId,
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
          server: opts.server,
          tmdbId: job.item.id,
          type: job.item.media_type === 'tv' ? 'tv' : 'movie',
          season: job.season,
          episode: job.episode,
          title: getTitle(job.item),
          imdbId: opts.imdbId ?? job.imdbId,
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
    if (Platform.OS === 'ios' && IOS_UNSUPPORTED_EXTS.has(ext)) {
      this.updateJob(id, {
        status: 'failed',
        error: `${ext.toUpperCase()} cannot be played offline on iOS`,
      });
      return;
    }
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

    const unsupported = media.keys.find((k) => {
      const method = k.method.toUpperCase();
      return method !== 'AES-128' && method !== 'NONE';
    });
    if (unsupported) {
      this.updateJob(id, {
        status: 'failed',
        error: `HLS encryption ${unsupported.method} cannot be played offline`,
      });
      return;
    }

    // 3) Build the URL map (remote URI → relative path next to local.m3u8)
    // and prepare the segments folder. Relative paths work for both the iOS
    // loopback HTTP server and Android file:// HLS.
    const segmentsDirUri = `${job.localDir}/segments`;
    try {
      new Directory(segmentsDirUri).create({ intermediates: true });
    } catch {
      /* exists */
    }

    const absLocal = (rel: string): string => {
      const dir = job.localDir.endsWith('/')
        ? job.localDir.slice(0, -1)
        : job.localDir;
      return `${dir}/${rel}`;
    };

    const urlMap = new Map<string, string>();

    media.mapInits.forEach((uri, i) => {
      urlMap.set(uri, `segments/init-${i}.${extForUrl(uri, 'mp4')}`);
    });
    media.keys.forEach((k, i) => {
      urlMap.set(k.uri, `segments/key-${i}.bin`);
    });
    media.segments.forEach((seg, idx) => {
      urlMap.set(seg.uri, `segments/${pad(idx)}.${extForUrl(seg.uri, 'ts')}`);
    });

    // Reset progress counters — `markSegmentComplete` is idempotent and
    // will re-tally as segments (already on disk or freshly downloaded)
    // flow through it. No full-playlist HEAD probe: that stampeded the CDN
    // (~12 concurrent hits) and triggered 403/429 on the real downloads.
    this.updateJob(id, {
      status: 'downloading',
      totalSegments: media.segments.length,
      completedSegments: 0,
      completedSegmentIndices: [],
      bytesWritten: 0,
      totalBytes: 0,
    });

    // 4) Download every sidecar (every init + every rotated key) first.
    for (const uri of media.mapInits) {
      const ok = await this.downloadSidecar(id, uri, absLocal(urlMap.get(uri)!));
      if (!ok) {
        this.updateJob(id, {
          status: 'failed',
          error: 'Failed to download HLS init segment',
        });
        return;
      }
      if (this.cancelled.has(id)) return;
    }
    for (const k of media.keys) {
      const ok = await this.downloadSidecar(
        id,
        k.uri,
        absLocal(urlMap.get(k.uri)!),
      );
      if (!ok) {
        this.updateJob(id, {
          status: 'failed',
          error: 'Failed to download HLS encryption key',
        });
        return;
      }
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
        await this.downloadOneSegment(id, my, entry.seg.uri, absLocal(rel));
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

    // 6) Rewrite playlist to relative local paths and save as local.m3u8.
    // Reuses the raw text captured in step 2 — the network is *not* touched
    // here, so a stale/hung CDN cannot leave the job stuck at 100%.
    try {
      const { playlist: rewritten, leftoverRemoteUris } = rewriteMediaPlaylist(
        media.rawText,
        variantUri,
        urlMap,
      );
      if (leftoverRemoteUris.length) {
        const sample = leftoverRemoteUris[0];
        this.updateJob(id, {
          status: 'failed',
          error:
            leftoverRemoteUris.length === 1
              ? `Playlist still references remote: ${sample}`
              : `Playlist still references ${leftoverRemoteUris.length} remote URLs (${sample})`,
        });
        return;
      }
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
   * Never rejects — returns false on failure so the pipeline can fail the job
   * instead of marking an unplayable playlist complete.
   */
  private async downloadSidecar(
    id: string,
    url: string,
    destUri: string,
  ): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job) return false;
    const destFile = new File(destUri);
    // Skip if already present on disk from a previous run.
    try {
      if (destFile.exists) return true;
    } catch {
      /* fall through */
    }

    for (let attempt = 1; attempt <= SEGMENT_RETRIES; attempt++) {
      if (this.cancelled.has(id)) return false;
      const controller = new AbortController();
      this.trackAbort(id, controller);
      try {
        await File.downloadFileAsync(url, destFile, {
          headers: job.headers,
          idempotent: true,
          signal: controller.signal,
        });
        return true;
      } catch (e) {
        try {
          if (destFile.exists) destFile.delete();
        } catch {
          /* noop */
        }
        log('sidecar download failed', `attempt ${attempt}/${SEGMENT_RETRIES}`, url, e);
        if (this.cancelled.has(id)) return false;
        if (attempt < SEGMENT_RETRIES) await sleep(300 * attempt);
      } finally {
        this.untrackAbort(id, controller);
      }
    }
    return false;
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

    for (let attempt = 1; attempt <= SEGMENT_RETRIES; attempt++) {
      if (this.cancelled.has(id)) return;
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
        return;
      } catch (e) {
        try {
          if (destFile.exists) destFile.delete();
        } catch {
          /* noop */
        }
        if (last > 0) {
          const current = this.jobs.get(id);
          if (current) {
            this.updateJob(id, {
              bytesWritten: Math.max(0, current.bytesWritten - last),
            });
          }
        }
        log(
          'segment',
          idx,
          `attempt ${attempt}/${SEGMENT_RETRIES}`,
          'error',
          e,
        );
        if (this.cancelled.has(id)) return;
        if (attempt < SEGMENT_RETRIES) await sleep(300 * attempt);
      } finally {
        this.untrackAbort(id, controller);
      }
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
