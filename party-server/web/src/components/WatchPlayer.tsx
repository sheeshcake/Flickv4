import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { ChatSheet, type ChatLine } from '@/components/ChatSheet';
import { ChatToast } from '@/components/ChatToast';
import { JoinGate } from '@/components/JoinGate';
import { MembersSheet } from '@/components/MembersSheet';
import { PlayerOverlay } from '@/components/PlayerOverlay';
import { useOverlayVisibility } from '@/hooks/useOverlayVisibility';
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
  const [membersOpen, setMembersOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [toast, setToast] = useState<ChatLine | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [duration, setDuration] = useState(0);
  const [videoTime, setVideoTime] = useState(0);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [cues, setCues] = useState<Cue[]>([]);
  const [subOffset, setSubOffset] = useState(0);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [sheetHost, setSheetHost] = useState<HTMLElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const modeRef = useRef<Mode>('none');
  const lastSourceKey = useRef('');
  const failedSourceKey = useRef('');
  const lastSubUrl = useRef('');
  const lastWebKey = useRef('');
  const webResolvedRef = useRef(false);
  const roomRef = useRef<PartyRoom | null>(null);
  const clockRef = useRef(clock);
  const seekingRef = useRef(false);

  const overlay = useOverlayVisibility(!clock.paused, membersOpen || chatOpen);

  roomRef.current = room;
  clockRef.current = clock;
  modeRef.current = mode;

  const setStage = useCallback((el: HTMLDivElement | null) => {
    stageRef.current = el;
    setSheetHost(el);
  }, []);

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

  const playFollowingHost = useCallback(async () => {
    const video = videoRef.current;
    if (!video || clockRef.current.paused) return;
    if (!video.paused) return;
    try {
      video.muted = true;
      await video.play();
      video.muted = false;
    } catch {
      try {
        video.muted = true;
        await video.play();
      } catch {
        // Next clock tick or tap retries.
      }
    }
  }, []);

  const applyClock = useCallback(() => {
    const video = videoRef.current;
    if (modeRef.current !== 'video' || !video) return;
    const target = predicted();
    if (clockRef.current.paused) {
      if (!video.paused) video.pause();
    } else if (!seekingRef.current) {
      void playFollowingHost();
    }
    if (
      !seekingRef.current &&
      Number.isFinite(video.currentTime) &&
      Number.isFinite(target) &&
      Math.abs(video.currentTime - target) > 1.5
    ) {
      seekingRef.current = true;
      video.currentTime = target;
      window.setTimeout(() => {
        seekingRef.current = false;
      }, 2500);
    }
  }, [playFollowingHost, predicted]);

  const loadSource = useCallback(
    (
      source: PartySource | null | undefined,
      embedUrl: string | null | undefined,
      opts?: { direct?: boolean },
    ) => {
      const current = roomRef.current;
      if (!source?.uri || !current) {
        lastSourceKey.current = '';
        failedSourceKey.current = '';
        showWaiting('Waiting for the host’s stream…');
        return;
      }
      const key = `${opts?.direct ? 'direct' : 'proxy'}|${source.kind}|${source.uri}`;
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
          modeRef.current = 'iframe';
          setIframeUrl(embedUrl);
          setCues([]);
          send({ type: 'buffering', buffering: false });
        } else {
          showWaiting('Stream blocked in this browser — Open in Flick.');
          setRoomError('This CDN blocked the stream in the browser.');
        }
      };
      const playUrl = opts?.direct
        ? source.uri
        : mediaProxyUrl(current.code, source.uri);
      video.onerror = onFail;
      const isHls = source.kind === 'hls' || /\.m3u8(\?|#|$)/i.test(source.uri);
      if (isHls && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        hls.loadSource(playUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setMode('video');
          modeRef.current = 'video';
          applyClock();
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data?.fatal) onFail();
        });
      } else {
        video.src = playUrl;
        setMode('video');
        modeRef.current = 'video';
      }
      video.onloadedmetadata = () => {
        setDuration(video.duration || 0);
        applyClock();
      };
    },
    [applyClock, send, showWaiting],
  );

  const playIframe = (url: string) => {
    lastSourceKey.current = '';
    destroyHls();
    setCues([]);
    setMode('iframe');
    modeRef.current = 'iframe';
    setIframeUrl(url);
  };

  const playRoom = useCallback(
    async (current: PartyRoom) => {
      const vkey = `${current.content.tmdbId}|${current.content.imdbId ?? ''}|${current.content.season ?? ''}|${current.content.episode ?? ''}`;
      if (lastWebKey.current === vkey) {
        if (modeRef.current !== 'iframe' && !webResolvedRef.current) {
          loadSource(current.source, current.embedUrl);
        }
        return;
      }
      try {
        const res = await fetch(`/moviebox/${current.code}`);
        if (res.ok) {
          const data = (await res.json()) as {
            url?: string;
            kind?: 'hls' | 'file';
            playerUrl?: string;
          };
          if (data.url) {
            lastWebKey.current = vkey;
            webResolvedRef.current = true;
            loadSource(
              { uri: data.url, kind: data.kind === 'hls' ? 'hls' : 'file' },
              data.playerUrl || current.embedUrl,
              { direct: true },
            );
            return;
          }
          if (data.playerUrl) {
            lastWebKey.current = vkey;
            webResolvedRef.current = true;
            playIframe(data.playerUrl);
            return;
          }
        }
      } catch {
        // Moviebox down — try Videasy, then the host proxy.
      }
      try {
        const res = await fetch(`/videasy/${current.code}`);
        if (res.ok) {
          const data = (await res.json()) as { url?: string };
          if (data.url) {
            lastWebKey.current = vkey;
            webResolvedRef.current = true;
            playIframe(data.url);
            return;
          }
        }
      } catch {
        // Videasy down or missing — use the host proxy.
      }
      lastWebKey.current = vkey;
      webResolvedRef.current = false;
      loadSource(current.source, current.embedUrl);
    },
    [loadSource],
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
          if (modeRef.current !== 'iframe' && !webResolvedRef.current) {
            loadSource(msg.source, msg.embedUrl);
          }
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
          lastWebKey.current = '';
          webResolvedRef.current = false;
          setCues([]);
          if (roomRef.current) {
            roomRef.current = {
              ...roomRef.current,
              content: {
                ...roomRef.current.content,
                season: msg.season,
                episode: msg.episode,
              },
              source: null,
              embedUrl: null,
            };
            setRoom(roomRef.current);
          }
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
    [applyClock, loadSource, loadSubtitles, playRoom, showWaiting],
  );

  // <video> only mounts after `room` is set. Moviebox file first, then
  // Videasy, then the host proxy.
  useEffect(() => {
    if (!room) return;
    void playRoom(room);
    void loadSubtitles(room.subtitles);
  }, [room, playRoom, loadSubtitles]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
      const video = videoRef.current;
      if (video && modeRef.current === 'video') {
        setVideoTime(video.currentTime || 0);
        setDuration(video.duration || 0);
        applyClock();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [applyClock]);

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

  const prevChatLen = useRef(0);
  useEffect(() => {
    if (chatOpen) {
      setToast(null);
      prevChatLen.current = chat.length;
      return;
    }
    if (chat.length <= prevChatLen.current) {
      prevChatLen.current = chat.length;
      return;
    }
    prevChatLen.current = chat.length;
    const line = chat[chat.length - 1];
    if (!line) return;
    setToast(line);
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [chat, chatOpen]);

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
        ref={setStage}
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
          onSeeked={() => {
            seekingRef.current = false;
            if (!clockRef.current.paused) void playFollowingHost();
          }}
          onPlaying={() => {
            const video = videoRef.current;
            if (video) video.muted = false;
          }}
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
        {!overlay.visible ? (
          <button
            type="button"
            className="absolute inset-0 z-5"
            aria-label="Show controls"
            onClick={overlay.show}
          />
        ) : null}
        <PlayerOverlay
          visible={overlay.visible}
          title={room.content.title || 'Watch party'}
          subtitle={subtitle}
          playing={!clock.paused}
          currentTime={t}
          duration={duration}
          fullscreen={fullscreen}
          partyCode={room.code}
          onToggleOverlay={overlay.toggle}
          onInteract={overlay.show}
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
          onOpenMembers={() => setMembersOpen(true)}
          onOpenChat={() => setChatOpen(true)}
          onToggleFullscreen={toggleFullscreen}
        />
        <ChatToast line={toast} onOpen={() => setChatOpen(true)} />
        <MembersSheet
          open={membersOpen}
          onOpenChange={setMembersOpen}
          container={sheetHost}
          code={room.code}
          members={room.members}
          onLeave={() => {
            send({ type: 'leave' });
            location.href = '/';
          }}
        />
        <ChatSheet
          open={chatOpen}
          onOpenChange={setChatOpen}
          container={sheetHost}
          chat={chat}
          onSend={(text) => send({ type: 'chat', text })}
        />
      </div>
      {roomError ? (
        <p className="px-4 py-2 text-sm text-destructive">{roomError}</p>
      ) : null}
    </div>
  );
};
