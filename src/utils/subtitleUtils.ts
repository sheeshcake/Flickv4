/**
 * Utility functions for subtitle parsing, timing, and format conversion.
 */

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

const SRT_TIMESTAMP_REGEX =
  /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/;

function parseTimestamp(
  hours: string,
  minutes: string,
  seconds: string,
  millis: string,
): number {
  return (
    parseInt(hours, 10) * 3600 +
    parseInt(minutes, 10) * 60 +
    parseFloat(`${seconds}.${millis}`)
  );
}

function formatSrtTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const secs = Math.floor(clamped % 60);
  const millis = Math.round((clamped % 1) * 1000);
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${secs.toString().padStart(2, '0')},${millis
    .toString()
    .padStart(3, '0')}`;
}

function formatVttTimestamp(seconds: number): string {
  return formatSrtTimestamp(seconds).replace(',', '.');
}

export function parseSrtCues(srtContent: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const blocks = srtContent.trim().split(/\r?\n\r?\n/);

  for (const block of blocks) {
    const lines = block.trim().split(/\r?\n/);
    if (lines.length < 2) continue;

    const timestampIndex = lines.findIndex((line) => line.includes('-->'));
    if (timestampIndex === -1) continue;

    const match = lines[timestampIndex].match(SRT_TIMESTAMP_REGEX);
    if (!match) continue;

    const start = parseTimestamp(match[1], match[2], match[3], match[4]);
    const end = parseTimestamp(match[5], match[6], match[7], match[8]);
    const text = lines
      .slice(timestampIndex + 1)
      .join('\n')
      .replace(/<[^>]*>/g, '')
      .trim();

    if (text && end > start) {
      cues.push({ start, end, text });
    }
  }

  return cues.sort((a, b) => a.start - b.start);
}

export function findActiveCue(
  cues: SubtitleCue[],
  timeSec: number,
): SubtitleCue | null {
  if (cues.length === 0) return null;

  let left = 0;
  let right = cues.length - 1;
  let candidate = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (cues[mid].start <= timeSec) {
      candidate = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  if (candidate === -1) return null;

  const cue = cues[candidate];
  if (timeSec >= cue.start && timeSec < cue.end) {
    return cue;
  }

  return null;
}

export function applyDelayToSrt(srtContent: string, delaySec: number): string {
  if (!delaySec) return srtContent;

  const cues = parseSrtCues(srtContent);
  if (cues.length === 0) return srtContent;

  return cues
    .map((cue, index) => {
      const start = formatSrtTimestamp(Math.max(0, cue.start + delaySec));
      const end = formatSrtTimestamp(Math.max(0, cue.end + delaySec));
      if (cue.end + delaySec <= 0) return '';
      return `${index + 1}\n${start} --> ${end}\n${cue.text}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

export function convertSrtToVtt(srtContent: string, delaySec = 0): string {
  const source = delaySec ? applyDelayToSrt(srtContent, delaySec) : srtContent;
  const cues = parseSrtCues(source);
  let vttContent = 'WEBVTT\n\n';

  for (const cue of cues) {
    if (cue.end <= 0) continue;
    const start = formatVttTimestamp(Math.max(0, cue.start));
    const end = formatVttTimestamp(Math.max(0, cue.end));
    vttContent += `${start} --> ${end}\n${cue.text}\n\n`;
  }

  return vttContent;
}

/**
 * Extracts metadata from VTT content
 */
export function extractVttMetadata(vttContent: string) {
  const lines = vttContent.split('\n');
  const timingRegex = /(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/;

  let subtitleCount = 0;
  let firstTimestamp = '';
  let lastTimestamp = '';

  for (const line of lines) {
    const match = line.match(timingRegex);
    if (match) {
      subtitleCount++;
      if (!firstTimestamp) {
        firstTimestamp = match[1];
      }
      lastTimestamp = match[2];
    }
  }

  return {
    subtitleCount,
    firstTimestamp,
    lastTimestamp,
    duration:
      firstTimestamp && lastTimestamp
        ? `${firstTimestamp} to ${lastTimestamp}`
        : 'Unknown',
  };
}
