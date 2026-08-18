import { useEffect, useState } from 'react';
import { TMDBService } from '@/src/services/TMDBService';
import {
  getReleaseDate,
  isMovie,
  type Episode,
  type MediaItem,
} from '@/src/types';
import { getComingSoon } from '@/src/utils/comingSoon';

/** First aired episode of a show, or null if nothing is out yet. */
export const resolveFirstAiredEpisode = async (
  item: MediaItem,
): Promise<{ season: number; episode: Episode } | null> => {
  const details = await TMDBService.getTVShowDetails(item.id);
  const seasons = (details.seasons ?? [])
    .filter((s) => s.season_number > 0)
    .sort((a, b) => a.season_number - b.season_number);
  for (const season of seasons) {
    const data = await TMDBService.getSeasonDetails(item.id, season.season_number);
    const aired = (data.episodes ?? []).find(
      (e) => !getComingSoon({ releaseDate: e.air_date }).comingSoon,
    );
    if (aired) return { season: season.season_number, episode: aired };
  }
  return null;
};

export interface WatchNextRecommendationResult {
  recommendation: MediaItem | null;
  loading: boolean;
}

/**
 * Prefetches one similar title to offer after a movie (or series finale)
 * ends. Same TMDB `/similar` list as Detail's "More Like This". Skips the
 * current id and anything still coming soon.
 */
export const useWatchNextRecommendation = (
  item: MediaItem,
  enabled: boolean,
): WatchNextRecommendationResult => {
  const [recommendation, setRecommendation] = useState<MediaItem | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setRecommendation(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setRecommendation(null);

    const movie = isMovie(item);
    const request = movie
      ? TMDBService.getSimilarMovies(item.id)
      : TMDBService.getSimilarTVShows(item.id);

    request
      .then((res) => {
        if (cancelled) return;
        const stamped: MediaItem[] = (res.results ?? []).map((row) =>
          movie
            ? { ...row, media_type: 'movie' as const }
            : { ...row, media_type: 'tv' as const },
        );
        const pick =
          stamped.find(
            (candidate) =>
              candidate.id !== item.id &&
              !getComingSoon({
                releaseDate: getReleaseDate(candidate),
              }).comingSoon &&
              candidate.poster_path,
          ) ??
          stamped.find(
            (candidate) =>
              candidate.id !== item.id &&
              !getComingSoon({
                releaseDate: getReleaseDate(candidate),
              }).comingSoon,
          ) ??
          null;
        setRecommendation(pick);
      })
      .catch(() => {
        if (!cancelled) setRecommendation(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, item.id, item.media_type]);

  return { recommendation, loading };
};
