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
