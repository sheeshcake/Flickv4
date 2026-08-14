import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { JoinGate } from '@/components/JoinGate';
import { PartySheet } from '@/components/PartySheet';
import { PlayerOverlay } from '@/components/PlayerOverlay';
import {
  codeFromPath,
  mediaProxyUrl,
  predictedHostTime,
  type PartyClock,
  type PartyRoom,
  type PartySource,
  type PartySubtitles,
  type ServerMessage,
} from '@/lib/party';
import { cueAt, parseSubtitleText, type Cue } from '@/lib/subtitles';

type Mode = 'none' | 'video' | 'iframe';

export const WatchPlayer = () => {
  const [gateError, setGateError] = useState('');
  const [roomError, setRoomError] = useState('');
  const [room, setRoom] = useState<PartyRoom | null>(null);
  const [clock, setClock] = useState<PartyClock>({
    positionSeconds: 0,
    paused: true,
    updatedAt: Date.now(),
  });
  const [mode, setMode] = useState<Mode>('none');
  const [waiting, setWaiting] = useState('Waiting for the host’s stream…');
  const [overlayOn, setOverlayOn] = useState(true);
  const [partyOpen, setPartyOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [duration, setDuration] = useState(0);
  const [videoTime, setVideoTime] = useState(0);
  const [chat, setChat] = useState<{ from: string; text: string }[]>([]);
  const [cues, setCues] = useState<Cue[]>([]);
  const [subOffset, setSubOffset] = useState(0);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const modeRef = useRef<Mode>('none');
  const lastSourceKey = useRef('');
  const failedSourceKey = useRef('');
  const lastSubUrl = useRef('');
  const roomRef = useRef<PartyRoom | null>(null);
  const clockRef = useRef(clock);

  roomRef.current = room;
  clockRef.current = clock;
  modeRef.current = mode;

  const send = useCallback((obj: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  }, []);

  const predicted = useCallback(
    () => predictedHostTime(clockRef.current),
    [],
  );

  const destroyHls = () => {
    hlsRef.current?.destroy();
    hlsRef.current = null;
  };

  const showWaiting = useCallback(
    (text: string) => {
      setWaiting(text);
      setMode('none');
      setIframeUrl(null);
      destroyHls();
      send({ type: 'buffering', buffering: false });
    },
    [send],
  );

  const applyClock = useCallback(() => {
    const video = videoRef.current;
    if (modeRef.current !== 'video' || !video) return;
    const target = predicted();
    if (clockRef.current.paused) {
      if (!video.paused) video.pause();
    } else if (video.paused) {
      void video.play().catch(() => {});
    }
    if (Number.isFinite(video.currentTime) && Math.abs(video.currentTime - target) > 1.5) {
      video.currentTime = target;
    }
  }, [predicted]);

  const loadSource = useCallback(
    (source: PartySource | null | undefined, embedUrl: string | null | undefined) => {
      const current = roomRef.current;
      if (!source?.uri || !current) {
        lastSourceKey.current = '';
        failedSourceKey.current = '';
        showWaiting('Waiting for the host’s stream…');
        return;
      }
      const key = `${source.kind}|${source.uri}`;
      if (key === lastSourceKey.current && modeRef.current === 'video') {
        applyClock();
        return;
      }
      if (key === failedSourceKey.current && modeRef.current === 'iframe') return;

      const video = videoRef.current;
      // Join sets room before <video> exists — retry from the mount effect.
      if (!video) return;

      lastSourceKey.current = key;
      destroyHls();
      setIframeUrl(null);

      const onFail = () => {
        failedSourceKey.current = key;
        if (embedUrl) {
          destroyHls();
          video.removeAttribute('src');
          video.load();
          setMode('iframe');
          setIframeUrl(embedUrl);
          setCues([]);
          send({ type: 'buffering', buffering: false });
        } else {
          showWaiting('Stream blocked in this browser — Open in Flick.');
          setRoomError('This CDN blocked the proxy (Referer still 403, or IP-locked).');
        }
      };
      const playUrl = mediaProxyUrl(current.code, source.uri);
      video.onerror = onFail;
      const isHls = source.kind === 'hls' || /\.m3u8(\?|#|$)/i.test(source.uri);
      if (isHls && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        hls.loadSource(playUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setMode('video');
          applyClock();
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data?.fatal) onFail();
        });
      } else {
        video.src = playUrl;
        setMode('video');
      }
      video.onloadedmetadata = () => {
        setDuration(video.duration || 0);
        applyClock();
      };
    },
    [applyClock, send, showWaiting],
  );

  const loadSubtitles = useCallback(async (sub: PartySubtitles | null | undefined) => {
    if (!sub?.url || modeRef.current === 'iframe') {
      lastSubUrl.current = '';
      setCues([]);
      setSubOffset(0);
      return;
    }
    const offset = Number(sub.offsetSeconds);
    setSubOffset(Number.isFinite(offset) ? offset : 0);
    if (sub.url === lastSubUrl.current) return;
    lastSubUrl.current = sub.url;
    setCues([]);
    const code = roomRef.current?.code;
    const tryUrls = [sub.url, code ? `/subtitle/${code}` : ''].filter(Boolean);
    for (const href of tryUrls) {
      try {
        const res = await fetch(href);
        if (!res.ok) continue;
        setCues(parseSubtitleText(await res.text()));
        return;
      } catch {
        // CORS — try party-server caption fetch
      }
    }
  }, []);

  const connect = useCallback(
    (code: string, name: string) => {
      if (code.length < 4) {
        setGateError('Enter a room code from Flick.');
        return;
      }
      setGateError('');
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}`);
      wsRef.current = ws;
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'join',
            code,
            displayName: name || 'Web',
            kind: 'companion',
          }),
        );
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as ServerMessage;
        if (msg.type === 'error') {
          if (roomRef.current) setRoomError(msg.message);
          else setGateError(msg.message);
          return;
        }
        if (msg.type === 'joined') {
          roomRef.current = msg.room;
          setRoom(msg.room);
          setClock(msg.room.clock);
          return;
        }
        if (msg.type === 'state') {
          roomRef.current = msg.room;
          setRoom(msg.room);
          setClock(msg.room.clock);
          return;
        }
        if (msg.type === 'clock') {
          setClock(msg.clock);
          clockRef.current = msg.clock;
          applyClock();
          return;
        }
        if (msg.type === 'source') {
          if (roomRef.current) {
            roomRef.current = {
              ...roomRef.current,
              source: msg.source,
              embedUrl: msg.embedUrl,
            };
            setRoom(roomRef.current);
          }
          loadSource(msg.source, msg.embedUrl);
          return;
        }
        if (msg.type === 'subtitles') {
          if (roomRef.current) {
            roomRef.current = { ...roomRef.current, subtitles: msg.subtitles };
            setRoom(roomRef.current);
          }
          void loadSubtitles(msg.subtitles);
          return;
        }
        if (msg.type === 'episode') {
          lastSourceKey.current = '';
          failedSourceKey.current = '';
          lastSubUrl.current = '';
          setCues([]);
          showWaiting('Host switched episode — waiting for stream…');
          return;
        }
        if (msg.type === 'chat') {
          setChat((prev) => [...prev, { from: msg.from, text: msg.text }]);
          return;
        }
        if (msg.type === 'ended') {
          setRoomError(msg.reason || 'Room ended');
          showWaiting(msg.reason || 'Room ended');
        }
      };
      ws.onerror = () => {
        setGateError('Could not connect to the party server.');
      };
    },
    [applyClock, loadSource, loadSubtitles, showWaiting],
  );

  // <video> only mounts after `room` is set. Load the host stream then.
  useEffect(() => {
    if (!room) return;
    loadSource(room.source, room.embedUrl);
    void loadSubtitles(room.subtitles);
  }, [room, loadSource, loadSubtitles]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
      const video = videoRef.current;
      if (video && modeRef.current === 'video') {
        setVideoTime(video.currentTime || 0);
        setDuration(video.duration || 0);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onFs = () => {
      const el = document.fullscreenElement ?? document.webkitFullscreenElement;
      setFullscreen(el === stageRef.current);
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
    };
  }, []);

  useEffect(() => {
    return () => {
      destroyHls();
      wsRef.current?.close();
    };
  }, []);

  const toggleFullscreen = () => {
    const stage = stageRef.current;
    const video = videoRef.current;
    const current = document.fullscreenElement ?? document.webkitFullscreenElement;
    if (current) {
      const exit = document.exitFullscreen ?? document.webkitExitFullscreen;
      void exit?.call(document);
      return;
    }
    const req = stage?.requestFullscreen ?? stage?.webkitRequestFullscreen;
    if (req && stage) {
      try {
        const p = req.call(stage);
        if (p && typeof p.catch === 'function') void p.catch(() => {});
      } catch {
        // ignore
      }
      return;
    }
    video?.webkitEnterFullscreen?.();
  };

  if (!room) {
    return (
      <JoinGate
        initialCode={codeFromPath(location.pathname)}
        error={gateError}
        onJoin={connect}
      />
    );
  }

  const t = mode === 'video' ? videoTime : predictedHostTime(clock, now);
  const offset = Number.isFinite(Number(room.subtitles?.offsetSeconds))
    ? Number(room.subtitles?.offsetSeconds)
    : subOffset;
  const cue = mode === 'video' ? cueAt(cues, t - offset) : null;
  const ep =
    room.content.mediaType === 'tv' && room.content.season != null
      ? `S${room.content.season} E${room.content.episode}`
      : undefined;
  const cap =
    room.subtitles && offset
      ? `${room.subtitles.display} ${offset > 0 ? '+' : ''}${offset}s`
      : room.subtitles?.display;
  const subtitle = [ep, cap, clock.paused ? 'Paused' : 'Playing', 'Following host']
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div
        ref={stageRef}
        className="relative mx-auto aspect-video w-full max-w-[1400px] overflow-hidden bg-black md:mt-0 md:h-screen md:max-w-none md:aspect-auto"
      >
        {mode === 'none' ? (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-muted-foreground">
            {waiting}
          </div>
        ) : null}
        <video
          ref={videoRef}
          className={mode === 'video' ? 'absolute inset-0 h-full w-full bg-black' : 'hidden'}
          playsInline
          onWaiting={() => send({ type: 'buffering', buffering: true })}
          onPlaying={() => send({ type: 'buffering', buffering: false })}
          onCanPlay={() => send({ type: 'buffering', buffering: false })}
        />
        {mode === 'iframe' && iframeUrl ? (
          <iframe
            title="Embed player"
            src={iframeUrl}
            allow="autoplay; fullscreen"
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : null}
        {cue ? (
          <div className="pointer-events-none absolute right-[8%] bottom-[18%] left-[8%] text-center text-lg font-bold whitespace-pre-wrap text-white [text-shadow:0_1px_4px_#000]">
            {cue.text}
          </div>
        ) : null}
        <PlayerOverlay
          visible={overlayOn}
          title={room.content.title || 'Watch party'}
          subtitle={subtitle}
          playing={!clock.paused}
          currentTime={t}
          duration={duration}
          fullscreen={fullscreen}
          partyCode={room.code}
          onToggleOverlay={() => setOverlayOn((v) => !v)}
          onBack={() => {
            send({ type: 'leave' });
            location.href = '/';
          }}
          onTogglePlay={() =>
            send({ type: 'control', action: clock.paused ? 'play' : 'pause' })
          }
          onSeekBy={(seconds) =>
            send({
              type: 'control',
              action: 'seek',
              positionSeconds: Math.max(0, predicted() + seconds),
            })
          }
          onScrubEnd={(frac) => {
            if (!duration) return;
            send({
              type: 'control',
              action: 'seek',
              positionSeconds: frac * duration,
            });
          }}
          onOpenParty={() => setPartyOpen(true)}
          onToggleFullscreen={toggleFullscreen}
        />
      </div>
      {roomError ? (
        <p className="px-4 py-2 text-sm text-destructive">{roomError}</p>
      ) : null}
      <PartySheet
        open={partyOpen}
        onOpenChange={setPartyOpen}
        code={room.code}
        members={room.members}
        chat={chat}
        onSend={(text) => send({ type: 'chat', text })}
        onLeave={() => {
          send({ type: 'leave' });
          location.href = '/';
        }}
      />
    </div>
  );
};
