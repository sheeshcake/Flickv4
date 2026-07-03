import RNFS from 'react-native-fs';
import { fromByteArray } from 'react-native-quick-base64';
import { M3U8StreamInfo } from '../types';
import { fetchStream } from './streamHeaders';

export interface M3U8Segment {
  uri: string;
  duration: number;
  timeline: number;
  index: number;
}

export interface M3U8Playlist {
  segments: M3U8Segment[];
  targetDuration: number;
  mediaSequence: number;
  endList: boolean;
  version: number;
  totalDuration: number;
}

export function isM3U8Url(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return (
    lowerUrl.includes('.m3u8') ||
    lowerUrl.includes('.m3u') ||
    lowerUrl.includes('application/x-mpegurl') ||
    lowerUrl.includes('application/vnd.apple.mpegurl') ||
    lowerUrl.includes('playlist.m3u8') ||
    lowerUrl.includes('index.m3u8') ||
    lowerUrl.includes('master.m3u8')
  );
}

export function resolveM3U8Url(url: string, baseUrl: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (url.startsWith('/')) {
    const urlParts = baseUrl.match(/^(https?:\/\/[^/]+)/);
    return urlParts ? urlParts[1] + url : baseUrl.substring(0, baseUrl.lastIndexOf('/')) + url;
  }
  return baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1) + url;
}

export function parseMediaPlaylist(lines: string[], baseUrl: string): M3U8Playlist {
  const segments: M3U8Segment[] = [];
  let targetDuration = 10;
  let mediaSequence = 0;
  let version = 3;
  let endList = false;
  let currentDuration = 10;
  let segmentIndex = 0;
  let totalDuration = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      targetDuration = parseInt(line.split(':')[1], 10) || 10;
    } else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      mediaSequence = parseInt(line.split(':')[1], 10) || 0;
    } else if (line.startsWith('#EXT-X-VERSION:')) {
      version = parseInt(line.split(':')[1], 10) || 3;
    } else if (line === '#EXT-X-ENDLIST') {
      endList = true;
    } else if (line.startsWith('#EXTINF:')) {
      const durationMatch = line.match(/#EXTINF:([\d.]+)/);
      if (durationMatch) {
        currentDuration = parseFloat(durationMatch[1]);
      }
    } else if (!line.startsWith('#') && line.length > 0) {
      segments.push({
        uri: resolveM3U8Url(line, baseUrl),
        duration: currentDuration,
        timeline: 0,
        index: segmentIndex++,
      });
      totalDuration += currentDuration;
      currentDuration = targetDuration;
    }
  }

  if (segments.length === 0) {
    throw new Error('No segments found in M3U8 playlist');
  }

  return { segments, targetDuration, mediaSequence, endList, version, totalDuration };
}

async function parseMasterPlaylist(
  lines: string[],
  baseUrl: string,
  selectedStreamUrl?: string,
): Promise<M3U8Playlist> {
  if (selectedStreamUrl) {
    return fetchM3U8Playlist(selectedStreamUrl);
  }

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
    current.bandwidth > best.bandwidth ? current : best,
  );

  return fetchM3U8Playlist(resolveM3U8Url(bestStream.url, baseUrl));
}

