import { useCallback, useEffect, useState } from 'react';
import { pickTrailerKey, TMDBService } from '@/src/services/TMDBService';
import {
  isMovie,
  type CastMember,
  type CrewMember,
  type Episode,
  type MediaItem,
  type MovieDetails,
  type Season,
  type TVShowDetails,
  type VideoResult,
} from '@/src/types';

interface DetailState {
  loading: boolean;
  error: string | null;
  details: MovieDetails | TVShowDetails | null;
  trailerKey: string | null;
  videos: VideoResult[];
  similar: MediaItem[];
  seasons: Season[];
  cast: CastMember[];
  crew: CrewMember[];
  certification: string | null;
  logoPath: string | null;
}

export const useDetailData = (item: MediaItem) => {
  const movie = isMovie(item);
  const [state, setState] = useState<DetailState>({
    loading: true,
    error: null,
    details: null,
    trailerKey: null,
    videos: [],
    similar: [],
    seasons: [],
    cast: [],
    crew: [],
    certification: null,
    logoPath: null,
  });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        if (movie) {
          const [details, videos, similar, credits, certification, images] =
            await Promise.all([
              TMDBService.getMovieDetails(item.id),
              TMDBService.getMovieVideos(item.id),
              TMDBService.getSimilarMovies(item.id),
              TMDBService.getMovieCredits(item.id),
              TMDBService.getCertification(item.id, 'movie'),
              TMDBService.getMovieImages(item.id),
            ]);
          if (cancelled) return;
          setState({
            loading: false,
            error: null,
            details,
            trailerKey: pickTrailerKey(videos),
            videos: videos.results ?? [],
            similar: similar.results.map((m) => ({
              ...m,
              media_type: 'movie',
            })),
            seasons: [],
            cast: credits.cast ?? [],
            crew: credits.crew ?? [],
            certification,
            logoPath: TMDBService.pickLogoPath(images.logos),
          });
        } else {
          const [details, videos, similar, credits, certification, images] =
            await Promise.all([
              TMDBService.getTVShowDetails(item.id),
              TMDBService.getTVShowVideos(item.id),
              TMDBService.getSimilarTVShows(item.id),
              TMDBService.getTVShowCredits(item.id),
              TMDBService.getCertification(item.id, 'tv'),
              TMDBService.getTVImages(item.id),
            ]);
          if (cancelled) return;
          const seasons = (details.seasons ?? []).filter(
            (s) => s.season_number > 0,
          );
          setState({
            loading: false,
            error: null,
            details,
            trailerKey: pickTrailerKey(videos),
            videos: videos.results ?? [],
            similar: similar.results.map((t) => ({ ...t, media_type: 'tv' })),
            seasons,
            cast: credits.cast ?? [],
            crew: credits.crew ?? [],
            certification,
            logoPath: TMDBService.pickLogoPath(images.logos),
          });
        }
      } catch (err) {
        if (!cancelled)
          setState((s) => ({
            ...s,
            loading: false,
            error: err instanceof Error ? err.message : 'Failed to load.',
          }));
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [item.id, movie]);

  return state;
};

/** Loads episodes for a given TV season on demand. */
export const useSeasonEpisodes = (tvId: number, seasonNumber: number | null) => {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (seasonNumber == null) return;
    setLoading(true);
    try {
      const data = await TMDBService.getSeasonDetails(tvId, seasonNumber);
      setEpisodes(data.episodes ?? []);
    } catch {
      setEpisodes([]);
    } finally {
      setLoading(false);
    }
  }, [tvId, seasonNumber]);

  useEffect(() => {
    load();
  }, [load]);

  return { episodes, loading };
};
