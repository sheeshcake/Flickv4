import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Play, Users } from 'lucide-react';
import { HostLobby } from '@/components/HostLobby';
import { PosterCard } from '@/components/PosterCard';
import { Button } from '@/components/ui/button';
import { useParty } from '@/hooks/useParty';
import { partyContentFromTitle, watchPath } from '@/lib/party';
import {
  comingSoonLabel,
  getReleaseDate,
  getTitle,
  tmdb,
  tmdbImage,
  type Episode,
  type MediaItem,
  type MovieDetails,
  type Season,
  type TVShowDetails,
} from '@/lib/tmdb';

export const DetailPage = () => {
  const { type, id } = useParams();
  const mediaType = type === 'tv' ? 'tv' : 'movie';
  const tmdbId = Number(id);
  const navigate = useNavigate();
  const { room, role, send } = useParty();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<MovieDetails | TVShowDetails | null>(null);
  const [cast, setCast] = useState<string>('');
  const [similar, setSimilar] = useState<MediaItem[]>([]);
  const [imdbId, setImdbId] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [lobbyOpen, setLobbyOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEpisodes([]);
    setSeasons([]);
    setSelectedSeason(null);
    const run = async () => {
      try {
        if (mediaType === 'movie') {
          const [movie, credits, more, ids] = await Promise.all([
            tmdb.movieDetails(tmdbId),
            tmdb.movieCredits(tmdbId),
            tmdb.similarMovies(tmdbId),
            tmdb.movieExternalIds(tmdbId),
          ]);
          if (cancelled) return;
          setDetails({ ...movie, media_type: 'movie' });
          setCast((credits.cast ?? []).slice(0, 4).map((c) => c.name).join(', '));
          setSimilar(more.results.map((m) => ({ ...m, media_type: 'movie' as const })));
          setImdbId(ids.imdb_id);
          setSeasons([]);
          setSelectedSeason(null);
        } else {
          const [show, credits, more, ids] = await Promise.all([
            tmdb.tvDetails(tmdbId),
            tmdb.tvCredits(tmdbId),
            tmdb.similarTv(tmdbId),
            tmdb.tvExternalIds(tmdbId),
          ]);
          if (cancelled) return;
          setDetails({ ...show, media_type: 'tv' });
          setCast((credits.cast ?? []).slice(0, 4).map((c) => c.name).join(', '));
          setSimilar(more.results.map((s) => ({ ...s, media_type: 'tv' as const })));
          setImdbId(ids.imdb_id);
          const nextSeasons = (show.seasons ?? []).filter((s) => s.season_number > 0);
          setSeasons(nextSeasons);
          setSelectedSeason(nextSeasons[0]?.season_number ?? 1);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load title.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [mediaType, tmdbId]);

  useEffect(() => {
    if (mediaType !== 'tv' || selectedSeason == null) {
      setEpisodes([]);
      return;
    }
    let cancelled = false;
    setEpisodes([]);
    tmdb
      .seasonDetails(tmdbId, selectedSeason)
      .then((data) => {
        if (!cancelled) setEpisodes(data.episodes ?? []);
      })
      .catch(() => {
        if (!cancelled) setEpisodes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaType, selectedSeason, tmdbId]);

  const item = details as MediaItem | null;
  const coming = item
    ? comingSoonLabel(getReleaseDate(item), details?.status)
    : null;
  const year = item ? getReleaseDate(item)?.slice(0, 4) : undefined;
  const backdrop = tmdbImage(details?.backdrop_path, 'w1280');
  const firstEpisode = episodes[0];
  const tvReady =
    mediaType !== 'tv' || (selectedSeason != null && Boolean(firstEpisode));

  const contentFor = (season?: number, episode?: number) => {
    if (!item) return null;
    return partyContentFromTitle(item, season, episode, imdbId);
  };

  const playTitle = async (season?: number, episode?: number) => {
    if (mediaType === 'tv' && (season == null || episode == null)) return;
    const content = contentFor(season, episode);
    if (!content || busy) return;
    setBusy(true);
    try {
      if (role === 'host' && room) {
        const sameTitle =
          room.content.tmdbId === content.tmdbId &&
          room.content.mediaType === content.mediaType;
        if (sameTitle && season != null && episode != null) {
          send({ type: 'episode', season, episode });
        } else {
          send({ type: 'content', content });
        }
        navigate(`/p/${room.code}`);
        return;
      }
      navigate(watchPath(content));
    } catch {
      setError('Could not start playback.');
    } finally {
      setBusy(false);
    }
  };

  const playDefault = () => {
    if (mediaType === 'tv' && selectedSeason != null && firstEpisode) {
      void playTitle(selectedSeason, firstEpisode.episode_number);
      return;
    }
    void playTitle();
  };

  const lobbyContent = useMemo(() => {
    if (mediaType === 'tv') {
      if (selectedSeason == null || !firstEpisode) return null;
      return contentFor(selectedSeason, firstEpisode.episode_number);
    }
    return contentFor();
  }, [firstEpisode, imdbId, item, mediaType, selectedSeason]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="size-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !item || !details) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted-foreground">{error || 'Title not found.'}</p>
        <Button asChild variant="outline">
          <Link to="/">Back home</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <div className="relative min-h-[42vw] max-h-[520px] overflow-hidden">
        {backdrop ? (
          <img src={backdrop} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-64 bg-muted" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      </div>
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <h1 className="mb-2 text-3xl font-bold sm:text-4xl">{getTitle(item)}</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          {[year, mediaType === 'tv' ? 'TV Series' : 'Movie'].filter(Boolean).join(' · ')}
        </p>
        {coming ? (
          <Button size="lg" className="mb-3 w-full sm:w-auto" disabled>
            {coming}
          </Button>
        ) : (
          <div className="mb-4 flex flex-wrap gap-2">
            <Button
              size="lg"
              className="bg-foreground text-background hover:bg-foreground/90"
              onClick={playDefault}
              disabled={busy || !tvReady}
            >
              <Play className="size-5 fill-current" />
              {busy ? 'Starting…' : 'Play'}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                if (!tvReady || !lobbyContent) return;
                if (role === 'host' && room) {
                  send({ type: 'content', content: lobbyContent });
                }
                setLobbyOpen(true);
              }}
              disabled={busy || !tvReady}
            >
              <Users className="size-5" />
              Watch party
            </Button>
          </div>
        )}
        <p className="mb-4 text-sm leading-relaxed">{details.overview}</p>
        {cast ? (
          <p className="mb-6 text-sm text-muted-foreground">
            Starring: <span className="text-foreground">{cast}</span>
          </p>
        ) : null}

        {mediaType === 'tv' && seasons.length > 0 ? (
          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Episodes</h2>
              <select
                className="rounded-md border border-border bg-card px-3 py-2 text-sm"
                value={selectedSeason ?? ''}
                onChange={(e) => setSelectedSeason(Number(e.target.value))}
              >
                {seasons.map((season) => (
                  <option key={season.id} value={season.season_number}>
                    {season.name || `Season ${season.season_number}`}
                  </option>
                ))}
              </select>
            </div>
            <ul className="space-y-2">
              {episodes.map((ep) => (
                <li key={ep.id}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 rounded-lg border border-border bg-card p-3 text-left hover:bg-primary/10"
                    onClick={() => void playTitle(ep.season_number, ep.episode_number)}
                    disabled={busy || Boolean(coming)}
                  >
                    <span className="w-8 shrink-0 text-sm font-bold text-muted-foreground">
                      {ep.episode_number}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{ep.name}</span>
                      {ep.overview ? (
                        <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
                          {ep.overview}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {similar.length > 0 ? (
          <section>
            <h2 className="mb-3 text-lg font-bold">More like this</h2>
            <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
              {similar.map((row) => (
                <PosterCard key={`${row.media_type}-${row.id}`} item={row} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
      <HostLobby
        open={lobbyOpen}
        content={lobbyContent}
        onClose={() => setLobbyOpen(false)}
        onPlayTogether={(code) => {
          setLobbyOpen(false);
          navigate(`/p/${code}`);
        }}
      />
    </div>
  );
};
