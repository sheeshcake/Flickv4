import { useEffect, useState } from 'react';
import { TMDBService } from '@/src/services/TMDBService';
import { isMovie, type MediaItem } from '@/src/types';

/**
 * Fetches the best TMDB title logo path for a movie/TV item, mirroring the
 * Detail screen. Returns `null` while loading or when no logo is available.
 */
export const useTitleLogo = (item: MediaItem): string | null => {
  const [logoPath, setLogoPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLogoPath(null);
    const movie = isMovie(item);
    const fetcher = movie
      ? TMDBService.getMovieImages(item.id)
      : TMDBService.getTVImages(item.id);
    fetcher
      .then((images) => {
        if (!cancelled) setLogoPath(TMDBService.pickLogoPath(images.logos));
      })
      .catch(() => {
        if (!cancelled) setLogoPath(null);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.media_type]);

  return logoPath;
};
