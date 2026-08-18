export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

const parseTimestamp = (raw: string): number => {
  // Supports SRT (00:00:01,000) and VTT (00:00:01.000)
  const cleaned = raw.trim().replace(',', '.');
  const parts = cleaned.split(':');
  if (parts.length < 3) return 0;
  const hours = Number(parts[0]) || 0;
  const minutes = Number(parts[1]) || 0;
  const seconds = Number(parts[2]) || 0;
  return hours * 3600 + minutes * 60 + seconds;
};

const stripTags = (text: string): string =>
  text
    .replace(/<[^>]+>/g, '')
    .replace(/\{[^}]+\}/g, '')
    .trim();

/** Parse SRT or basic WebVTT into cue objects (times in seconds). */
export const parseSubtitleText = (raw: string): SubtitleCue[] => {
  const normalized = raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\n+/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    if (lines[0].toUpperCase().startsWith('WEBVTT')) continue;

    let timeLineIndex = lines.findIndex((l) => l.includes('-->'));
    if (timeLineIndex < 0) continue;

    const timeLine = lines[timeLineIndex];
    const [startRaw, endRaw] = timeLine.split('-->').map((s) => s.trim());
    if (!startRaw || !endRaw) continue;

    const start = parseTimestamp(startRaw.split(' ')[0]);
    const end = parseTimestamp(endRaw.split(' ')[0]);
    const text = lines
      .slice(timeLineIndex + 1)
      .map(stripTags)
      .filter(Boolean)
      .join('\n');

    if (text && end > start) {
      cues.push({ start, end, text });
    }
  }

  return cues.sort((a, b) => a.start - b.start);
};

/** Convert SRT (or already-VTT) text into a WebVTT document for native sidecars. */
export const toWebVtt = (raw: string): string => {
  const normalized = raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (normalized.toUpperCase().startsWith('WEBVTT')) return normalized;
  // SRT uses comma decimals; WebVTT uses dots.
  const body = normalized.replace(
    /(\d{2}:\d{2}:\d{2}),(\d{3})/g,
    '$1.$2',
  );
  return `WEBVTT\n\n${body}\n`;
};

/** Shift cue times by `offsetSeconds` (positive = captions appear later). */
export const shiftSubtitleCues = (
  cues: SubtitleCue[],
  offsetSeconds: number,
): SubtitleCue[] => {
  if (offsetSeconds === 0) return cues;
  return cues
    .map((c) => ({
      ...c,
      start: c.start + offsetSeconds,
      end: c.end + offsetSeconds,
    }))
    .filter((c) => c.end > 0)
    .map((c) => ({
      ...c,
      start: Math.max(0, c.start),
    }));
};

const formatVttTimestamp = (seconds: number): string => {
  const clamped = Math.max(0, seconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  const whole = Math.floor(s);
  const ms = Math.round((s - whole) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
};

/** Serialize cues to a minimal WebVTT document. */
export const cuesToWebVtt = (cues: SubtitleCue[]): string => {
  const body = cues
    .map(
      (c, i) =>
        `${i + 1}\n${formatVttTimestamp(c.start)} --> ${formatVttTimestamp(c.end)}\n${c.text}`,
    )
    .join('\n\n');
  return `WEBVTT\n\n${body}\n`;
};

export const findCueAt = (
  cues: SubtitleCue[],
  time: number,
): SubtitleCue | null => {
  // Linear scan is fine for typical subtitle sizes; binary search for large.
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cue = cues[mid];
    if (time < cue.start) hi = mid - 1;
    else if (time > cue.end) lo = mid + 1;
    else return cue;
  }
  return null;
};
