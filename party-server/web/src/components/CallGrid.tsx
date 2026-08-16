import { useEffect, useRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { PartyRtcRemote } from '@/hooks/usePartyRtc';
import { Button } from '@/components/ui/button';

const Tile = ({
  stream,
  label,
  muted,
  mirror,
  placeholder,
}: {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  mirror?: boolean;
  placeholder?: boolean;
}) => {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream && !placeholder ? stream : null;
  }, [stream, placeholder]);

  return (
    <div className="relative h-28 w-20 overflow-hidden rounded-md border border-border bg-card">
      {stream && !placeholder ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={muted}
          className={`h-full w-full object-cover ${mirror ? 'scale-x-[-1]' : ''}`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
          {label.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-background/70 px-1 py-0.5 text-[10px] text-foreground">
        {label}
      </div>
    </div>
  );
};

export const CallGrid = ({
  localStream,
  remotes,
  camOff,
  hidden,
  onToggleHidden,
}: {
  localStream: MediaStream | null;
  remotes: PartyRtcRemote[];
  camOff: boolean;
  hidden: boolean;
  onToggleHidden: () => void;
}) => {
  if (!localStream && remotes.length === 0) return null;

  return (
    <div className="absolute top-16 right-3 z-20 flex flex-col items-end gap-2">
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="size-9"
        onClick={onToggleHidden}
        aria-label={hidden ? 'Show cameras' : 'Hide cameras'}
      >
        {hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </Button>
      {hidden ? null : (
        <>
          {localStream ? (
            <Tile
              stream={localStream}
              label="You"
              muted
              mirror
              placeholder={camOff}
            />
          ) : null}
          {remotes.map((remote) => (
            <Tile key={remote.id} stream={remote.stream} label={remote.name} />
          ))}
        </>
      )}
    </div>
  );
};
