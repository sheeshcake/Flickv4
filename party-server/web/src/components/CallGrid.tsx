import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { PartyRtcRemote } from '@/hooks/usePartyRtc';
import { Button } from '@/components/ui/button';

const SPEAK_HOLD_MS = 1000;
const SPEAK_THRESHOLD = 0.04;

const Tile = ({
  stream,
  label,
  muted,
  mirror,
  placeholder,
  speaking,
}: {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  mirror?: boolean;
  placeholder?: boolean;
  speaking?: boolean;
}) => {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream && !placeholder ? stream : null;
  }, [stream, placeholder]);

  return (
    <div
      className={`relative h-28 w-20 overflow-hidden rounded-md border bg-card ${
        speaking ? 'border-primary' : 'border-border'
      }`}
    >
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

const rmsFromAnalyser = (
  analyser: AnalyserNode,
  buffer: Uint8Array<ArrayBuffer>,
): number => {
  analyser.getByteTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const v = (buffer[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buffer.length);
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
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [speakerId, setSpeakerId] = useState<string | null>(null);
  const speakerUntilRef = useRef(0);

  useEffect(() => {
    if (hidden || remotes.length === 0) {
      setLevels({});
      setSpeakerId(null);
      speakerUntilRef.current = 0;
      return;
    }
    const ctx = new AudioContext();
    const nodes = remotes.map((remote) => {
      const source = ctx.createMediaStreamSource(remote.stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      return {
        id: remote.id,
        analyser,
        buffer: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
      };
    });
    void ctx.resume();
    const timer = window.setInterval(() => {
      const next: Record<string, number> = {};
      let loudestId: string | null = null;
      let loudest = 0;
      for (const node of nodes) {
        const level = rmsFromAnalyser(node.analyser, node.buffer);
        next[node.id] = level;
        if (level > loudest) {
          loudest = level;
          loudestId = node.id;
        }
      }
      setLevels(next);
      const now = Date.now();
      if (loudestId && loudest >= SPEAK_THRESHOLD) {
        setSpeakerId(loudestId);
        speakerUntilRef.current = now + SPEAK_HOLD_MS;
      } else if (now > speakerUntilRef.current) {
        setSpeakerId(null);
      }
    }, 250);
    return () => {
      window.clearInterval(timer);
      void ctx.close();
    };
  }, [hidden, remotes]);

  const sortedRemotes = useMemo(() => {
    return [...remotes].sort((a, b) => {
      const aLevel = levels[a.id] ?? 0;
      const bLevel = levels[b.id] ?? 0;
      if (a.id === speakerId) return -1;
      if (b.id === speakerId) return 1;
      return bLevel - aLevel;
    });
  }, [levels, remotes, speakerId]);

  if (!localStream && remotes.length === 0) return null;

  return (
    <div className="pointer-events-none absolute top-16 right-3 z-20 flex max-h-[min(60vh,22rem)] flex-col items-end gap-2">
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="pointer-events-auto size-9 shrink-0"
        onClick={onToggleHidden}
        aria-label={hidden ? 'Show cameras' : 'Hide cameras'}
      >
        {hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </Button>
      {hidden ? null : (
        <div className="pointer-events-auto flex min-h-0 flex-1 flex-col items-end gap-2 overflow-y-auto pr-0.5">
          {localStream ? (
            <Tile
              stream={localStream}
              label="You"
              muted
              mirror
              placeholder={camOff}
            />
          ) : null}
          {sortedRemotes.map((remote) => (
            <Tile
              key={remote.id}
              stream={remote.stream}
              label={remote.name}
              speaking={remote.id === speakerId}
            />
          ))}
        </div>
      )}
    </div>
  );
};
