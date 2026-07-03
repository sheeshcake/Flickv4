import RNFS from 'react-native-fs';
import {
  PlaybackCachePreferences,
  DEFAULT_PLAYBACK_CACHE,
} from '../types';
import {
  M3U8Segment,
  M3U8Playlist,
  isM3U8Url,
  fetchM3U8Playlist,
  downloadSegmentToFile,
  getSegmentPath,
  findSegmentIndexAtTime,
  getCachedDurationAhead,
} from '../utils/m3u8';

const CACHE_ROOT = `${RNFS.CachesDirectoryPath}/FlickPlaybackCache`;
const KEEP_BEHIND_SECONDS = 30;
const CONCURRENCY = 3;

export interface PlaybackCacheStatus {
  cachedSecondsAhead: number;
  isBuffering: boolean;
  bytesUsed: number;
  isActive: boolean;
}

export interface PlaybackCacheSessionOptions {
  videoUrl: string;
  startTimeSec?: number;
  preferences?: PlaybackCachePreferences;
}

class PlaybackCacheService {
  private static instance: PlaybackCacheService;
  private sessionId: string | null = null;
  private sessionDir: string | null = null;
  private playlist: M3U8Playlist | null = null;
  private downloadedIndices = new Set<number>();
  private segmentSizes = new Map<number, number>();
  private bytesUsed = 0;
  private playheadSec = 0;
  private preferences: PlaybackCachePreferences = DEFAULT_PLAYBACK_CACHE;
  private abortController: AbortController | null = null;
  private downloadLoopRunning = false;
  private playlistPath: string | null = null;
  private playbackUrl: string | null = null;
  private statusListeners = new Set<(status: PlaybackCacheStatus) => void>();

  static getInstance(): PlaybackCacheService {
    if (!PlaybackCacheService.instance) {
      PlaybackCacheService.instance = new PlaybackCacheService();
    }
    return PlaybackCacheService.instance;
  }

  addStatusListener(listener: (status: PlaybackCacheStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.getCacheStatus());
    return () => this.statusListeners.delete(listener);
  }

  private notifyStatus(): void {
    const status = this.getCacheStatus();
    this.statusListeners.forEach((listener) => listener(status));
  }

  getCacheStatus(): PlaybackCacheStatus {
    const cachedSecondsAhead =
      this.playlist && this.downloadedIndices.size > 0
        ? getCachedDurationAhead(this.playlist.segments, this.downloadedIndices, this.playheadSec)
        : 0;

    return {
      cachedSecondsAhead,
      isBuffering: this.downloadLoopRunning,
      bytesUsed: this.bytesUsed,
      isActive: !!this.sessionId,
    };
  }

  getPlaybackUrl(): string | null {
    return this.playbackUrl;
  }

  async startSession(options: PlaybackCacheSessionOptions): Promise<string> {
    const { videoUrl, startTimeSec = 0, preferences = DEFAULT_PLAYBACK_CACHE } = options;

    if (!preferences.enabled || !isM3U8Url(videoUrl)) {
      return videoUrl;
    }

    await this.endSession();

    this.preferences = preferences;
    this.playheadSec = startTimeSec;
    this.sessionId = `cache_${Date.now()}`;
    this.sessionDir = `${CACHE_ROOT}/${this.sessionId}`;
    this.playlistPath = `${this.sessionDir}/playlist.m3u8`;
    this.abortController = new AbortController();

    await RNFS.mkdir(this.sessionDir);

    this.playlist = await fetchM3U8Playlist(videoUrl);
    await this.writePlaylist(false);

    this.downloadLoopRunning = true;
    this.runDownloadLoop().catch((err) => {
      console.warn('[PlaybackCache] Download loop error:', err);
    });

    if (preferences.preBufferSeconds > 0) {
      await this.waitForCachedAhead(preferences.preBufferSeconds);
    } else {
      await this.waitForCachedAhead(Math.min(15, preferences.readAheadSeconds));
    }

    this.playbackUrl = `file://${this.playlistPath}`;
    this.notifyStatus();
    return this.playbackUrl;
  }

  updatePlayhead(timeSec: number): void {
    if (!this.sessionId) return;
    this.playheadSec = timeSec;
    void this.evictBehindPlayhead();
    this.notifyStatus();
  }

  async endSession(): Promise<void> {
    this.abortController?.abort();
    this.abortController = null;
    this.downloadLoopRunning = false;

    const dir = this.sessionDir;
    this.sessionId = null;
    this.sessionDir = null;
    this.playlist = null;
    this.playlistPath = null;
    this.playbackUrl = null;
    this.downloadedIndices.clear();
    this.segmentSizes.clear();
    this.bytesUsed = 0;
    this.playheadSec = 0;

    if (dir) {
      try {
        const exists = await RNFS.exists(dir);
        if (exists) {
          await RNFS.unlink(dir);
        }
      } catch (error) {
        console.warn('[PlaybackCache] Failed to cleanup session:', error);
      }
    }

    this.notifyStatus();
  }

  private getMaxBytes(): number {
    const mb =
      this.preferences.storage === 'memory'
        ? Math.min(this.preferences.maxSizeMB, 64)
        : this.preferences.maxSizeMB;
    return mb * 1024 * 1024;
  }

