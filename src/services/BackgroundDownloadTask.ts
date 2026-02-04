/**
 * Background Download Task
 * 
 * This file contains the background task that runs downloads in a HeadlessJS context.
 * It runs completely separate from the main UI thread, preventing any lag.
 */

import BackgroundService from 'react-native-background-actions';
import RNFS from 'react-native-fs';
import { fromByteArray } from 'react-native-quick-base64';
import { StorageService } from './StorageService';

// Re-export for use in DownloadService
export { BackgroundService };

export interface BackgroundDownloadParams {
  downloadId: string;
  videoUrl: string;
  filePath: string;
  title: string;
  segmentsDir: string;
  selectedStreamUrl?: string;
}

export interface M3U8SegmentData {
  uri: string;
  duration: number;
  index: number;
}

export interface M3U8PlaylistData {
  segments: M3U8SegmentData[];
  totalDuration: number;
}

// Configuration
const CONFIG = {
  M3U8_CONCURRENCY: 3,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  PROGRESS_UPDATE_INTERVAL: 3000, // Update every 3 seconds
};

// Storage key for download state
const DOWNLOAD_STATE_KEY = '@flick:background_download_state';

// Download state that persists across background task restarts
interface DownloadState {
  downloadId: string;
  downloadedSegments: number[];
  failedSegments: { [key: number]: number };
  totalSegments: number;
  downloadedBytes: number;
  status: 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled';
  error?: string;
}

/**
 * Save download state to storage
 */
async function saveDownloadState(state: DownloadState): Promise<void> {
  try {
    const key = `${DOWNLOAD_STATE_KEY}:${state.downloadId}`;
    await StorageService.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.warn('[BackgroundDownload] Failed to save state:', error);
  }
}

/**
 * Load download state from storage
 */
async function loadDownloadState(downloadId: string): Promise<DownloadState | null> {
  try {
    const key = `${DOWNLOAD_STATE_KEY}:${downloadId}`;
    const data = await StorageService.getItem(key);
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn('[BackgroundDownload] Failed to load state:', error);
  }
  return null;
}

/**
 * Delete download state from storage
 */
async function deleteDownloadState(downloadId: string): Promise<void> {
  try {
    const key = `${DOWNLOAD_STATE_KEY}:${downloadId}`;
    await StorageService.removeItem(key);
  } catch (error) {
    console.warn('[BackgroundDownload] Failed to delete state:', error);
  }
}

/**
 * Convert ArrayBuffer to Base64 using native implementation
 * This is ~16x faster than the JS implementation
 */
function arrayBufferToBase64Native(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return fromByteArray(bytes);
}

/**
 * Check if URL is M3U8 playlist
 */
function isM3U8Url(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return lowerUrl.includes('.m3u8') || 
         lowerUrl.includes('.m3u') ||
         lowerUrl.includes('application/x-mpegurl') ||
         lowerUrl.includes('application/vnd.apple.mpegurl');
}

/**
 * Resolve relative URL
 */
function resolveUrl(url: string, baseUrl: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (url.startsWith('/')) {
    const urlParts = baseUrl.match(/^(https?:\/\/[^/]+)/);
    return urlParts ? urlParts[1] + url : baseUrl.substring(0, baseUrl.lastIndexOf('/')) + url;
  }
  return baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1) + url;
}

/**
 * Parse M3U8 playlist
 */
