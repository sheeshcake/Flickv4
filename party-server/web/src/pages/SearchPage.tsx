import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { PosterCard } from '@/components/PosterCard';
import { Input } from '@/components/ui/input';
import {
  taggedTrendingMovies,
  taggedTrendingTv,
  tmdb,
  type MediaItem,
} from '@/lib/tmdb';

const interleave = <T,>(a: T[], b: T[]): T[] => {
  const out: T[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
};

export const SearchPage = () => {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [trending, setTrending] = useState<MediaItem[]>([]);
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [trendingLoading, setTrendingLoading] = useState(true);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([taggedTrendingMovies(), taggedTrendingTv()])
      .then(([movies, tv]) => {
        if (!cancelled) setTrending(interleave(movies, tv));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTrendingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!debounced) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    tmdb
      .searchMulti(debounced)
      .then((data) => {
        if (!cancelled) setResults(data.results);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const items = debounced ? results : trending;
  const heading = debounced ? 'Results' : 'Trending';

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-24">
      <div className="relative mb-6">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search movies and TV"
          className="h-12 pl-10"
          autoFocus
        />
      </div>
      <h1 className="mb-4 text-lg font-bold">{heading}</h1>
      {loading || (!debounced && trendingLoading) ? (
        <div className="flex justify-center py-16">
          <div className="size-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No titles found.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-6">
          {items.map((item) => (
            <PosterCard
              key={`${item.media_type}-${item.id}`}
              item={item}
              className="w-full"
            />
          ))}
        </div>
      )}
    </div>
  );
};
