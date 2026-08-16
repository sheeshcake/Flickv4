export interface FloatingReaction {
  id: string;
  from: string;
  emoji: string;
  leftPct: number;
}

interface ReactionOverlayProps {
  items: FloatingReaction[];
  onExpire: (id: string) => void;
}

export const ReactionOverlay = ({ items, onExpire }: ReactionOverlayProps) => {
  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {items.map((item) => (
        <div
          key={item.id}
          className="party-reaction absolute bottom-[18%] flex flex-col items-center"
          style={{ left: `${item.leftPct}%` }}
          onAnimationEnd={() => onExpire(item.id)}
        >
          <span className="text-4xl leading-none">{item.emoji}</span>
          <span className="mt-1 text-xs text-foreground">{item.from}</span>
        </div>
      ))}
    </div>
  );
};