  private async waitForCachedAhead(targetSeconds: number): Promise<void> {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline && this.downloadLoopRunning) {
      const ahead = getCachedDurationAhead(
        this.playlist!.segments,
        this.downloadedIndices,
        this.playheadSec,
      );
      if (ahead >= targetSeconds) {
        return;
      }
      await this.delay(250);
    }
  }

  private async runDownloadLoop(): Promise<void> {
    while (this.downloadLoopRunning && this.playlist && this.sessionDir) {
      const segmentsToFetch = this.getSegmentsInReadAheadWindow();
      const pending = segmentsToFetch.filter((i) => !this.downloadedIndices.has(i));

      if (pending.length === 0) {
        await this.delay(500);
        continue;
      }

      const batch = pending.slice(0, CONCURRENCY);
      await Promise.allSettled(
        batch.map((index) => this.downloadSegmentByIndex(index)),
      );

      await this.writePlaylist(false);
      this.notifyStatus();
      await this.delay(100);
    }
  }

  private getSegmentsInReadAheadWindow(): number[] {
    if (!this.playlist) return [];

    const startIndex = findSegmentIndexAtTime(this.playlist.segments, this.playheadSec);
    const indices: number[] = [];
    let accumulated = 0;
    let elapsed = this.playlist.segments
      .slice(0, startIndex)
      .reduce((sum, s) => sum + s.duration, 0);

    for (let i = startIndex; i < this.playlist.segments.length; i++) {
      if (accumulated >= this.preferences.readAheadSeconds) {
        break;
      }
      indices.push(i);
      accumulated += this.playlist.segments[i].duration;
      elapsed += this.playlist.segments[i].duration;
    }

    return indices;
  }

  private async downloadSegmentByIndex(index: number): Promise<void> {
    if (!this.playlist || !this.sessionDir || this.downloadedIndices.has(index)) {
      return;
    }

    const segment = this.playlist.segments[index];
    if (!segment) return;

    const segmentPath = getSegmentPath(this.sessionDir, index);

    try {
      if (this.bytesUsed >= this.getMaxBytes()) {
        await this.evictOldestOutsideWindow();
      }

      const bytes = await downloadSegmentToFile(
        segment.uri,
        segmentPath,
        this.abortController?.signal,
      );

      if (!this.downloadLoopRunning) return;

      this.downloadedIndices.add(index);
      this.segmentSizes.set(index, bytes);
      this.bytesUsed += bytes;
    } catch (error) {
      if (this.downloadLoopRunning) {
        console.warn(`[PlaybackCache] Segment ${index} failed:`, error);
      }
    }
  }

  private async evictBehindPlayhead(): Promise<void> {
    if (!this.playlist || !this.sessionDir) return;

    const currentIndex = findSegmentIndexAtTime(this.playlist.segments, this.playheadSec);
    let cutoffTime = this.playheadSec - KEEP_BEHIND_SECONDS;
    if (cutoffTime < 0) cutoffTime = 0;
    const cutoffIndex = findSegmentIndexAtTime(this.playlist.segments, cutoffTime);

    let evicted = false;
    for (const index of [...this.downloadedIndices]) {
      if (index < cutoffIndex && index < currentIndex - 1) {
        await this.removeSegment(index);
        evicted = true;
      }
    }

    if (evicted) {
      await this.writePlaylist(false);
    }
  }

  private async evictOldestOutsideWindow(): Promise<void> {
    if (!this.playlist) return;

    const windowIndices = new Set(this.getSegmentsInReadAheadWindow());
    const candidates = [...this.downloadedIndices]
      .filter((i) => !windowIndices.has(i))
      .sort((a, b) => a - b);

    for (const index of candidates) {
      await this.removeSegment(index);
      if (this.bytesUsed < this.getMaxBytes() * 0.8) {
        break;
      }
    }
  }

  private async removeSegment(index: number): Promise<void> {
    if (!this.sessionDir) return;

    const segmentPath = getSegmentPath(this.sessionDir, index);
    try {
      const exists = await RNFS.exists(segmentPath);
      if (exists) {
        await RNFS.unlink(segmentPath);
      }
    } catch {
      // Ignore
    }

    const size = this.segmentSizes.get(index) || 0;
    this.bytesUsed = Math.max(0, this.bytesUsed - size);
    this.downloadedIndices.delete(index);
    this.segmentSizes.delete(index);
  }

  private async writePlaylist(finalize: boolean): Promise<void> {
    if (!this.playlist || !this.playlistPath || !this.sessionDir) return;

    const lines: string[] = [
      '#EXTM3U',
      `#EXT-X-VERSION:${this.playlist.version}`,
      `#EXT-X-TARGETDURATION:${Math.ceil(this.playlist.targetDuration)}`,
      `#EXT-X-MEDIA-SEQUENCE:${this.playlist.mediaSequence}`,
    ];

    // Full timeline: cached segments use local files, the rest keep remote URIs so
    // the player can continue past the pre-buffer window without reloading the playlist.
    for (let index = 0; index < this.playlist.segments.length; index++) {
      const segment = this.playlist.segments[index];
      lines.push(`#EXTINF:${segment.duration.toFixed(3)},`);
      if (this.downloadedIndices.has(index)) {
        lines.push(`file://${getSegmentPath(this.sessionDir, index)}`);
      } else {
        lines.push(segment.uri);
      }
    }

    if (finalize || this.playlist.endList) {
      lines.push('#EXT-X-ENDLIST');
    }

    await RNFS.writeFile(this.playlistPath, lines.join('\n'), 'utf8');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const playbackCacheService = PlaybackCacheService.getInstance();
