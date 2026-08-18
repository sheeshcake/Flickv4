import { languageFromLabel } from '@/lib/languages';
import type { WyzieSubtitle } from '@/lib/wyzie';

export const searchVdrkSubtitles = async (req: {
  tmdbId: number;
  season?: number;
  episode?: number;
}): Promise<WyzieSubtitle[]> => {
  if (!Number.isFinite(req.tmdbId) || req.tmdbId <= 0) return [];
  const params = new URLSearchParams();
  params.set('tmdbId', String(req.tmdbId));
  if (req.season != null && req.episode != null) {
    params.set('season', String(req.season));
    params.set('episode', String(req.episode));
  }
  const res = await fetch(`/vdrk?${params}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { ok?: boolean; tracks?: WyzieSubtitle[] };
  if (data.ok === false) return [];
  return Array.isArray(data.tracks)
    ? data.tracks.map((t) => ({
        ...t,
        language: t.language || languageFromLabel(t.display),
      }))
    : [];
};