export async function fetchM3U8Playlist(
  url: string,
  selectedStreamUrl?: string,
): Promise<M3U8Playlist> {
  const response = await fetchStream(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch M3U8 playlist: ${response.status}`);
  }

  const playlistText = await response.text();
  const lines = playlistText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const isMasterPlaylist = lines.some((line) => line.includes('#EXT-X-STREAM-INF'));
  if (isMasterPlaylist) {
    if (selectedStreamUrl) {
      return fetchM3U8Playlist(selectedStreamUrl);
    }
    return parseMasterPlaylist(lines, url, selectedStreamUrl);
  }

  return parseMediaPlaylist(lines, url);
}

export function generateResolutionLabel(
  height: number,
  bandwidth: number,
  frameRate?: number,
): string {
  let qualityLabel = '';

  if (height >= 2160) {
    qualityLabel = '4K Ultra HD';
  } else if (height >= 1440) {
    qualityLabel = '1440p QHD';
  } else if (height >= 1080) {
    qualityLabel = '1080p Full HD';
  } else if (height >= 720) {
    qualityLabel = '720p HD';
  } else if (height >= 480) {
    qualityLabel = '480p SD';
  } else if (height >= 360) {
    qualityLabel = '360p';
  } else if (height > 0) {
    qualityLabel = `${height}p`;
  } else {
    const mbps = bandwidth / 1000000;
    if (mbps >= 15) {
      qualityLabel = '4K (estimated)';
    } else if (mbps >= 8) {
      qualityLabel = '1080p (estimated)';
    } else if (mbps >= 4) {
      qualityLabel = '720p (estimated)';
    } else {
      qualityLabel = 'SD (estimated)';
    }
  }

  if (frameRate && frameRate >= 50) {
    qualityLabel += ` ${Math.round(frameRate)}fps`;
  }

  const mbps = (bandwidth / 1000000).toFixed(1);
  qualityLabel += ` • ${mbps} Mbps`;

  return qualityLabel;
}

export async function getAvailableResolutions(videoUrl: string): Promise<M3U8StreamInfo[]> {
  try {
    if (!isM3U8Url(videoUrl)) {
      return [];
    }

    const response = await fetchStream(videoUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch M3U8 playlist: ${response.status}`);
    }

    const playlistText = await response.text();
    const lines = playlistText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const isMasterPlaylist = lines.some((line) => line.includes('#EXT-X-STREAM-INF'));
    if (!isMasterPlaylist) {
      return [];
    }

    const streams: M3U8StreamInfo[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
        const resolutionMatch = line.match(/RESOLUTION=(\d+)x(\d+)/);
        const codecsMatch = line.match(/CODECS="([^"]+)"/);
        const frameRateMatch = line.match(/FRAME-RATE=([\d.]+)/);

        if (i + 1 < lines.length && !lines[i + 1].startsWith('#')) {
          const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0;
          const width = resolutionMatch ? parseInt(resolutionMatch[1], 10) : 0;
          const height = resolutionMatch ? parseInt(resolutionMatch[2], 10) : 0;

          streams.push({
            bandwidth,
            resolution: resolutionMatch ? `${width}x${height}` : 'unknown',
            width,
            height,
            url: resolveM3U8Url(lines[i + 1], videoUrl),
            codecs: codecsMatch ? codecsMatch[1] : undefined,
            frameRate: frameRateMatch ? parseFloat(frameRateMatch[1]) : undefined,
            label: generateResolutionLabel(
              height,
              bandwidth,
              frameRateMatch ? parseFloat(frameRateMatch[1]) : undefined,
            ),
          });
        }
      }
    }

    streams.sort((a, b) => b.height - a.height);
    return streams;
  } catch (error) {
    console.error('Failed to get available resolutions:', error);
    return [];
  }
}

export function getSegmentPath(segmentsDir: string, index: number): string {
  return `${segmentsDir}/segment_${index.toString().padStart(5, '0')}.ts`;
}

export async function downloadSegmentToFile(
  uri: string,
  segmentPath: string,
  signal?: AbortSignal,
): Promise<number> {
  const response = await fetchStream(uri, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64Data = fromByteArray(new Uint8Array(arrayBuffer));
  await RNFS.writeFile(segmentPath, base64Data, 'base64');
  return arrayBuffer.byteLength;
}

export function findSegmentIndexAtTime(segments: M3U8Segment[], timeSec: number): number {
  let elapsed = 0;
  for (const segment of segments) {
    elapsed += segment.duration;
    if (timeSec < elapsed) {
      return segment.index;
    }
  }
  return Math.max(0, segments.length - 1);
}

export function getCachedDurationAhead(
  segments: M3U8Segment[],
  downloadedIndices: Set<number>,
  playheadSec: number,
): number {
  const startIndex = findSegmentIndexAtTime(segments, playheadSec);
  let ahead = 0;
  let elapsed = segments.slice(0, startIndex).reduce((sum, s) => sum + s.duration, 0);

  for (let i = startIndex; i < segments.length; i++) {
    if (!downloadedIndices.has(i)) {
      break;
    }
    ahead += segments[i].duration;
    elapsed += segments[i].duration;
  }

  return ahead;
}
