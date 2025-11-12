import RNFS from 'react-native-fs';
import RNBackgroundDownloader, { DownloadTask } from '@kesha-antonov/react-native-background-downloader';
import { Parser as M3U8Parser } from 'm3u8-parser';
import { 
  DownloadItem, 
  DownloadStatus, 
  DownloadQuality, 
  DownloadProgress,
  DownloadNotification,
  Movie, 
  TVShow,
  ErrorType,
  AppError
} from '../types';
import { TMDBService } from './TMDBService';
import { StorageService } from './StorageService';

export interface DownloadOptions {
  quality: DownloadQuality;
  downloadSubtitles?: boolean;
  wifiOnly?: boolean;
  overwriteExisting?: boolean;
}

export interface DownloadJobResult {
  task: DownloadTask;
  taskId: string;
}

export interface M3U8Segment {
  uri: string;
  duration: number;
  timeline: number;
}

export interface M3U8Playlist {
  segments: M3U8Segment[];
  targetDuration: number;
  mediaSequence: number;
  endList: boolean;
  version: number;
}

/**
 * DownloadService handles downloading and managing offline content
 */
export class DownloadService {
  private static instance: DownloadService;
  private downloads: Map<string, DownloadItem> = new Map();
  private activeDownloads: Map<string, DownloadJobResult> = new Map();
  private downloadListeners: Map<string, (progress: DownloadProgress) => void> = new Map();
  private notificationListeners: Set<(notification: DownloadNotification) => void> = new Set();
  private tmdbService: TMDBService;

  // Storage paths
  private static readonly DOWNLOADS_DIR = `${RNFS.DocumentDirectoryPath}/downloads`;
  private static readonly VIDEOS_DIR = `${DownloadService.DOWNLOADS_DIR}/videos`;
  private static readonly THUMBNAILS_DIR = `${DownloadService.DOWNLOADS_DIR}/thumbnails`;
  private static readonly SUBTITLES_DIR = `${DownloadService.DOWNLOADS_DIR}/subtitles`;
  private static readonly DOWNLOADS_STORAGE_KEY = '@netflix_clone:downloads';

  private constructor() {
    this.tmdbService = new TMDBService();
    this.initializeDownloadsDirectory();
    this.loadDownloadsFromStorage();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): DownloadService {
    if (!DownloadService.instance) {
      DownloadService.instance = new DownloadService();
    }
    return DownloadService.instance;
  }

  /**
   * Initialize downloads directory structure
   */
  private async initializeDownloadsDirectory(): Promise<void> {
    try {
      const directories = [
        DownloadService.DOWNLOADS_DIR,
        DownloadService.VIDEOS_DIR,
        DownloadService.THUMBNAILS_DIR,
        DownloadService.SUBTITLES_DIR,
      ];

      for (const dir of directories) {
        const exists = await RNFS.exists(dir);
        if (!exists) {
          await RNFS.mkdir(dir);
        }
      }
    } catch (error) {
      console.error('Failed to initialize downloads directory:', error);
      throw this.createDownloadError('Failed to initialize downloads directory', error);
    }
  }

  /**
   * Load downloads from AsyncStorage
   */
  private async loadDownloadsFromStorage(): Promise<void> {
    try {
      const downloadsData = await StorageService.getItem(DownloadService.DOWNLOADS_STORAGE_KEY);
      if (downloadsData) {
        const downloads: DownloadItem[] = JSON.parse(downloadsData);
        downloads.forEach(download => {
          // Parse dates
          download.createdAt = new Date(download.createdAt);
          download.updatedAt = new Date(download.updatedAt);
          if (download.startedAt) download.startedAt = new Date(download.startedAt);
          if (download.completedAt) download.completedAt = new Date(download.completedAt);
          
          this.downloads.set(download.id, download);
        });
      }
    } catch (error) {
      console.warn('Failed to load downloads from storage:', error);
    }
  }

  /**
   * Save downloads to AsyncStorage
   */
  private async saveDownloadsToStorage(): Promise<void> {
    try {
      const downloads = Array.from(this.downloads.values());
      await StorageService.setItem(DownloadService.DOWNLOADS_STORAGE_KEY, JSON.stringify(downloads));
    } catch (error) {
      console.error('Failed to save downloads to storage:', error);
    }
  }

  /**
   * Generate unique download ID
   */
  private generateDownloadId(
    contentId: number, 
    contentType: 'movie' | 'tv', 
    season?: number, 
    episode?: number
  ): string {
    const base = `${contentType}_${contentId}`;
    if (contentType === 'tv' && season !== undefined && episode !== undefined) {
      return `${base}_s${season}_e${episode}`;
    }
    return base;
  }

  /**
   * Generate file paths for downloads
   */
  private generateFilePaths(downloadId: string, quality: DownloadQuality) {
    const videoFileName = `${downloadId}_${quality}.mp4`;
    const thumbnailFileName = `${downloadId}_thumb.jpg`;
    
    return {
      videoPath: `${DownloadService.VIDEOS_DIR}/${videoFileName}`,
      thumbnailPath: `${DownloadService.THUMBNAILS_DIR}/${thumbnailFileName}`,
      subtitlesDir: `${DownloadService.SUBTITLES_DIR}/${downloadId}`,
    };
  }

