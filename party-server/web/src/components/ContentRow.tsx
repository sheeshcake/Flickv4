import { PosterCard } from '@/components/PosterCard';
import type { MediaItem } from '@/lib/tmdb';

interface ContentRowProps {
  title: string;
  items: MediaItem[];
}

export const ContentRow = ({ title, items }: ContentRowProps) => {
  if (!items.length) return null;
  return (
    <section className="mb-8">
      <h2 className="mb-3 px-4 text-lg font-bold sm:px-6">{title}</h2>
      <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-2 sm:px-6">
        {items.map((item) => (
          <PosterCard key={`${item.media_type}-${item.id}`} item={item} />
        ))}
      </div>
    </section>
  );
};
