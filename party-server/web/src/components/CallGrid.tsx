import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { PartyRtcRemote } from '@/hooks/usePartyRtc';
import { Button } from '@/components/ui/button';

const SPEAK_HOLD_MS = 1000;
const SPEAK_THRESHOLD = 0.04;

const Tile = memo(function Tile({
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
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    el.muted = Boolean(muted);
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    if (stream && el.paused) void el.play().catch(() => {});
  }, [muted, stream]);

  useEffect(() => {
    const el = videoRef.current;
    return () => {
      if (el) el.srcObject = null;
    };
  }, []);

  const showVideo = Boolean(stream) && !placeholder;

  return (
    <div
      className={`relative h-28 w-20 overflow-hidden rounded-md border bg-card ${
        speaking ? 'border-primary' : 'border-border'
      }`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={`h-full w-full object-cover ${mirror ? 'scale-x-[-1]' : ''} ${
          showVideo ? '' : 'invisible'
        }`}
      />
      {showVideo ? null : (
        <div className="absolute inset-0 flex items-center justify-center bg-muted text-xs text-muted-foreground">
          {label.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-background/70 px-1 py-0.5 text-[10px] text-foreground">
        {label}
      </div>
    </div>
  );
});

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

export const CallGrid = memo(function CallGrid({
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
}) {
  const [speakerId, setSpeakerId] = useState<string | null>(null);
  const speakerUntilRef = useRef(0);
  const remotesRef = useRef(remotes);
  remotesRef.current = remotes;

  const remoteAudioKey = useMemo(
    () =>
      remotes
        .map((r) =>
          `${r.id}:${r.stream.id}:${r.stream
            .getAudioTracks()
            .map((t) => t.id)
            .join(',')}`,
        )
        .join('|'),
    [remotes],
  );

  useEffect(() => {
    if (hidden || remotesRef.current.length === 0) {
      setSpeakerId(null);
      speakerUntilRef.current = 0;
      return;
    }
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    const nodes: {
      id: string;
      analyser: AnalyserNode;
      buffer: Uint8Array<ArrayBuffer>;
    }[] = [];
    for (const remote of remotesRef.current) {
      if (remote.stream.getAudioTracks().length === 0) continue;
      try {
        const source = ctx.createMediaStreamSource(remote.stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        nodes.push({
          id: remote.id,
          analyser,
          buffer: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
        });
      } catch {
        // Video-only or muted streams cannot feed an AnalyserNode.
      }
    }
    void ctx.resume();
    const timer = window.setInterval(() => {
      let loudestId: string | null = null;
      let loudest = 0;
      for (const node of nodes) {
        const level = rmsFromAnalyser(node.analyser, node.buffer);
        if (level > loudest) {
          loudest = level;
          loudestId = node.id;
        }
      }
      const now = Date.now();
      if (loudestId && loudest >= SPEAK_THRESHOLD) {
        speakerUntilRef.current = now + SPEAK_HOLD_MS;
        setSpeakerId((prev) => (prev === loudestId ? prev : loudestId));
      } else if (now > speakerUntilRef.current) {
        setSpeakerId((prev) => (prev === null ? prev : null));
      }
    }, 250);
    return () => {
      window.clearInterval(timer);
      void ctx?.close();
    };
  }, [hidden, remoteAudioKey]);

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
          {remotes.map((remote) => (
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
});