async function parseM3U8Playlist(url: string, selectedStreamUrl?: string): Promise<M3U8PlaylistData> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch M3U8 playlist: ${response.status}`);
  }

  const playlistText = await response.text();
  const lines = playlistText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // Check if this is a master playlist
  const isMasterPlaylist = lines.some(line => line.includes('#EXT-X-STREAM-INF'));
  
  if (isMasterPlaylist) {
    // If selectedStreamUrl provided, use it directly
    if (selectedStreamUrl) {
      return await parseM3U8Playlist(selectedStreamUrl);
    }
    
    // Otherwise select highest quality
    const streams: { bandwidth: number; url: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
        if (i + 1 < lines.length && !lines[i + 1].startsWith('#')) {
          streams.push({
            bandwidth: bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0,
            url: lines[i + 1],
          });
        }
      }
    }
    
    if (streams.length === 0) {
      throw new Error('No streams found in master playlist');
    }
    
    const bestStream = streams.reduce((best, current) => 
      current.bandwidth > best.bandwidth ? current : best
    );
    
    const resolvedUrl = resolveUrl(bestStream.url, url);
    return await parseM3U8Playlist(resolvedUrl);
  }

  // Parse media playlist
  const segments: M3U8SegmentData[] = [];
  let targetDuration = 10;
  let currentDuration = 10;
  let segmentIndex = 0;
  let totalDuration = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      targetDuration = parseInt(line.split(':')[1], 10) || 10;
    } else if (line.startsWith('#EXTINF:')) {
      const durationMatch = line.match(/#EXTINF:([\d.]+)/);
      if (durationMatch) {
        currentDuration = parseFloat(durationMatch[1]);
      }
    } else if (!line.startsWith('#') && line.length > 0) {
      const resolvedUri = resolveUrl(line, url);
      segments.push({
        uri: resolvedUri,
        duration: currentDuration,
        index: segmentIndex++,
      });
      totalDuration += currentDuration;
      currentDuration = targetDuration;
    }
  }
  
  if (segments.length === 0) {
    throw new Error('No segments found in M3U8 playlist');
  }
  
  return { segments, totalDuration };
}

/**
 * Download a single segment
 */
async function downloadSegment(
  segment: M3U8SegmentData,
  segmentsDir: string,
  state: DownloadState,
  abortSignal?: AbortSignal
): Promise<{ success: boolean; bytes: number }> {
  const segmentPath = `${segmentsDir}/segment_${segment.index.toString().padStart(5, '0')}.ts`;
  
  try {
    // Skip if already downloaded
    if (state.downloadedSegments.includes(segment.index)) {
      return { success: true, bytes: 0 };
    }

    // Check if cancelled
    if (state.status === 'cancelled' || state.status === 'paused') {
      return { success: false, bytes: 0 };
    }

    const response = await fetch(segment.uri, { signal: abortSignal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Check again after fetch
    if (state.status === 'cancelled' || state.status === 'paused' || abortSignal?.aborted) {
      return { success: false, bytes: 0 };
    }

    const arrayBuffer = await response.arrayBuffer();
    
    // Check again before writing
    if (state.status === 'cancelled' || state.status === 'paused' || abortSignal?.aborted) {
      return { success: false, bytes: 0 };
    }

    // Check if directory still exists (may have been deleted if download was cancelled)
    const dirExists = await RNFS.exists(segmentsDir);
    if (!dirExists) {
      console.log(`[BackgroundDownload] Segments directory deleted, aborting segment ${segment.index}`);
      state.status = 'cancelled';
      return { success: false, bytes: 0 };
    }

    // Use native base64 encoding (16x faster)
    const base64Data = arrayBufferToBase64Native(arrayBuffer);
    await RNFS.writeFile(segmentPath, base64Data, 'base64');

    return { success: true, bytes: arrayBuffer.byteLength };

  } catch (error) {
    // Check if this is an ENOENT error (directory deleted - download cancelled)
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isDirectoryDeleted = errorMessage.includes('ENOENT') || errorMessage.includes('No such file or directory');
    
    if (isDirectoryDeleted) {
      // Directory was deleted, mark as cancelled and stop silently
      state.status = 'cancelled';
      return { success: false, bytes: 0 };
    }
    
    if (state.status !== 'cancelled' && state.status !== 'paused') {
      console.warn(`[BackgroundDownload] Failed to download segment ${segment.index}:`, error);
      
      // Track retry count
      const retryCount = (state.failedSegments[segment.index] || 0) + 1;
      state.failedSegments[segment.index] = retryCount;
      
      // Delete partial file
      try {
        const exists = await RNFS.exists(segmentPath);
        if (exists) {
          await RNFS.unlink(segmentPath);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
    return { success: false, bytes: 0 };
  }
}

/**
 * Combine segments into final video file
 */
async function combineSegments(
  segmentsDir: string,
  outputPath: string,
  totalSegments: number
): Promise<number> {
  let totalSize = 0;
  
  for (let i = 0; i < totalSegments; i++) {
    const segmentPath = `${segmentsDir}/segment_${i.toString().padStart(5, '0')}.ts`;
    
    try {
      const segmentData = await RNFS.readFile(segmentPath, 'base64');
      
      if (i === 0) {
        await RNFS.writeFile(outputPath, segmentData, 'base64');
      } else {
        await RNFS.appendFile(outputPath, segmentData, 'base64');
      }
      
      const stat = await RNFS.stat(segmentPath);
      totalSize += stat.size;
    } catch (error) {
      console.error(`[BackgroundDownload] Failed to read segment ${i}:`, error);
    }
  }

  // Clean up segments directory
  try {
    await RNFS.unlink(segmentsDir);
  } catch (e) {
    console.warn('[BackgroundDownload] Failed to cleanup segments:', e);
  }

  return totalSize;
}

/**
 * The main background download task
 * This runs in HeadlessJS, completely separate from the UI thread
 */
export const backgroundDownloadTask = async (taskData: BackgroundDownloadParams): Promise<void> => {
  const { downloadId, videoUrl, filePath, title, segmentsDir, selectedStreamUrl } = taskData;
  
  console.log(`[BackgroundDownload] Starting download task for: ${title}`);
  
  // Initialize or restore state
  let state: DownloadState = await loadDownloadState(downloadId) || {
    downloadId,
    downloadedSegments: [],
    failedSegments: {},
    totalSegments: 0,
    downloadedBytes: 0,
    status: 'downloading',
  };
  
  // Reset status if restarting
  state.status = 'downloading';
  
  try {
    // Ensure segments directory exists
    const dirExists = await RNFS.exists(segmentsDir);
    if (!dirExists) {
      await RNFS.mkdir(segmentsDir);
    }
    
    // Check if M3U8 or direct file
    if (!isM3U8Url(videoUrl)) {
      // Direct file download - let the native downloader handle it
      console.log('[BackgroundDownload] Direct file download, using native downloader');
      return;
    }
    
    // Parse M3U8 playlist
    console.log('[BackgroundDownload] Parsing M3U8 playlist...');
    const playlist = await parseM3U8Playlist(videoUrl, selectedStreamUrl);
    state.totalSegments = playlist.segments.length;
    
    console.log(`[BackgroundDownload] Found ${state.totalSegments} segments`);
    
    // Check for already downloaded segments
    for (let i = 0; i < playlist.segments.length; i++) {
      const segmentPath = `${segmentsDir}/segment_${i.toString().padStart(5, '0')}.ts`;
      try {
        const exists = await RNFS.exists(segmentPath);
        if (exists) {
          const stat = await RNFS.stat(segmentPath);
          if (stat.size > 0 && !state.downloadedSegments.includes(i)) {
            state.downloadedSegments.push(i);
            state.downloadedBytes += stat.size;
          }
        }
      } catch {
        // Ignore
      }
    }
    
    console.log(`[BackgroundDownload] Resuming with ${state.downloadedSegments.length}/${state.totalSegments} segments`);
    
    // Get pending segments
    const pendingSegments = playlist.segments.filter(
      s => !state.downloadedSegments.includes(s.index)
    );
    
    if (pendingSegments.length === 0) {
      // All segments already downloaded
      console.log('[BackgroundDownload] All segments already downloaded, combining...');
    } else {
      // Download segments with concurrency limit
      const abortController = new AbortController();
      let activeDownloads = 0;
      const downloadQueue = [...pendingSegments];
      let lastProgressUpdate = 0;
      
      const processQueue = async (): Promise<void> => {
        const downloadPromises: Promise<void>[] = [];
        
        while (downloadQueue.length > 0 && state.status === 'downloading') {
          // Wait if at max concurrency
          while (activeDownloads >= CONFIG.M3U8_CONCURRENCY && state.status === 'downloading') {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          if (state.status !== 'downloading') break;

          const segment = downloadQueue.shift();
          if (!segment) break;

          activeDownloads++;
          
          const downloadPromise = (async () => {
            try {
              const result = await downloadSegment(segment, segmentsDir, state, abortController.signal);
              
              if (result.success) {
                if (!state.downloadedSegments.includes(segment.index)) {
                  state.downloadedSegments.push(segment.index);
                  state.downloadedBytes += result.bytes;
                }
                delete state.failedSegments[segment.index];
                
                // Update progress notification (throttled)
                const now = Date.now();
                if (now - lastProgressUpdate >= CONFIG.PROGRESS_UPDATE_INTERVAL) {
                  lastProgressUpdate = now;
                  const progress = Math.round((state.downloadedSegments.length / state.totalSegments) * 100);
                  
                  await BackgroundService.updateNotification({
                    taskDesc: `Downloading ${title}: ${progress}%`,
                    progressBar: {
                      max: 100,
                      value: progress,
                      indeterminate: false,
                    },
                  });
                  
                  // Save state periodically
                  await saveDownloadState(state);
                }
              }
            } finally {
              activeDownloads--;
            }
          })();
          
          downloadPromises.push(downloadPromise);
        }
        
        // Wait for all in-flight downloads
        await Promise.allSettled(downloadPromises);
      };
      
      await processQueue();
      
      // Retry failed segments
      let retryAttempt = 0;
      while (Object.keys(state.failedSegments).length > 0 && retryAttempt < CONFIG.MAX_RETRIES && state.status === 'downloading') {
        retryAttempt++;
        console.log(`[BackgroundDownload] Retry attempt ${retryAttempt} for ${Object.keys(state.failedSegments).length} failed segments`);
        
        await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
        
        const failedIndices = Object.keys(state.failedSegments).map(Number);
        const retrySegments = failedIndices.map(index => 
          playlist.segments.find(s => s.index === index)!
        ).filter(Boolean);
        
        for (const segment of retrySegments) {
          if (state.status !== 'downloading') break;
          const result = await downloadSegment(segment, segmentsDir, state);
          if (result.success) {
            if (!state.downloadedSegments.includes(segment.index)) {
              state.downloadedSegments.push(segment.index);
              state.downloadedBytes += result.bytes;
            }
            delete state.failedSegments[segment.index];
          }
        }
      }
      
      // Check if cancelled or paused
      if (state.status !== 'downloading') {
        await saveDownloadState(state);
        return;
      }
      
      // Check if all segments downloaded
      if (state.downloadedSegments.length < state.totalSegments) {
        const remaining = state.totalSegments - state.downloadedSegments.length;
        state.status = 'failed';
        state.error = `Failed to download ${remaining} segments after ${CONFIG.MAX_RETRIES} retries`;
        await saveDownloadState(state);
        throw new Error(state.error);
      }
    }
    
    // Combine segments into final file
    console.log('[BackgroundDownload] Combining segments...');
    await BackgroundService.updateNotification({
      taskDesc: `Finalizing ${title}...`,
      progressBar: {
        max: 100,
        value: 100,
        indeterminate: true,
      },
    });
    
    await combineSegments(segmentsDir, filePath, state.totalSegments);
    
    // Verify output
    const outputStats = await RNFS.stat(filePath);
    if (outputStats.size === 0) {
      throw new Error('Combined video file is empty');
    }
    
    console.log(`[BackgroundDownload] Download completed! File size: ${Math.round(outputStats.size / 1024 / 1024)}MB`);
    
    // Mark as completed
    state.status = 'completed';
    await saveDownloadState(state);
    
    // Clean up state file after successful completion
    await deleteDownloadState(downloadId);
    
  } catch (error) {
    console.error('[BackgroundDownload] Download failed:', error);
    state.status = 'failed';
    state.error = error instanceof Error ? error.message : 'Unknown error';
    await saveDownloadState(state);
    throw error;
  }
};

/**
 * Start a background download
 */
export async function startBackgroundDownload(params: BackgroundDownloadParams): Promise<void> {
  const options = {
    taskName: 'FlickDownload',
    taskTitle: 'Downloading',
    taskDesc: `Downloading ${params.title}...`,
    taskIcon: {
      name: 'ic_launcher',
      type: 'mipmap',
    },
    color: '#e50914', // Netflix red
    parameters: params,
    progressBar: {
      max: 100,
      value: 0,
      indeterminate: true,
    },
    // Required for Android 14+ (API 34+) - must match AndroidManifest.xml service declaration
    linkingURI: 'flickv4://downloads',
    foregroundServiceType: 'dataSync',
  };

  await BackgroundService.start(backgroundDownloadTask, options);
}

/**
 * Stop the background download service
 */
export async function stopBackgroundDownload(): Promise<void> {
  await BackgroundService.stop();
}

/**
 * Check if background service is running
 */
export function isBackgroundDownloadRunning(): boolean {
  return BackgroundService.isRunning();
}

/**
 * Update the notification
 */
export async function updateBackgroundNotification(desc: string, progress?: number): Promise<void> {
  if (BackgroundService.isRunning()) {
    await BackgroundService.updateNotification({
      taskDesc: desc,
      progressBar: progress !== undefined ? {
        max: 100,
        value: progress,
        indeterminate: false,
      } : undefined,
    });
  }
}
