import { Directory, File, Paths } from 'expo-file-system';
import {
  cuesToWebVtt,
  parseSubtitleText,
  shiftSubtitleCues,
  toWebVtt,
} from '@/src/utils/subtitles';

const CACHE_DIR_NAME = 'flick-native-subs';

/** Sanitize a track id so it is safe as a single path segment. */
const safeTrackFileName = (trackId: string): string => {
  const cleaned = trackId.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
  return cleaned || 'track';
};

/** Encode offset into the filename so a new URI forces ExoPlayer to reload. */
const offsetFileSuffix = (offsetSeconds: number): string => {
  const offsetMs = Math.round(offsetSeconds * 1000);
  if (offsetMs === 0) return '';
  const sign = offsetMs < 0 ? 'm' : 'p';
  return `_o${sign}${Math.abs(offsetMs)}`;
};

/**
 * Convert SRT (or already-VTT) subtitle text to WebVTT and persist it under
 * the cache directory so react-native-video can load it as a local sidecar
 * (`TextTrackType.VTT` + file URI) — the pattern that works reliably with
 * the Android MergingMediaSource patch.
 *
 * Optional `offsetSeconds` shifts cue times (positive = captions later) and
 * writes a distinct filename so the player picks up the new track without a
 * full `<Video>` remount.
 */
export const writeNativeVttCache = async (
  trackId: string,
  rawText: string,
  offsetSeconds = 0,
): Promise<string> => {
  const vtt =
    offsetSeconds === 0
      ? toWebVtt(rawText)
      : cuesToWebVtt(
          shiftSubtitleCues(parseSubtitleText(rawText), offsetSeconds),
        );
  const dir = new Directory(Paths.cache, CACHE_DIR_NAME);
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
  const file = new File(
    dir,
    `${safeTrackFileName(trackId)}${offsetFileSuffix(offsetSeconds)}.vtt`,
  );
  if (file.exists) file.delete();
  file.create();
  file.write(vtt);
  return file.uri;
};
