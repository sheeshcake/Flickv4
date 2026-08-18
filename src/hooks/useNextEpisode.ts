import { useEffect, useMemo, useState } from 'react';
import { useSeasonEpisodes } from '@/src/hooks/useDetailData';
import { TMDBService } from '@/src/services/TMDBService';
import type { Episode, MediaItem, Season, TVShowDetails } from '@/src/types';
import { getComingSoon } from '@/src/utils/comingSoon';

const isAiredEpisode = (episode: Episode): boolean =>
  !getComingSoon({ releaseDate: episode.air_date }).comingSoon;

/**
 * How long before an episode's natural end the "Up Next" card should
 * appear, in seconds. Shared with `PlayerCore`/`UpNextOverlay` so the
 * countdown shown to the user always matches the threshold that triggers it.
 */
export const UP_NEXT_LEAD_SECONDS = 10;

export interface NextEpisodeInfo {
  season: number;
  episode: Episode;
}

export interface NextEpisodeResult {
  nextEpisode: NextEpisodeInfo | null;
  /**
   * True while we don't yet know for sure whether there's a next episode
   * (season list / episode list requests still in flight). Callers MUST NOT
   * treat `nextEpisode === null` as "series finale" while this is true —
   * otherwise a still-loading result gets misread as "nothing more to
   * play" (this is exactly what caused the false "no more episodes"
   * report: `currentSeasonEpisodes` starts as `[]` before its fetch
   * resolves, which looks identical to "no next episode exists").
   */
  loading: boolean;
}

/**
 * Resolves "what plays after this episode" for the autoplay-next feature:
 * the next episode number within the current season, or — if the current
 * episode is the season's last — the first episode of the next season.
 * Resolves `nextEpisode: null` (with `loading: false`) only once we've
 * definitively confirmed there's nothing left (series finale).
 *
 * @param enabled Caller-controlled switch (e.g. `PlayerCore`'s
 * `autoplayNextEnabled`) — this hook does NOT re-derive its own
 * platform/media-type gating, so it never fights the caller's decision
 * about when autoplay-next should run. Pass `false` to no-op (never
 * fetches, always resolves `{ nextEpisode: null, loading: false }`).
 */
export const useNextEpisode = (
  item: MediaItem,
  season: number | undefined,
  episode: number | undefined,
  enabledByCaller: boolean,
): NextEpisodeResult => {
  const enabled =
    enabledByCaller &&
    item.media_type === 'tv' &&
    season != null &&
    episode != null;

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonsLoaded, setSeasonsLoaded] = useState(false);

  // Season list, fetched once per show.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setSeasonsLoaded(false);
    TMDBService.getTVShowDetails(item.id)
      .then((details: TVShowDetails) => {
        if (cancelled) return;
        setSeasons(
          (details.seasons ?? []).filter((s) => s.season_number > 0),
        );
      })
      .catch(() => {
        if (!cancelled) setSeasons([]);
      })
      .finally(() => {
        if (!cancelled) setSeasonsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, item.id]);

  const { episodes: currentSeasonEpisodes, loading: currentSeasonLoading } =
    useSeasonEpisodes(item.id, enabled ? season! : null);

  // Next season number, if the current season isn't the last one known.
  // Only resolved once the season list itself has finished loading.
  const nextSeasonNumber = useMemo(() => {
    if (!enabled || !seasonsLoaded) return null;
    const sorted = [...seasons].sort(
      (a, b) => a.season_number - b.season_number,
    );
    const idx = sorted.findIndex((s) => s.season_number === season);
    if (idx === -1 || idx + 1 >= sorted.length) return null;
    return sorted[idx + 1].season_number;
  }, [enabled, seasonsLoaded, seasons, season]);

  const hasNextInCurrentSeason =
    enabled &&
    !currentSeasonLoading &&
    currentSeasonEpisodes.some((e) => e.episode_number === episode! + 1);

  // Only fetch the next season's episodes once we're sure the current
  // season doesn't already contain `episode + 1` AND we know what the next
  // season number is.
  const needsNextSeasonFetch =
    enabled &&
    !currentSeasonLoading &&
    !hasNextInCurrentSeason &&
    seasonsLoaded &&
    nextSeasonNumber != null;

  const { episodes: nextSeasonEpisodes, loading: nextSeasonLoading } =
    useSeasonEpisodes(item.id, needsNextSeasonFetch ? nextSeasonNumber : null);

  return useMemo<NextEpisodeResult>(() => {
    if (!enabled) return { nextEpisode: null, loading: false };

    // Current season's episode list hasn't landed yet — we can't even tell
    // whether `episode + 1` exists in it. Don't guess.
    if (currentSeasonLoading) return { nextEpisode: null, loading: true };

    const sameSeasonNext = currentSeasonEpisodes.find(
      (e) => e.episode_number === episode! + 1,
    );
    if (sameSeasonNext) {
      // Exists in TMDB but not aired yet — treat as nothing playable next.
      if (!isAiredEpisode(sameSeasonNext)) {
        return { nextEpisode: null, loading: false };
      }
      return {
        nextEpisode: { season: season!, episode: sameSeasonNext },
        loading: false,
      };
    }

    // No next episode in this season. Need the season list to know if
    // there's a next season at all.
    if (!seasonsLoaded) return { nextEpisode: null, loading: true };

    if (nextSeasonNumber == null) {
      // Confirmed: this was the last episode of the last known season.
      return { nextEpisode: null, loading: false };
    }

    if (nextSeasonLoading) return { nextEpisode: null, loading: true };

    const firstOfNext =
      nextSeasonEpisodes.find((e) => e.episode_number === 1) ??
      nextSeasonEpisodes[0];

    if (!firstOfNext || !isAiredEpisode(firstOfNext)) {
      return { nextEpisode: null, loading: false };
    }

    return {
      nextEpisode: { season: nextSeasonNumber, episode: firstOfNext },
      loading: false,
    };
  }, [
    enabled,
    currentSeasonLoading,
    currentSeasonEpisodes,
    episode,
    season,
    seasonsLoaded,
    nextSeasonNumber,
    nextSeasonLoading,
    nextSeasonEpisodes,
  ]);
};
