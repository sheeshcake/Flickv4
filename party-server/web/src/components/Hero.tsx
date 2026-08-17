import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  comingSoonLabel,
  getReleaseDate,
  getTitle,
  tmdbImage,
  type MediaItem,
} from '@/lib/tmdb';

interface HeroProps {
  items: MediaItem[];
}

export const Hero = ({ items }: HeroProps) => {
  const item = items[0];
  if (!item) return null;
  const backdrop = tmdbImage(item.backdrop_path, 'w1280');
  const type = item.media_type === 'tv' ? 'tv' : 'movie';
  const coming = comingSoonLabel(getReleaseDate(item));
  return (
    <section className="relative mb-8 min-h-[58vw] max-h-[640px] w-full overflow-hidden sm:min-h-[42vw]">
      {backdrop ? (
        <img
          src={backdrop}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-muted" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 z-10 max-w-2xl px-4 pb-10 sm:px-6">
        <h1 className="mb-3 text-3xl font-bold drop-shadow sm:text-5xl">
          {getTitle(item)}
        </h1>
        <p className="mb-4 line-clamp-3 text-sm text-muted-foreground sm:text-base">
          {item.overview}
        </p>
        {coming ? (
          <p className="text-sm font-semibold text-muted-foreground">{coming}</p>
        ) : (
          <Button asChild size="lg" className="bg-foreground text-background hover:bg-foreground/90">
            <Link to={`/title/${type}/${item.id}`}>
              <Play className="size-5 fill-current" />
              Play
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
};
