export interface Cue {
  start: number;
  end: number;
  text: string;
}

const parseTimestamp = (raw: string): number => {
  const cleaned = raw.trim().replace(',', '.');
  const parts = cleaned.split(':');
  if (parts.length < 3) return 0;
  return (Number(parts[0]) || 0) * 3600 + (Number(parts[1]) || 0) * 60 + (Number(parts[2]) || 0);
};

export const parseSubtitleText = (raw: string): Cue[] => {
  const normalized = String(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\n+/);
  const out: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length || lines[0].toUpperCase().startsWith('WEBVTT')) continue;
    const timeLineIndex = lines.findIndex((l) => l.includes('-->'));
    if (timeLineIndex < 0) continue;
    const [startRaw, endRaw] = lines[timeLineIndex].split('-->').map((s) => s.trim());
    if (!startRaw || !endRaw) continue;
    const start = parseTimestamp(startRaw.split(' ')[0]);
    const end = parseTimestamp(endRaw.split(' ')[0]);
    const text = lines
      .slice(timeLineIndex + 1)
      .map((t) => t.replace(/<[^>]+>/g, '').replace(/\{[^}]+\}/g, '').trim())
      .filter(Boolean)
      .join('\n');
    if (text && end > start) out.push({ start, end, text });
  }
  return out.sort((a, b) => a.start - b.start);
};

export const shiftCues = (cues: Cue[], offsetSeconds: number): Cue[] => {
  if (!offsetSeconds) return cues;
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

/** Minimal WebVTT for Safari / iOS native `<track>` sidecars. */
export const cuesToWebVtt = (cues: Cue[]): string => {
  const body = cues
    .map(
      (c, i) =>
        `${i + 1}\n${formatVttTimestamp(c.start)} --> ${formatVttTimestamp(c.end)}\n${c.text}`,
    )
    .join('\n\n');
  return `WEBVTT\n\n${body}\n`;
};

export const cueAt = (cues: Cue[], t: number): Cue | null => {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cue = cues[mid];
    if (t < cue.start) hi = mid - 1;
    else if (t >= cue.end) lo = mid + 1;
    else return cue;
  }
  return null;
};
