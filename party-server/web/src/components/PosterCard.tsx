import { Link } from 'react-router-dom';
import { getTitle, tmdbImage, type MediaItem } from '@/lib/tmdb';
import { cn } from '@/lib/utils';

interface PosterCardProps {
  item: MediaItem;
  className?: string;
}

export const PosterCard = ({ item, className }: PosterCardProps) => {
  const poster = tmdbImage(item.poster_path, 'w300');
  const type = item.media_type === 'tv' ? 'tv' : 'movie';
  return (
    <Link
      to={`/title/${type}/${item.id}`}
      className={cn(
        'group block w-[120px] shrink-0 overflow-hidden rounded-md bg-muted sm:w-[150px]',
        className,
      )}
    >
      {poster ? (
        <img
          src={poster}
          alt={getTitle(item)}
          className="aspect-[2/3] w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="flex aspect-[2/3] items-center justify-center px-2 text-center text-xs text-muted-foreground">
          {getTitle(item)}
        </div>
      )}
    </Link>
  );
};
