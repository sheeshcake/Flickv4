import type { PartyContent } from '@/lib/party';

export interface StreamflixWebSource {
  id: string;
  name: string;
  language?: string;
  kind: 'hls' | 'file';
  url: string;
  subtitles: { label: string; file: string }[];
}

const AUTO_TRY_MAX = 6;

export const playbackHeadersForSourceId = (
  sourceId?: string | null,
): { referer: string; origin: string } => {
  const id = String(sourceId || '').toLowerCase();
  if (id.startsWith('videasy-')) {
    return {
      referer: 'https://player.videasy.net/',
      origin: 'https://player.videasy.net',
    };
  }
  if (id.startsWith('vidzee-')) {
    return {
      referer: 'https://player.vidzee.wtf/',
      origin: 'https://player.vidzee.wtf',
    };
  }
  return { referer: 'https://vidrock.net/', origin: 'https://vidrock.net' };
};

export const kindFromUrl = (
  url: string,
  fallback: 'hls' | 'file' = 'hls',
): 'hls' | 'file' => {
  if (/\.m3u8(\?|#|$)/i.test(url)) return 'hls';
  if (/\.(mp4|webm|mkv)(\?|#|$)/i.test(url)) return 'file';
  return fallback;
};

const isMkv = (source: StreamflixWebSource): boolean =>
  /\.mkv(\?|#|$)/i.test(source.url || '');

export const rankStreamflixSources = (
  sources: StreamflixWebSource[],
): StreamflixWebSource[] => {
  const original = new Map(sources.map((s, i) => [s.id, i]));
  const score = (s: StreamflixWebSource) => {
    if (isMkv(s)) return 90;
    const english = /english/i.test(s.language || '');
    const resolved = Boolean(s.url);
    const hls = s.kind === 'hls' || /\.m3u8(\?|#|$)/i.test(s.url || '');
    const vidrock = s.id.startsWith('vidrock-');
    if (resolved && english && hls && vidrock) return 0;
    if (resolved && english && hls) return 1;
    if (resolved && english) return 2;
    if (resolved && hls) return 3;
    if (resolved) return 4;
    if (english && vidrock) return 5;
    if (english) return 6;
    return 7;
  };
  return [...sources].sort((a, b) => {
    const d = score(a) - score(b);
    if (d !== 0) return d;
    return (original.get(a.id) ?? 0) - (original.get(b.id) ?? 0);
  });
};

export const autoTrySources = (
  sources: StreamflixWebSource[],
): StreamflixWebSource[] =>
  rankStreamflixSources(sources).filter((s) => !isMkv(s)).slice(0, AUTO_TRY_MAX);

export const fetchStreamflixSources = async (
  session: string,
): Promise<StreamflixWebSource[]> => {
  const res = await fetch(`/streamflix/${encodeURIComponent(session)}`);
  if (!res.ok) throw new Error('Could not list sources');
  const data = (await res.json()) as { sources?: StreamflixWebSource[] };
  return (data.sources ?? []).map((s) =>
    s.url ? { ...s, kind: kindFromUrl(s.url, s.kind) } : s,
  );
};

export const fetchStreamflixSource = async (
  session: string,
  sourceId: string,
): Promise<StreamflixWebSource | null> => {
  const res = await fetch(
    `/streamflix/${encodeURIComponent(session)}?source=${encodeURIComponent(sourceId)}`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { source?: StreamflixWebSource };
  if (!data.source?.url) return null;
  return {
    ...data.source,
    kind: kindFromUrl(data.source.url, data.source.kind),
  };
};

export const fetchVideasyEmbed = async (session: string): Promise<string | null> => {
  const res = await fetch(`/videasy/${encodeURIComponent(session)}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { url?: string };
  return data.url || null;
};

export const createPlaybackSession = async (
  content: PartyContent,
): Promise<string> => {
  const res = await fetch('/play', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(content),
  });
  if (!res.ok) throw new Error('Could not start playback');
  const data = (await res.json()) as { session?: string };
  if (!data.session) throw new Error('Could not start playback');
  return data.session;
};

export const registerPlaybackSource = async (
  session: string,
  source: {
    uri: string;
    kind: 'hls' | 'file';
    sourceId?: string;
    referer?: string;
    origin?: string;
    subtitles?: { label: string; file: string }[];
  },
): Promise<void> => {
  const inferred = playbackHeadersForSourceId(source.sourceId);
  const res = await fetch(`/play/${session}/source`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uri: source.uri,
      kind: source.kind,
      sourceId: source.sourceId,
      referer: source.referer ?? inferred.referer,
      origin: source.origin ?? inferred.origin,
      subtitles: source.subtitles ?? [],
    }),
  });
  if (!res.ok) throw new Error('Could not register stream');
};

export const registerSubtitleUrl = async (
  session: string,
  url: string,
): Promise<void> => {
  const res = await fetch(`/play/${session}/subtitle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error('Could not register subtitle');
};
