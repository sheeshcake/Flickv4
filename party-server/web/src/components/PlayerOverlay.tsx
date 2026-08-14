import { ArrowLeft, Maximize, MessageCircle, Minimize, Pause, Play, RotateCcw, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatTime } from '@/lib/party';
import { cn } from '@/lib/utils';
import logo from '@/assets/logo.png';

interface PlayerOverlayProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  playing: boolean;
  currentTime: number;
  duration: number;
  fullscreen: boolean;
  partyCode: string;
  onToggleOverlay: () => void;
  onInteract: () => void;
  onBack: () => void;
  onTogglePlay: () => void;
  onSeekBy: (seconds: number) => void;
  onScrubEnd: (fraction: number) => void;
  onOpenMembers: () => void;
  onOpenChat: () => void;
  onToggleFullscreen: () => void;
}

export const PlayerOverlay = ({
  visible,
  title,
  subtitle,
  playing,
  currentTime,
  duration,
  fullscreen,
  partyCode,
  onToggleOverlay,
  onInteract,
  onBack,
  onTogglePlay,
  onSeekBy,
  onScrubEnd,
  onOpenMembers,
  onOpenChat,
  onToggleFullscreen,
}: PlayerOverlayProps) => {
  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div
      className={cn(
        'absolute inset-0 z-10 flex flex-col justify-between transition-opacity',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <button
        type="button"
        className="absolute inset-0 bg-linear-to-b from-black/70 via-transparent to-black/80"
        aria-label="Hide controls"
        onClick={onToggleOverlay}
      />

      <div className="relative z-10 flex items-center gap-3 px-6 pt-5">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="size-10"
          onClick={() => {
            onInteract();
            onBack();
          }}
          aria-label="Leave"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <img src={logo} alt="Flick" className="h-8 w-auto shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold">{title}</h2>
          {subtitle ? (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <Button
          type="button"
          size="chip"
          onClick={() => {
            onInteract();
            onOpenMembers();
          }}
        >
          {partyCode}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="size-10"
          onClick={() => {
            onInteract();
            onOpenChat();
          }}
          aria-label="Chat"
        >
          <MessageCircle className="size-5" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="size-10"
          onClick={() => {
            onInteract();
            onToggleFullscreen();
          }}
          aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
        </Button>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center gap-10">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={() => {
            onInteract();
            onSeekBy(-10);
          }}
          aria-label="Back 10 seconds"
        >
          <RotateCcw className="size-7" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="size-16"
          onClick={() => {
            onInteract();
            onTogglePlay();
          }}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause className="size-8" /> : <Play className="size-8" />}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={() => {
            onInteract();
            onSeekBy(10);
          }}
          aria-label="Forward 10 seconds"
        >
          <RotateCw className="size-7" />
        </Button>
      </div>

      <div className="relative z-10 px-8 pb-4">
        <button
          type="button"
          className="block h-1.5 w-full rounded-full bg-white/20"
          aria-label="Seek"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
            onInteract();
            onScrubEnd(frac);
          }}
        >
          <span
            className="block h-full rounded-full bg-primary"
            style={{ width: `${progress * 100}%` }}
          />
        </button>
        <div className="mt-1.5 flex justify-between text-xs">
          <span>{formatTime(currentTime)}</span>
          <span className="text-muted-foreground">{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
};