  /**
   * Start downloading content
   */
  async startDownload(
    content: Movie | TVShow,
    videoUrl: string,
    options: DownloadOptions,
    season?: number,
    episode?: number,
    episodeTitle?: string
  ): Promise<string> {
    try {
      const contentType = 'title' in content ? 'movie' : 'tv';
      const downloadId = this.generateDownloadId(content.id, contentType, season, episode);

      // Check if already downloaded or downloading
      const existingDownload = this.downloads.get(downloadId);
      if (existingDownload) {
        if (existingDownload.status === DownloadStatus.COMPLETED) {
          throw this.createDownloadError('Content already downloaded', null);
        }
        if (existingDownload.status === DownloadStatus.DOWNLOADING) {
          throw this.createDownloadError('Content is already being downloaded', null);
        }
      }

      const filePaths = this.generateFilePaths(downloadId, options.quality);

      // Create download item
      const downloadItem: DownloadItem = {
        id: downloadId,
        contentId: content.id,
        contentType,
        title: 'title' in content ? content.title : content.name,
        overview: content.overview,
        posterPath: content.poster_path,
        backdropPath: content.backdrop_path,
        releaseDate: 'release_date' in content ? content.release_date : content.first_air_date,
        season,
        episode,
        episodeTitle,
        videoUrl,
        quality: options.quality,
        status: DownloadStatus.PENDING,
        progress: 0,
        filePath: filePaths.videoPath,
        thumbnailPath: filePaths.thumbnailPath,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.downloads.set(downloadId, downloadItem);
      await this.saveDownloadsToStorage();

      // Send notification
      this.sendNotification({
        id: `download_started_${downloadId}`,
        title: 'Download Started',
        message: `Started downloading ${downloadItem.title}`,
        type: 'info',
        timestamp: new Date(),
      });

      // Start the actual download
      await this.performDownload(downloadItem, options);

      return downloadId;
    } catch (error) {
      console.error('Failed to start download:', error);
      throw error;
    }
  }

  /**
   * Check if a URL is an M3U8 playlist
   */
  private isM3U8Url(url: string): boolean {
    const lowerUrl = url.toLowerCase();
    return lowerUrl.includes('.m3u8') || 
           lowerUrl.includes('.m3u') ||
           lowerUrl.includes('application/x-mpegurl') ||
           lowerUrl.includes('application/vnd.apple.mpegurl') ||
           lowerUrl.includes('video/mp2t') ||
           // Check if URL contains common HLS patterns
           lowerUrl.includes('playlist.m3u8') ||
           lowerUrl.includes('index.m3u8') ||
           lowerUrl.includes('master.m3u8');
  }

  /**
   * Manual M3U8 parser as fallback when m3u8-parser fails
   */
  private async manualParseM3U8(playlistText: string, baseUrl: string): Promise<M3U8Playlist> {
    try {
      console.log('Starting manual M3U8 parsing...');
      
      const lines = playlistText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      
      // Check if this is a master playlist (contains stream info)
      const isMasterPlaylist = lines.some(line => line.includes('#EXT-X-STREAM-INF'));
      
      if (isMasterPlaylist) {
        console.log('Detected master playlist, extracting best quality stream...');
        return await this.parseMasterPlaylist(lines, baseUrl);
      }
      
      // Parse as media playlist
      const segments: M3U8Segment[] = [];
      let targetDuration = 10;
      let mediaSequence = 0;
      let version = 3;
      let endList = false;
      
      let currentDuration = 10;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Parse target duration
        if (line.startsWith('#EXT-X-TARGETDURATION:')) {
          targetDuration = parseInt(line.split(':')[1], 10) || 10;
        }
        
        // Parse media sequence
        else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
          mediaSequence = parseInt(line.split(':')[1], 10) || 0;
        }
        
        // Parse version
        else if (line.startsWith('#EXT-X-VERSION:')) {
          version = parseInt(line.split(':')[1], 10) || 3;
        }
        
        // Parse end list
        else if (line === '#EXT-X-ENDLIST') {
          endList = true;
        }
        
        // Parse segment duration
        else if (line.startsWith('#EXTINF:')) {
          const durationMatch = line.match(/#EXTINF:([\d.]+)/);
          if (durationMatch) {
            currentDuration = parseFloat(durationMatch[1]);
          }
        }
        
        // Parse segment URL
        else if (!line.startsWith('#') && line.length > 0) {
          // This is a segment URL
          segments.push({
            uri: line,
            duration: currentDuration,
            timeline: 0,
          });
          currentDuration = targetDuration; // Reset for next segment
        }
      }
      
      console.log(`Manual parser found ${segments.length} segments`);
      
      if (segments.length === 0) {
        throw new Error('No segments found in M3U8 playlist during manual parsing');
      }
      
      return {
        segments,
        targetDuration,
        mediaSequence,
        endList,
        version,
      };
    } catch (error) {
      console.error('Manual M3U8 parsing failed:', error);
      throw error;
    }
  }

