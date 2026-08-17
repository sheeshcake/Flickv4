import { useEffect, useState } from 'react';
import { ContentRow } from '@/components/ContentRow';
import { Hero } from '@/components/Hero';
import { Button } from '@/components/ui/button';
import {
  GENRE_IDS,
  GENRE_NAMES,
  taggedGenreMovies,
  taggedTrendingMovies,
  taggedTrendingTv,
  type MediaItem,
} from '@/lib/tmdb';

interface HomeRow {
  title: string;
  items: MediaItem[];
}

export const HomePage = () => {
  const [hero, setHero] = useState<MediaItem[]>([]);
  const [rows, setRows] = useState<HomeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setLoading(true);
    Promise.all([
      taggedTrendingMovies(),
      taggedTrendingTv(),
      taggedGenreMovies(GENRE_IDS.action),
      taggedGenreMovies(GENRE_IDS.comedy),
      taggedGenreMovies(GENRE_IDS.sciFi),
    ])
      .then(([movies, tv, action, comedy, sciFi]) => {
        setHero(movies.slice(0, 5));
        setRows([
          { title: 'Trending Movies', items: movies },
          { title: 'Trending TV Shows', items: tv },
          { title: GENRE_NAMES[GENRE_IDS.action], items: action },
          { title: GENRE_NAMES[GENRE_IDS.comedy], items: comedy },
          { title: GENRE_NAMES[GENRE_IDS.sciFi], items: sciFi },
        ]);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load content.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="size-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error && !rows.length) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={load}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <Hero items={hero} />
      {rows.map((row) => (
        <ContentRow key={row.title} title={row.title} items={row.items} />
      ))}
    </div>
  );
};
