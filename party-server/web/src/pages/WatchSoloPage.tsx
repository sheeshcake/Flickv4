import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { WatchPlayer } from '@/components/WatchPlayer';
import { Button } from '@/components/ui/button';
import { partyContentFromTitle, type PartyContent } from '@/lib/party';
import { tmdb } from '@/lib/tmdb';

export const WatchSoloPage = () => {
  const { type, id, season, episode } = useParams();
  const mediaType = type === 'tv' ? 'tv' : 'movie';
  const tmdbId = Number(id);
  const seasonNum = Number(season);
  const episodeNum = Number(episode);
  const [content, setContent] = useState<PartyContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) return;
    if (mediaType === 'tv' && (!Number.isFinite(seasonNum) || !Number.isFinite(episodeNum))) {
      setError('Episode not found.');
      return;
    }
    let cancelled = false;
    setError(null);
    setContent(null);
    const run = async () => {
      try {
        if (mediaType === 'movie') {
          const [movie, ids] = await Promise.all([
            tmdb.movieDetails(tmdbId),
            tmdb.movieExternalIds(tmdbId),
          ]);
          if (cancelled) return;
          setContent(
            partyContentFromTitle(
              { ...movie, media_type: 'movie' },
              undefined,
              undefined,
              ids.imdb_id,
            ),
          );
          return;
        }
        const [show, ids] = await Promise.all([
          tmdb.tvDetails(tmdbId),
          tmdb.tvExternalIds(tmdbId),
        ]);
        if (cancelled) return;
        setContent(
          partyContentFromTitle(
            { ...show, media_type: 'tv' },
            seasonNum,
            episodeNum,
            ids.imdb_id,
          ),
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load title.');
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [episodeNum, mediaType, seasonNum, tmdbId]);

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted-foreground">{error}</p>
        <Button asChild variant="outline">
          <Link to="/">Back home</Link>
        </Button>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="size-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return <WatchPlayer content={content} />;
};
