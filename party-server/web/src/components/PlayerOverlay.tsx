import { ArrowLeft, Eye, EyeOff, Maximize, MessageCircle, Mic, MicOff, Minimize, Pause, Play, RotateCcw, RotateCw, Settings, SmilePlus, Video, VideoOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatTime, PARTY_REACTIONS } from '@/lib/party';
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
  onOpenSettings: () => void;
  onToggleReactions: () => void;
  reactionsOpen: boolean;
  onSelectReaction: (emoji: string) => void;
  onToggleFullscreen: () => void;
  inCall: boolean;
  muted: boolean;
  camOff: boolean;
  onToggleCall: () => void;
  onToggleMute: () => void;
  onToggleCam: () => void;
  tilesHidden: boolean;
  onToggleTilesHidden: () => void;
}

const seekFraction = (el: HTMLElement, clientX: number) => {
  const rect = el.getBoundingClientRect();
  return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
};

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
  onOpenSettings,
  onToggleReactions,
  reactionsOpen,
  onSelectReaction,
  onToggleFullscreen,
  inCall,
  muted,
  camOff,
  onToggleCall,
  onToggleMute,
  onToggleCam,
  tilesHidden,
  onToggleTilesHidden,
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

      <div className="relative z-10 flex flex-wrap items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))] sm:gap-3 sm:px-6 sm:pt-5">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="size-11"
          onClick={() => {
            onInteract();
            onBack();
          }}
          aria-label="Leave"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <img src={logo} alt="Flick" className="hidden h-8 w-auto shrink-0 sm:block" />
        <div className="min-w-0 flex-1 basis-32">
          <h2 className="truncate text-base font-bold sm:text-lg">{title}</h2>
          {subtitle ? (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="chip"
            className="h-11 min-w-11 px-3"
            onClick={() => {
              onInteract();
              onOpenMembers();
            }}
          >
            {partyCode}
          </Button>
          <Button
            type="button"
            variant={inCall ? 'default' : 'secondary'}
            size="icon"
            className="size-11"
            onClick={() => {
              onInteract();
              onToggleCall();
            }}
            aria-label={inCall ? 'Leave camera' : 'Join camera'}
          >
            {inCall ? <VideoOff className="size-5" /> : <Video className="size-5" />}
          </Button>
          {inCall ? (
            <>
              <Button
                type="button"
                variant={muted ? 'default' : 'secondary'}
                size="icon"
                className="size-11"
                onClick={() => {
                  onInteract();
                  onToggleMute();
                }}
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
              </Button>
              <Button
                type="button"
                variant={camOff ? 'default' : 'secondary'}
                size="icon"
                className="size-11"
                onClick={() => {
                  onInteract();
                  onToggleCam();
                }}
                aria-label={camOff ? 'Camera on' : 'Camera off'}
              >
                {camOff ? <VideoOff className="size-5" /> : <Video className="size-5" />}
              </Button>
              <Button
                type="button"
                variant={tilesHidden ? 'default' : 'secondary'}
                size="icon"
                className="size-11"
                onClick={() => {
                  onInteract();
                  onToggleTilesHidden();
                }}
                aria-label={tilesHidden ? 'Show cameras' : 'Hide cameras'}
              >
                {tilesHidden ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="size-11"
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
            className="size-11"
            onClick={() => {
              onInteract();
              onOpenSettings();
            }}
            aria-label="Settings"
          >
            <Settings className="size-5" />
          </Button>
          <Button
            type="button"
            variant={reactionsOpen ? 'default' : 'secondary'}
            size="icon"
            className="size-11"
            onClick={() => {
              onInteract();
              onToggleReactions();
            }}
            aria-label="Reactions"
            aria-expanded={reactionsOpen}
          >
            <SmilePlus className="size-5" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="size-11"
            onClick={() => {
              onInteract();
              onToggleFullscreen();
            }}
            aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
          </Button>
        </div>
      </div>

      {reactionsOpen ? (
        <div className="absolute top-20 right-3 z-20 rounded-xl border border-border bg-card/95 p-2 sm:right-6">
          <div className="grid grid-cols-4 gap-1">
            {PARTY_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="flex size-11 items-center justify-center rounded-full text-2xl hover:bg-primary/20"
                onClick={() => {
                  onInteract();
                  onSelectReaction(emoji);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="relative z-10 flex flex-1 items-center justify-center gap-8 sm:gap-10">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="size-12"
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
          className="size-12"
          onClick={() => {
            onInteract();
            onSeekBy(10);
          }}
          aria-label="Forward 10 seconds"
        >
          <RotateCw className="size-7" />
        </Button>
      </div>

      <div className="relative z-10 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8 sm:pb-4">
        <button
          type="button"
          className="flex h-8 w-full items-center"
          aria-label="Seek"
          onPointerUp={(e) => {
            const frac = seekFraction(e.currentTarget, e.clientX);
            onInteract();
            onScrubEnd(frac);
          }}
        >
          <span className="block h-1.5 w-full rounded-full bg-white/20">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${progress * 100}%` }}
            />
          </span>
        </button>
        <div className="mt-0.5 flex justify-between text-xs">
          <span>{formatTime(currentTime)}</span>
          <span className="text-muted-foreground">{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
};