  /**
   * Parse master playlist and select best quality stream
   */
  private async parseMasterPlaylist(lines: string[], baseUrl: string): Promise<M3U8Playlist> {
    const streams: { bandwidth: number; resolution: string; url: string }[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        // Parse stream info
        const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
        const resolutionMatch = line.match(/RESOLUTION=([^\s,]+)/);
        
        const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0;
        const resolution = resolutionMatch ? resolutionMatch[1] : 'unknown';
        
        // Next line should be the stream URL
        if (i + 1 < lines.length) {
          const streamUrl = lines[i + 1];
          if (!streamUrl.startsWith('#')) {
            streams.push({
              bandwidth,
              resolution,
              url: streamUrl,
            });
          }
        }
      }
    }
    
    if (streams.length === 0) {
      throw new Error('No streams found in master playlist');
    }
    
    // Select the highest bandwidth stream
    const bestStream = streams.reduce((best, current) => 
      current.bandwidth > best.bandwidth ? current : best
    );
    
    console.log(`Selected stream: ${bestStream.resolution} at ${bestStream.bandwidth} bps`);
    console.log(`Stream URL: ${bestStream.url}`);
    
    // Resolve the stream URL
    let resolvedUrl: string;
    if (bestStream.url.startsWith('http://') || bestStream.url.startsWith('https://')) {
      resolvedUrl = bestStream.url;
    } else if (bestStream.url.startsWith('/')) {
      // Absolute path
      const urlParts = baseUrl.match(/^(https?:\/\/[^/]+)/);
      if (urlParts) {
        resolvedUrl = urlParts[1] + bestStream.url;
      } else {
        resolvedUrl = baseUrl.substring(0, baseUrl.lastIndexOf('/')) + bestStream.url;
      }
    } else {
      // Relative path
      resolvedUrl = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1) + bestStream.url;
    }
    
    console.log(`Resolved stream URL: ${resolvedUrl}`);
    
    // Fetch and parse the actual media playlist
    return await this.fetchM3U8Playlist(resolvedUrl);
  }

  /**
   * Fetch and parse M3U8 playlist
   */
  private async fetchM3U8Playlist(url: string): Promise<M3U8Playlist> {
    try {
      console.log(`Fetching M3U8 playlist from: ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch M3U8 playlist: ${response.status} ${response.statusText}`);
      }

      const playlistText = await response.text();
      console.log(`M3U8 playlist content length: ${playlistText.length} characters`);
      console.log('M3U8 playlist first 500 characters:', playlistText.substring(0, 500));
      
      // Try manual parsing first (more reliable for React Native)
      try {
        console.log('Trying manual M3U8 parsing...');
        return await this.manualParseM3U8(playlistText, url);
      } catch (manualError) {
        console.log('Manual parsing failed, trying m3u8-parser...', manualError);
      }
      
      // Fallback to m3u8-parser
      const parser = new M3U8Parser();
      parser.push(playlistText);
      parser.end();

      const manifest = parser.manifest;
      console.log('Raw parsed manifest:', JSON.stringify(manifest, null, 2));

      // If the parser failed to parse properly, throw error
      if (!manifest || (!manifest.segments && !manifest.playlists)) {
        throw new Error('Both manual and standard M3U8 parsing failed');
      }
      
      console.log('Parsed M3U8 manifest:', {
        hasPlaylists: !!(manifest.playlists && manifest.playlists.length > 0),
        playlistCount: manifest.playlists?.length || 0,
        hasSegments: !!(manifest.segments && manifest.segments.length > 0),
        segmentCount: manifest.segments?.length || 0,
      });
      
      // Handle master playlist (contains multiple streams)
      if (manifest.playlists && manifest.playlists.length > 0) {
        console.log('Processing master playlist...');
        
        // Filter playlists that have valid URIs
        const validPlaylists = manifest.playlists.filter((playlist: any, index: number) => {
          const isValid = playlist && playlist.uri && typeof playlist.uri === 'string';
          if (!isValid) {
            console.warn(`Playlist ${index} is invalid:`, playlist);
          }
          return isValid;
        });

        if (validPlaylists.length === 0) {
          throw new Error('No valid playlists found in master playlist');
        }

        console.log(`Found ${validPlaylists.length} valid playlists`);

        // Select the highest quality stream from valid playlists
        const bestPlaylist = validPlaylists.reduce((best: any, current: any) => {
          const bestBandwidth = best.attributes?.BANDWIDTH || 0;
          const currentBandwidth = current.attributes?.BANDWIDTH || 0;
          return currentBandwidth > bestBandwidth ? current : best;
        });

        // Safely resolve the URL for the selected stream
        let streamUrl: string;
        try {
          if (bestPlaylist.uri.startsWith('http://') || bestPlaylist.uri.startsWith('https://')) {
            streamUrl = bestPlaylist.uri;
          } else {
            streamUrl = url.substring(0, url.lastIndexOf('/') + 1) + bestPlaylist.uri;
          }
        } catch (uriError) {
          console.error('Error resolving playlist URI:', uriError);
          throw new Error(`Failed to resolve playlist URI: ${bestPlaylist.uri}`);
        }

        console.log(`Selected playlist with bandwidth: ${bestPlaylist.attributes?.BANDWIDTH || 'unknown'}, URL: ${streamUrl}`);

        // Fetch the actual media playlist
        return await this.fetchM3U8Playlist(streamUrl);
      }

      // Handle media playlist (contains segments)
      if (!manifest.segments || manifest.segments.length === 0) {
        throw new Error('No segments found in M3U8 playlist');
      }

      console.log(`Found ${manifest.segments.length} segments in media playlist`);

      // Debug: Log first few segments to understand structure
      if (manifest.segments.length > 0) {
        console.log('First segment structure:', JSON.stringify(manifest.segments[0], null, 2));
        if (manifest.segments.length > 1) {
          console.log('Second segment structure:', JSON.stringify(manifest.segments[1], null, 2));
        }
      }

      const processedSegments = manifest.segments.map((segment: any, index: number) => {
        try {
          // Debug log for problematic segments
          if (!segment || typeof segment !== 'object') {
            console.warn(`Segment ${index} is not a valid object:`, segment);
            return null;
          }
          
          if (!segment.uri || typeof segment.uri !== 'string') {
            console.warn(`Segment ${index} has no valid URI:`, segment);
            return null;
          }
          
          return {
            uri: segment.uri,
            duration: typeof segment.duration === 'number' ? segment.duration : 10,
            timeline: typeof segment.timeline === 'number' ? segment.timeline : 0,
          };
        } catch (segmentError) {
          console.error(`Error processing segment ${index}:`, segmentError);
          return null;
        }
      }).filter((segment): segment is M3U8Segment => segment !== null);

      console.log(`Successfully processed ${processedSegments.length} valid segments`);

      return {
        segments: processedSegments,
        targetDuration: manifest.targetDuration || 10,
        mediaSequence: manifest.mediaSequence || 0,
        endList: manifest.endList || false,
        version: manifest.version || 3,
      };
    } catch (error) {
      console.error('Failed to parse M3U8 playlist:', error);
      if (error instanceof Error) {
        console.error('Error stack:', error.stack);
      }
      throw error;
    }
  }

  /**
   * Download M3U8 playlist and combine segments
   */
  private async downloadM3U8(downloadItem: DownloadItem, _options: DownloadOptions): Promise<void> {
    try {
      // Fetch and parse the M3U8 playlist
      const playlist = await this.fetchM3U8Playlist(downloadItem.videoUrl);
      
      // Create segments directory
      const segmentsDir = `${DownloadService.VIDEOS_DIR}/${downloadItem.id}_segments`;
      await RNFS.mkdir(segmentsDir);

      // Resolve relative URLs
      const baseUrl = downloadItem.videoUrl.substring(0, downloadItem.videoUrl.lastIndexOf('/') + 1);
      const segments = playlist.segments.map((segment, index) => {
        try {
          // Handle different segment URI formats
          let resolvedUri: string;
          
          if (!segment.uri || typeof segment.uri !== 'string') {
            throw new Error(`Segment ${index} has invalid or missing URI`);
          }
          
          if (segment.uri.startsWith('http://') || segment.uri.startsWith('https://')) {
            // Absolute URL
            resolvedUri = segment.uri;
          } else if (segment.uri.startsWith('/')) {
            // Absolute path - need to get the protocol and domain from the base URL
            const urlParts = downloadItem.videoUrl.match(/^(https?:\/\/[^/]+)/);
            if (urlParts) {
              resolvedUri = urlParts[1] + segment.uri;
            } else {
              // Fallback to relative resolution
              resolvedUri = baseUrl + segment.uri.substring(1);
            }
          } else {
            // Relative path
            resolvedUri = baseUrl + segment.uri;
          }
          
          return {
            ...segment,
            uri: resolvedUri,
          };
        } catch (error) {
          console.error(`Failed to resolve URI for segment ${index}:`, error);
          console.error(`Segment data:`, segment);
          throw new Error(`Invalid segment URI at index ${index}: ${segment.uri || 'undefined'}`);
        }
      });

      let downloadedSegments = 0;
      const totalSegments = segments.length;
      let totalDownloadedBytes = 0;
      let totalExpectedBytes = 0;

      // Download segments sequentially
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const segmentPath = `${segmentsDir}/segment_${i.toString().padStart(4, '0')}.ts`;

        try {
          // Download segment using RNBackgroundDownloader
          const task = RNBackgroundDownloader.download({
            id: `${downloadItem.id}_segment_${i}`,
            url: segment.uri,
            destination: segmentPath,
          });

          await new Promise<void>((resolve, reject) => {
            task
              .begin(({ expectedBytes }) => {
                totalExpectedBytes += expectedBytes;
              })
              .progress(({ bytesDownloaded, bytesTotal }) => {
                // Update progress based on segments completed + current segment progress
                const segmentProgress = (bytesDownloaded / bytesTotal) * 100;
                const overallProgress = ((downloadedSegments + (segmentProgress / 100)) / totalSegments) * 100;
                
                downloadItem.progress = overallProgress;
                downloadItem.downloadedSize = totalDownloadedBytes + bytesDownloaded;
                downloadItem.totalSize = totalExpectedBytes;
                downloadItem.updatedAt = new Date();

                // Update the stored download item immediately
                this.downloads.set(downloadItem.id, downloadItem);

                // Save to storage to persist progress
                this.saveDownloadsToStorage().catch((error) => {
                  console.error('Failed to save M3U8 download progress to storage:', error);
                });

                // Notify progress listeners
                const progressData: DownloadProgress = {
                  downloadId: downloadItem.id,
                  progress: overallProgress,
                  downloadSpeed: downloadItem.downloadSpeed || 0,
                  totalSize: totalExpectedBytes,
                  downloadedSize: totalDownloadedBytes + bytesDownloaded,
                  estimatedTimeRemaining: downloadItem.estimatedTimeRemaining || 0,
                };

                const listener = this.downloadListeners.get(downloadItem.id);
                console.log('M3U8 progress update:', {
                  downloadId: downloadItem.id,
                  segmentIndex: i,
                  segmentProgress: Math.round(segmentProgress),
                  overallProgress: Math.round(overallProgress),
                  hasListener: !!listener
                });
                
                if (listener) {
                  try {
                    listener(progressData);
                  } catch (error) {
                    console.error('Error calling M3U8 progress listener:', error);
                  }
                }
              })
              .done(({ bytesDownloaded }) => {
                totalDownloadedBytes += bytesDownloaded;
                downloadedSegments++;
                resolve();
              })
              .error(({ error }) => {
                reject(new Error(`Failed to download segment ${i}: ${error}`));
              });
          });

        } catch (error) {
          console.error(`Failed to download segment ${i}:`, error);
          throw error;
        }
      }

      // Combine segments into final video file
      await this.combineM3U8Segments(segmentsDir, downloadItem.filePath!, totalSegments);

      // Clean up segments directory
      try {
        await RNFS.unlink(segmentsDir);
      } catch (cleanupError) {
        console.warn('Failed to cleanup segments directory:', cleanupError);
        // Don't fail the download for cleanup errors
      }

      // Mark download as completed
      downloadItem.status = DownloadStatus.COMPLETED;
      downloadItem.progress = 100;
      downloadItem.completedAt = new Date();
      downloadItem.updatedAt = new Date();

    } catch (error) {
      console.error('Failed to download M3U8:', error);
      
      // Clean up on error
      try {
        const segmentsDir = `${DownloadService.VIDEOS_DIR}/${downloadItem.id}_segments`;
        const segmentsDirExists = await RNFS.exists(segmentsDir);
        if (segmentsDirExists) {
          await RNFS.unlink(segmentsDir);
        }
        
        if (downloadItem.filePath) {
          const outputExists = await RNFS.exists(downloadItem.filePath);
          if (outputExists) {
            await RNFS.unlink(downloadItem.filePath);
          }
        }
      } catch (cleanupError) {
        console.warn('Failed to cleanup after error:', cleanupError);
      }
      
      throw error;
    }
  }

  /**
   * Combine M3U8 segments into a single video file
   */
  private async combineM3U8Segments(segmentsDir: string, outputPath: string, totalSegments: number): Promise<void> {
    try {
      // Create an array of segment file paths in order
      const segmentPaths: string[] = [];
      for (let i = 0; i < totalSegments; i++) {
        const segmentPath = `${segmentsDir}/segment_${i.toString().padStart(4, '0')}.ts`;
        const exists = await RNFS.exists(segmentPath);
        if (exists) {
          segmentPaths.push(segmentPath);
        } else {
          console.warn(`Segment ${i} not found at ${segmentPath}`);
        }
      }

      if (segmentPaths.length === 0) {
        throw new Error('No segments found to combine');
      }

      console.log(`Combining ${segmentPaths.length} segments into ${outputPath}`);

      // For React Native, we'll combine segments by concatenating their binary data
      // This works for MPEG-TS segments which are designed to be concatenated
      
      for (let i = 0; i < segmentPaths.length; i++) {
        const segmentPath = segmentPaths[i];
        try {
          const segmentData = await RNFS.readFile(segmentPath, 'base64');
          
          if (i === 0) {
            // Write first segment
            await RNFS.writeFile(outputPath, segmentData, 'base64');
          } else {
            // Append remaining segments
            await RNFS.appendFile(outputPath, segmentData, 'base64');
          }
        } catch (error) {
          console.error(`Failed to read segment ${i}:`, error);
          // Continue with other segments
        }
      }

      // Verify the output file exists and has content
      const outputExists = await RNFS.exists(outputPath);
      if (!outputExists) {
        throw new Error('Failed to create combined video file');
      }

      const outputStats = await RNFS.stat(outputPath);
      if (outputStats.size === 0) {
        throw new Error('Combined video file is empty');
      }

      console.log(`Successfully combined ${segmentPaths.length} segments into ${outputPath} (${outputStats.size} bytes)`);
    } catch (error) {
      console.error('Failed to combine M3U8 segments:', error);
      throw error;
    }
  }

  /**
   * Perform the actual download
   */
  private async performDownload(downloadItem: DownloadItem, options: DownloadOptions): Promise<void> {
    try {
      // Update status to downloading
      downloadItem.status = DownloadStatus.DOWNLOADING;
      downloadItem.startedAt = new Date();
      downloadItem.updatedAt = new Date();
      this.downloads.set(downloadItem.id, downloadItem);
      await this.saveDownloadsToStorage();

      // Create subtitles directory if downloading subtitles
      if (options.downloadSubtitles) {
        const subtitlesDir = `${DownloadService.SUBTITLES_DIR}/${downloadItem.id}`;
        const exists = await RNFS.exists(subtitlesDir);
        if (!exists) {
          await RNFS.mkdir(subtitlesDir);
        }
      }

      // Check if this is an M3U8 playlist
      if (this.isM3U8Url(downloadItem.videoUrl)) {
        // Handle M3U8 playlist download
        await this.downloadM3U8(downloadItem, options);
        
        // Download thumbnail
        if (downloadItem.posterPath) {
          this.downloadThumbnail(downloadItem);
        }

        // Download subtitles if requested
        if (options.downloadSubtitles) {
          this.downloadSubtitles(downloadItem);
        }

        this.downloads.set(downloadItem.id, downloadItem);
        this.saveDownloadsToStorage();

        // Send completion notification
        this.sendNotification({
          id: `download_completed_${downloadItem.id}`,
          title: 'Download Completed',
          message: `${downloadItem.title} downloaded successfully`,
          type: 'success',
          timestamp: new Date(),
        });

        return;
      }

      // Download regular video file using RNBackgroundDownloader
      console.log('Starting background download for:', {
        id: downloadItem.id,
        url: downloadItem.videoUrl,
        destination: downloadItem.filePath,
      });

      const task = RNBackgroundDownloader.download({
        id: downloadItem.id,
        url: downloadItem.videoUrl,
        destination: downloadItem.filePath!,
      }).begin(({ expectedBytes, headers: _headers }) => {
        // Update total size when download begins
        console.log('Download begin callback triggered:', {
          downloadId: downloadItem.id,
          expectedBytes,
        });
        downloadItem.totalSize = expectedBytes;
        downloadItem.updatedAt = new Date();
        this.downloads.set(downloadItem.id, downloadItem);
      }).progress(({ bytesDownloaded, bytesTotal }) => {
        const progress = (bytesDownloaded / bytesTotal) * 100;
        const downloadSpeed = bytesDownloaded / ((Date.now() - downloadItem.startedAt!.getTime()) / 1000);
        const estimatedTimeRemaining = (bytesTotal - bytesDownloaded) / downloadSpeed;

        console.log('Download progress callback triggered:', {
          downloadId: downloadItem.id,
          progress: Math.round(progress * 100) / 100,
          bytesDownloaded,
          bytesTotal,
          downloadSpeed: Math.round(downloadSpeed),
        });

        // Update download progress
        downloadItem.progress = progress;
        downloadItem.downloadSpeed = downloadSpeed;
        downloadItem.totalSize = bytesTotal;
        downloadItem.downloadedSize = bytesDownloaded;
        downloadItem.estimatedTimeRemaining = estimatedTimeRemaining;
        downloadItem.updatedAt = new Date();

        this.downloads.set(downloadItem.id, downloadItem);

        // Notify progress listeners
        const progressData: DownloadProgress = {
          downloadId: downloadItem.id,
          progress,
          downloadSpeed,
          totalSize: bytesTotal,
          downloadedSize: bytesDownloaded,
          estimatedTimeRemaining,
        };

        const listener = this.downloadListeners.get(downloadItem.id);
        console.log('Calling progress listener for download:', {
          downloadId: downloadItem.id,
          progress: Math.round(progress),
          hasListener: !!listener,
          bytesDownloaded,
          bytesTotal
        });
        
        if (listener) {
          try {
            listener(progressData);
          } catch (error) {
            console.error('Error calling progress listener:', error);
          }
        } else {
          console.warn('No progress listener found for download:', downloadItem.id);
        }
      }).done(({ bytesDownloaded: _bytesDownloaded, bytesTotal: _bytesTotal }) => {
        console.log('Download completed callback triggered:', {
          downloadId: downloadItem.id,
        });
        
        // Download completed successfully
        downloadItem.status = DownloadStatus.COMPLETED;
        downloadItem.progress = 100;
        downloadItem.completedAt = new Date();
        downloadItem.updatedAt = new Date();

        // Download thumbnail
        if (downloadItem.posterPath) {
          this.downloadThumbnail(downloadItem);
        }

        // Download subtitles if requested
        if (options.downloadSubtitles) {
          this.downloadSubtitles(downloadItem);
        }

        this.downloads.set(downloadItem.id, downloadItem);
        this.saveDownloadsToStorage();

        // Send completion notification
        this.sendNotification({
          id: `download_completed_${downloadItem.id}`,
          title: 'Download Completed',
          message: `${downloadItem.title} downloaded successfully`,
          type: 'success',
          timestamp: new Date(),
        });

        this.activeDownloads.delete(downloadItem.id);
      }).error(({ error, errorCode: _errorCode }) => {
        console.log('Download error callback triggered:', {
          downloadId: downloadItem.id,
          error,
        });
        
        // Download failed
        downloadItem.status = DownloadStatus.FAILED;
        downloadItem.error = error;
        downloadItem.updatedAt = new Date();

        this.downloads.set(downloadItem.id, downloadItem);
        this.saveDownloadsToStorage();
        this.activeDownloads.delete(downloadItem.id);

        // Send error notification
        this.sendNotification({
          id: `download_failed_${downloadItem.id}`,
          title: 'Download Failed',
          message: `Failed to download ${downloadItem.title}: ${error}`,
          type: 'error',
          timestamp: new Date(),
        });

        throw new Error(`Download failed: ${error}`);
      });

      const downloadJob: DownloadJobResult = {
        task,
        taskId: downloadItem.id,
      };

      this.activeDownloads.set(downloadItem.id, downloadJob);
    } catch (error) {
      // Download failed
      downloadItem.status = DownloadStatus.FAILED;
      downloadItem.error = error instanceof Error ? error.message : 'Unknown error';
      downloadItem.updatedAt = new Date();

      this.downloads.set(downloadItem.id, downloadItem);
      await this.saveDownloadsToStorage();
      this.activeDownloads.delete(downloadItem.id);

      // Send error notification
      this.sendNotification({
        id: `download_failed_${downloadItem.id}`,
        title: 'Download Failed',
        message: `Failed to download ${downloadItem.title}: ${downloadItem.error}`,
        type: 'error',
        timestamp: new Date(),
      });

      throw error;
    }
  }

  /**
   * Download thumbnail image
   */
  private async downloadThumbnail(downloadItem: DownloadItem): Promise<void> {
    try {
      if (!downloadItem.posterPath || !downloadItem.thumbnailPath) return;

      const thumbnailUrl = this.tmdbService.getImageUrl(downloadItem.posterPath, 'w500');
      
      await RNFS.downloadFile({
        fromUrl: thumbnailUrl,
        toFile: downloadItem.thumbnailPath,
      }).promise;
    } catch (error) {
      console.warn('Failed to download thumbnail:', error);
      // Don't fail the entire download for thumbnail errors
    }
  }

  /**
   * Download subtitles for content
   */
  private async downloadSubtitles(downloadItem: DownloadItem): Promise<void> {
    try {
      // This would integrate with your subtitle service
      // For now, we'll just create a placeholder
      downloadItem.subtitlePaths = []; // Would be populated with actual subtitle files
    } catch (error) {
      console.warn('Failed to download subtitles:', error);
      // Don't fail the entire download for subtitle errors
    }
  }

  /**
   * Pause download
   */
  async pauseDownload(downloadId: string): Promise<void> {
    try {
      const downloadItem = this.downloads.get(downloadId);
      if (!downloadItem) {
        throw this.createDownloadError('Download not found', null);
      }

      const activeDownload = this.activeDownloads.get(downloadId);
      if (activeDownload) {
        activeDownload.task.pause();
      }

      downloadItem.status = DownloadStatus.PAUSED;
      downloadItem.updatedAt = new Date();
      this.downloads.set(downloadId, downloadItem);
      await this.saveDownloadsToStorage();

      this.sendNotification({
        id: `download_paused_${downloadId}`,
        title: 'Download Paused',
        message: `${downloadItem.title} download paused`,
        type: 'info',
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Failed to pause download:', error);
      throw error;
    }
  }

  /**
   * Resume download
   */
  async resumeDownload(downloadId: string): Promise<void> {
    try {
      const downloadItem = this.downloads.get(downloadId);
      if (!downloadItem) {
        throw this.createDownloadError('Download not found', null);
      }

      if (downloadItem.status !== DownloadStatus.PAUSED) {
        throw this.createDownloadError('Download is not paused', null);
      }

      // Check if we have an active task to resume
      const activeDownload = this.activeDownloads.get(downloadId);
      if (activeDownload) {
        // Resume existing task
        activeDownload.task.resume();
        downloadItem.status = DownloadStatus.DOWNLOADING;
        downloadItem.updatedAt = new Date();
        this.downloads.set(downloadId, downloadItem);
        await this.saveDownloadsToStorage();
      } else {
        // Restart download if no active task exists
        downloadItem.status = DownloadStatus.PENDING;
        const options: DownloadOptions = {
          quality: downloadItem.quality,
          downloadSubtitles: !!downloadItem.subtitlePaths,
        };
        await this.performDownload(downloadItem, options);
      }
    } catch (error) {
      console.error('Failed to resume download:', error);
      throw error;
    }
  }

  /**
   * Cancel download
   */
  async cancelDownload(downloadId: string): Promise<void> {
    try {
      const downloadItem = this.downloads.get(downloadId);
      if (!downloadItem) {
        throw this.createDownloadError('Download not found', null);
      }

      const activeDownload = this.activeDownloads.get(downloadId);
      if (activeDownload) {
        activeDownload.task.stop();
        this.activeDownloads.delete(downloadId);
      }

      // Delete partial files
      if (downloadItem.filePath) {
        const exists = await RNFS.exists(downloadItem.filePath);
        if (exists) {
          await RNFS.unlink(downloadItem.filePath);
        }
      }

      downloadItem.status = DownloadStatus.CANCELLED;
      downloadItem.updatedAt = new Date();
      this.downloads.set(downloadId, downloadItem);
      await this.saveDownloadsToStorage();

      this.sendNotification({
        id: `download_cancelled_${downloadId}`,
        title: 'Download Cancelled',
        message: `${downloadItem.title} download cancelled`,
        type: 'info',
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Failed to cancel download:', error);
      throw error;
    }
  }

  /**
   * Delete downloaded content
   */
  async deleteDownload(downloadId: string): Promise<void> {
    try {
      const downloadItem = this.downloads.get(downloadId);
      if (!downloadItem) {
        throw this.createDownloadError('Download not found', null);
      }

      // Cancel if actively downloading
      if (downloadItem.status === DownloadStatus.DOWNLOADING) {
        await this.cancelDownload(downloadId);
      }

      // Delete files
      const filesToDelete = [
        downloadItem.filePath,
        downloadItem.thumbnailPath,
        ...(downloadItem.subtitlePaths || []),
      ].filter(Boolean) as string[];

      for (const filePath of filesToDelete) {
        const exists = await RNFS.exists(filePath);
        if (exists) {
          await RNFS.unlink(filePath);
        }
      }

      // Delete subtitles directory
      const subtitlesDir = `${DownloadService.SUBTITLES_DIR}/${downloadId}`;
      const subtitlesDirExists = await RNFS.exists(subtitlesDir);
      if (subtitlesDirExists) {
        await RNFS.unlink(subtitlesDir);
      }

      // Remove from downloads map
      this.downloads.delete(downloadId);
      await this.saveDownloadsToStorage();

      this.sendNotification({
        id: `download_deleted_${downloadId}`,
        title: 'Download Deleted',
        message: `${downloadItem.title} deleted from downloads`,
        type: 'info',
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Failed to delete download:', error);
      throw error;
    }
  }

  /**
   * Get all downloads
   */
  getAllDownloads(): DownloadItem[] {
    return Array.from(this.downloads.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  /**
   * Get download by ID
   */
  getDownload(downloadId: string): DownloadItem | null {
    return this.downloads.get(downloadId) || null;
  }

  /**
   * Get downloads by status
   */
  getDownloadsByStatus(status: DownloadStatus): DownloadItem[] {
    return this.getAllDownloads().filter(download => download.status === status);
  }

  /**
   * Check if content is downloaded
   */
  isContentDownloaded(
    contentId: number, 
    contentType: 'movie' | 'tv', 
    season?: number, 
    episode?: number
  ): boolean {
    const downloadId = this.generateDownloadId(contentId, contentType, season, episode);
    const download = this.downloads.get(downloadId);
    return download?.status === DownloadStatus.COMPLETED || false;
  }

  /**
   * Get downloaded content file path
   */
  getDownloadedContentPath(
    contentId: number, 
    contentType: 'movie' | 'tv', 
    season?: number, 
    episode?: number
  ): string | null {
    const downloadId = this.generateDownloadId(contentId, contentType, season, episode);
    const download = this.downloads.get(downloadId);
    
    if (download?.status === DownloadStatus.COMPLETED && download.filePath) {
      return download.filePath;
    }
    
    return null;
  }

  /**
   * Get storage usage information
   */
  async getStorageInfo(): Promise<{
    totalDownloads: number;
    completedDownloads: number;
    totalSize: number;
    usedSpace: number;
    availableSpace: number;
  }> {
    try {
      const downloads = this.getAllDownloads();
      const completedDownloads = downloads.filter(d => d.status === DownloadStatus.COMPLETED);
      
      let totalSize = 0;
      for (const download of completedDownloads) {
        if (download.totalSize) {
          totalSize += download.totalSize;
        }
      }

      const fsInfo = await RNFS.getFSInfo();

      return {
        totalDownloads: downloads.length,
        completedDownloads: completedDownloads.length,
        totalSize,
        usedSpace: totalSize,
        availableSpace: fsInfo.freeSpace,
      };
    } catch (error) {
      console.error('Failed to get storage info:', error);
      return {
        totalDownloads: 0,
        completedDownloads: 0,
        totalSize: 0,
        usedSpace: 0,
        availableSpace: 0,
      };
    }
  }

  /**
   * Clean up failed and cancelled downloads
   */
  async cleanupFailedDownloads(): Promise<number> {
    try {
      const failedDownloads = this.getDownloadsByStatus(DownloadStatus.FAILED);
      const cancelledDownloads = this.getDownloadsByStatus(DownloadStatus.CANCELLED);
      const toCleanup = [...failedDownloads, ...cancelledDownloads];

      for (const download of toCleanup) {
        await this.deleteDownload(download.id);
      }

      return toCleanup.length;
    } catch (error) {
      console.error('Failed to cleanup failed downloads:', error);
      return 0;
    }
  }

  /**
   * Add download progress listener
   */
  addProgressListener(downloadId: string, listener: (progress: DownloadProgress) => void): void {
    this.downloadListeners.set(downloadId, listener);
  }

  /**
   * Remove download progress listener
   */
  removeProgressListener(downloadId: string): void {
    this.downloadListeners.delete(downloadId);
  }

  /**
   * Add notification listener
   */
  addNotificationListener(listener: (notification: DownloadNotification) => void): void {
    this.notificationListeners.add(listener);
  }

  /**
   * Remove notification listener
   */
  removeNotificationListener(listener: (notification: DownloadNotification) => void): void {
    this.notificationListeners.delete(listener);
  }

  /**
   * Send notification to all listeners
   */
  private sendNotification(notification: DownloadNotification): void {
    this.notificationListeners.forEach(listener => {
      try {
        listener(notification);
      } catch (error) {
        console.error('Error in notification listener:', error);
      }
    });
  }

  /**
   * Create standardized download error
   */
  private createDownloadError(message: string, originalError: any): AppError {
    return {
      type: ErrorType.STORAGE_ERROR,
      message,
      code: originalError?.code || 'DOWNLOAD_ERROR',
    };
  }
}

// Export singleton instance
export const downloadService = DownloadService.getInstance();