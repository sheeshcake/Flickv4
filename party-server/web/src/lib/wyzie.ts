export interface WyzieSubtitle {
  id: string;
  url: string;
  display: string;
  language: string;
  isHearingImpaired?: boolean;
}

export const searchWyzieSubtitles = async (req: {
  tmdbId: number;
  season?: number;
  episode?: number;
}): Promise<WyzieSubtitle[]> => {
  if (!Number.isFinite(req.tmdbId) || req.tmdbId <= 0) return [];
  const params = new URLSearchParams();
  params.set('tmdbId', String(req.tmdbId));
  params.set('format', 'srt');
  if (req.season != null && req.episode != null) {
    params.set('season', String(req.season));
    params.set('episode', String(req.episode));
  }
  const res = await fetch(`/wyzie?${params}`);
  if (!res.ok) throw new Error('Wyzie unavailable');
  const data = (await res.json()) as { ok?: boolean; tracks?: WyzieSubtitle[] };
  if (data.ok === false) throw new Error('Wyzie unavailable');
  return Array.isArray(data.tracks) ? data.tracks : [];
};
