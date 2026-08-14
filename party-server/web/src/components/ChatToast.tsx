import type { ChatLine } from '@/components/ChatSheet';

interface ChatToastProps {
  line: ChatLine | null;
  onOpen: () => void;
}

export const ChatToast = ({ line, onOpen }: ChatToastProps) => {
  if (!line) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="absolute right-4 bottom-16 z-20 max-w-xs rounded-lg border border-border bg-card/95 px-3 py-2 text-left shadow-lg backdrop-blur-sm"
    >
      <p className="text-xs font-semibold text-primary">{line.from}</p>
      <p className="line-clamp-2 text-sm">{line.text}</p>
    </button>
  );
};
