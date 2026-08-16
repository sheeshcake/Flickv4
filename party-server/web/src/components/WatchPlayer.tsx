import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { ChatSheet, type ChatLine } from '@/components/ChatSheet';
import { ChatToast } from '@/components/ChatToast';
import { JoinGate } from '@/components/JoinGate';
import { MembersSheet } from '@/components/MembersSheet';
import { PlayerOverlay } from '@/components/PlayerOverlay';
import {
  SettingsSheet,
  type AudioOption,
  type StreamflixWebSource,
  type SubtitleOption,
} from '@/components/SettingsSheet';
import {
  ReactionOverlay,
  type FloatingReaction,
} from '@/components/ReactionOverlay';
import { CallGrid } from '@/components/CallGrid';
import { useOverlayVisibility } from '@/hooks/useOverlayVisibility';
import { usePartyRtc } from '@/hooks/usePartyRtc';
import {
  codeFromPath,
  isPartyReaction,
  mediaProxyUrl,
  predictedHostTime,
  subtitleProxyUrl,
  type PartyClock,
  type PartyRoom,
  type PartySource,
  type PartySubtitles,
  type ServerMessage,
} from '@/lib/party';
import { cueAt, parseSubtitleText, type Cue } from '@/lib/subtitles';

type Mode = 'none' | 'video' | 'iframe';

const hostIsPresent = (room: PartyRoom) =>
  room.members.some((m) => m.id === room.hostId || m.role === 'host');

const shortUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.slice(0, 120);
  }
};

const watchLog = (...args: unknown[]) => {
  // eslint-disable-next-line no-console
  console.log('[Watch]', ...args);
};

const streamflixLog = (...args: unknown[]) => {
  // eslint-disable-next-line no-console
  console.log('[Streamflix]', ...args);
};

export const WatchPlayer = () => {
  const [gateError, setGateError] = useState('');
  const [roomError, setRoomError] = useState('');
  const [room, setRoom] = useState<PartyRoom | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [clock, setClock] = useState<PartyClock>({
    positionSeconds: 0,
    paused: true,
    updatedAt: Date.now(),
  });
  const [mode, setMode] = useState<Mode>('none');
  const [waiting, setWaiting] = useState('Waiting for the host’s stream…');
  const [membersOpen, setMembersOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [streamflixSources, setStreamflixSources] = useState<StreamflixWebSource[]>(
    [],
  );
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [audioTracks, setAudioTracks] = useState<AudioOption[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<number | null>(null);
  const [localSubOptions, setLocalSubOptions] = useState<SubtitleOption[]>([]);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [toast, setToast] = useState<ChatLine | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [duration, setDuration] = useState(0);
  const [videoTime, setVideoTime] = useState(0);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [cues, setCues] = useState<Cue[]>([]);
  const [subOffset, setSubOffset] = useState(0);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [needsUnmute, setNeedsUnmute] = useState(false);

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
  const streamflixSourcesRef = useRef<StreamflixWebSource[]>([]);
  const triedSourceIdsRef = useRef<Set<string>>(new Set());
  const guestPickedSourceRef = useRef(false);
  const guestPickedSubRef = useRef(false);
  const activeSourceIdRef = useRef<string | null>(null);

  const overlay = useOverlayVisibility(
    !clock.paused,
    membersOpen || chatOpen || reactionsOpen || settingsOpen,
  );
  const displayNameRef = useRef('Web');

  roomRef.current = room;
  clockRef.current = clock;
  modeRef.current = mode;
  activeSourceIdRef.current = activeSourceId;

  const setStage = useCallback((el: HTMLDivElement | null) => {
    stageRef.current = el;
    setSheetHost(el);
  }, []);

  const send = useCallback((obj: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  }, []);

  const rtc = usePartyRtc(memberId, room, send);
  const rtcOnMessageRef = useRef(rtc.onMessage);
  rtcOnMessageRef.current = rtc.onMessage;

  const enqueueReaction = useCallback((from: string, emoji: string) => {
    if (!isPartyReaction(emoji)) return;
    setReactions((prev) => {
      const next = [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          from,
          emoji,
          leftPct: 8 + Math.random() * 76,
        },
      ];
      return next.length > 24 ? next.slice(next.length - 24) : next;
    });
  }, []);

  const expireReaction = useCallback((id: string) => {
    setReactions((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const sendReaction = useCallback(
    (emoji: string) => {
      if (!isPartyReaction(emoji)) return;
      send({ type: 'reaction', emoji });
      enqueueReaction(displayNameRef.current, emoji);
    },
    [enqueueReaction, send],
  );

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

  const unlockAudio = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    setNeedsUnmute(false);
  }, []);

  const playFollowingHost = useCallback(async () => {
    const video = videoRef.current;
    if (!video || clockRef.current.paused) return;
    if (!video.paused) return;
    try {
      video.muted = true;
      await video.play();
      video.muted = false;
      if (video.muted) setNeedsUnmute(true);
    } catch {
      try {
        video.muted = true;
        await video.play();
        setNeedsUnmute(true);
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
      opts?: { direct?: boolean; onFail?: () => void },
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
      setAudioTracks([]);
      setSelectedAudioId(null);

      const onFail = () => {
        watchLog('fail', opts?.direct ? 'direct' : 'proxy', shortUrl(source.uri));
        failedSourceKey.current = key;
        if (opts?.onFail) {
          void opts.onFail();
          return;
        }
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
      watchLog(
        opts?.direct ? 'direct' : 'proxy',
        source.kind,
        shortUrl(source.uri),
      );
      video.onerror = onFail;
      const isHls = source.kind === 'hls' || /\.m3u8(\?|#|$)/i.test(source.uri);
      const nativeHls = Boolean(video.canPlayType('application/vnd.apple.mpegurl'));
      if (isHls && nativeHls) {
        video.src = playUrl;
        setMode('video');
        modeRef.current = 'video';
      } else if (isHls && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        hls.loadSource(playUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setMode('video');
          modeRef.current = 'video';
          applyClock();
        });
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
          const tracks = (hls.audioTracks ?? []).map((t) => ({
            id: t.id,
            label: t.name || t.lang || `Track ${t.id + 1}`,
          }));
          setAudioTracks(tracks);
          setSelectedAudioId(hls.audioTrack);
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
        const list = (
          video as HTMLVideoElement & {
            audioTracks?: { length: number; [i: number]: { label: string; language: string } };
          }
        ).audioTracks;
        if (list && list.length > 1 && !hlsRef.current) {
          const tracks: AudioOption[] = [];
          for (let i = 0; i < list.length; i += 1) {
            const track = list[i];
            tracks.push({
              id: i,
              label: track.label || track.language || `Track ${i + 1}`,
            });
          }
          setAudioTracks(tracks);
        }
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

  const applySubtitleOptions = useCallback(
    (source: StreamflixWebSource | null, current: PartyRoom) => {
      const extractor: SubtitleOption[] = (source?.subtitles ?? []).map((t, i) => ({
        id: `stream:${i}:${t.file}`,
        label: `${t.label} (stream)`,
      }));
      const host: SubtitleOption[] = current.subtitles?.url
        ? [
            {
              id: 'host',
              label: current.subtitles.display || 'Host subtitles',
            },
          ]
        : [];
      setLocalSubOptions([...extractor, ...host]);
    },
    [],
  );

  const resolveListedSource = useCallback(
    async (
      code: string,
      source: StreamflixWebSource,
    ): Promise<StreamflixWebSource | null> => {
      if (source.url) return source;
      const res = await fetch(
        `/streamflix/${code}?source=${encodeURIComponent(source.id)}`,
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { source?: StreamflixWebSource };
      return data.source?.url ? data.source : null;
    },
    [],
  );

  const playViaProxy = useCallback(
    (current: PartyRoom) => {
      const playHostEmbed = () => {
        if (current.embedUrl) {
          playIframe(current.embedUrl);
          return;
        }
        showWaiting('Stream blocked in this browser — Open in Flick.');
        setRoomError('This CDN blocked the stream in the browser.');
      };
      if (!current.source?.uri) {
        watchLog('proxy: no host source, using embed');
        playHostEmbed();
        return;
      }
      watchLog('proxy: host source', current.source.kind, shortUrl(current.source.uri));
      loadSource(current.source, current.embedUrl, {
        onFail: () => {
          watchLog('proxy: failed, using embed');
          playHostEmbed();
        },
      });
    },
    [loadSource, showWaiting],
  );

  const playStreamflixSource = useCallback(
    async (
      current: PartyRoom,
      source: StreamflixWebSource,
      sources: StreamflixWebSource[],
    ) => {
      try {
        const resolved = await resolveListedSource(current.code, source);
        if (!resolved?.url) {
          triedSourceIdsRef.current.add(source.id);
          const next = sources.find((s) => !triedSourceIdsRef.current.has(s.id));
          if (next) {
            await playStreamflixSource(current, next, sources);
            return;
          }
          playViaProxy(current);
          return;
        }
        if (resolved.url !== source.url) {
          setStreamflixSources((prev) => {
            const next = prev.map((s) => (s.id === resolved.id ? { ...s, ...resolved } : s));
            streamflixSourcesRef.current = next;
            return next;
          });
        }
        setActiveSourceId(resolved.id);
        setSelectedSubId((prev) => {
          if (prev?.startsWith('stream:')) {
            lastSubUrl.current = '';
            setCues([]);
            return null;
          }
          return prev;
        });
        applySubtitleOptions(resolved, current);
        webResolvedRef.current = true;
        streamflixLog('play', resolved.name, resolved.kind, shortUrl(resolved.url));
        loadSource(
          { uri: resolved.url, kind: resolved.kind === 'hls' ? 'hls' : 'file' },
          current.embedUrl,
          {
            onFail: () => {
              streamflixLog('playback failed', resolved.name);
              triedSourceIdsRef.current.add(resolved.id);
              const next = sources.find((s) => !triedSourceIdsRef.current.has(s.id));
              if (next) {
                void playStreamflixSource(current, next, sources);
                return;
              }
              playViaProxy(current);
            },
          },
        );
      } catch (err) {
        streamflixLog('play failed', err);
        playViaProxy(current);
      }
    },
    [applySubtitleOptions, loadSource, playViaProxy, resolveListedSource],
  );

  const playRoom = useCallback(
    async (current: PartyRoom) => {
      if (current.browsing) {
        showWaiting('Host is picking something else…');
        return;
      }
      const vkey = `${current.content.tmdbId}|${current.content.imdbId ?? ''}|${current.content.season ?? ''}|${current.content.episode ?? ''}`;

      const tryStreamflixThenProxy = async () => {
        if (!current.content.tmdbId) {
          streamflixLog('skip: no tmdbId, using proxy');
          playViaProxy(current);
          return;
        }
        try {
          streamflixLog(
            'fetch',
            current.code,
            current.content.mediaType,
            current.content.tmdbId,
            current.content.season,
            current.content.episode,
          );
          const res = await fetch(`/streamflix/${current.code}`);
          if (res.ok) {
            const data = (await res.json()) as { sources?: StreamflixWebSource[] };
            const sources = data.sources ?? [];
            setStreamflixSources(sources);
            streamflixSourcesRef.current = sources;
            const hostSourceId = current.source?.sourceId;
            const byId = hostSourceId
              ? sources.find((s) => s.id === hostSourceId)
              : undefined;
            const hostUri = current.source?.uri;
            const match = hostUri
              ? sources.find((s) => s.url && s.url === hostUri)
              : undefined;
            const firstEnglish = sources.find((s) =>
              /english/i.test(s.language || ''),
            );
            const pick = byId ?? match ?? firstEnglish ?? sources[0];
            if (pick) {
              streamflixLog(
                'pick',
                pick.name,
                pick.language || '',
                hostSourceId ? `host=${hostSourceId}` : '',
              );
              await playStreamflixSource(current, pick, sources);
              return;
            }
            streamflixLog('http ok but no sources');
          } else {
            streamflixLog('http', res.status);
          }
        } catch (err) {
          streamflixLog('fetch failed', err);
        }
        streamflixLog('fallback: host proxy');
        playViaProxy(current);
      };

      if (lastWebKey.current === vkey) {
        if (modeRef.current !== 'iframe' && !webResolvedRef.current) {
          void tryStreamflixThenProxy();
        }
        return;
      }

      lastWebKey.current = vkey;
      webResolvedRef.current = false;
      triedSourceIdsRef.current = new Set();
      guestPickedSourceRef.current = false;
      guestPickedSubRef.current = false;
      setSelectedSubId(null);

      if (current.content.tmdbId || current.source?.uri) {
        void tryStreamflixThenProxy();
        return;
      }

      showWaiting('Waiting for the host’s stream…');
    },
    [playStreamflixSource, playViaProxy, showWaiting],
  );

  const loadSubtitleFile = useCallback(async (url: string, viaProxy?: boolean) => {
    if (modeRef.current === 'iframe') {
      lastSubUrl.current = '';
      setCues([]);
      return;
    }
    if (url === lastSubUrl.current) return;
    lastSubUrl.current = url;
    setCues([]);
    const code = roomRef.current?.code;
    const tryUrls = viaProxy && code
      ? [subtitleProxyUrl(code, url)]
      : [url, code ? subtitleProxyUrl(code, url) : ''].filter(Boolean);
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

  const loadSubtitles = useCallback(
    async (sub: PartySubtitles | null | undefined) => {
      if (guestPickedSubRef.current) return;
      if (!sub?.url) {
        lastSubUrl.current = '';
        setCues([]);
        return;
      }
      const offset = Number(sub.offsetSeconds);
      if (Number.isFinite(offset)) setSubOffset(offset);
      await loadSubtitleFile(sub.url);
    },
    [loadSubtitleFile],
  );

  const connect = useCallback(
    (code: string, name: string, password?: string) => {
      if (code.length < 4) {
        setGateError('Enter a room code from Flick.');
        return;
      }
      setGateError('');
      displayNameRef.current = name || 'Web';
      wsRef.current?.close();
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
            ...(password ? { password } : {}),
          }),
        );
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as ServerMessage;
        rtcOnMessageRef.current(msg);
        if (msg.type === 'rtc-peers' && roomRef.current) {
          roomRef.current = { ...roomRef.current, rtcMemberIds: msg.ids };
          setRoom(roomRef.current);
        }
        if (msg.type === 'error') {
          if (roomRef.current) setRoomError(msg.message);
          else setGateError(msg.message);
          return;
        }
        if (msg.type === 'joined') {
          roomRef.current = msg.room;
          setMemberId(msg.memberId);
          setRoom(msg.room);
          setClock(msg.room.clock);
          if (hostIsPresent(msg.room)) {
            setRoomError((prev) => (prev === 'Host is away' ? '' : prev));
          }
          return;
        }
        if (msg.type === 'state') {
          roomRef.current = msg.room;
          setRoom(msg.room);
          setClock(msg.room.clock);
          if (hostIsPresent(msg.room)) {
            setRoomError((prev) => (prev === 'Host is away' ? '' : prev));
          }
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
          const hostSourceId = msg.source?.sourceId;
          const hostChanged =
            !!hostSourceId && hostSourceId !== activeSourceIdRef.current;
          if (hostChanged) {
            guestPickedSourceRef.current = false;
            webResolvedRef.current = false;
          }
          if (
            roomRef.current &&
            modeRef.current !== 'iframe' &&
            (!webResolvedRef.current || hostChanged) &&
            !guestPickedSourceRef.current
          ) {
            const listed = streamflixSourcesRef.current;
            const listedMatch = hostSourceId
              ? listed.find((s) => s.id === hostSourceId)
              : undefined;
            if (listedMatch) {
              triedSourceIdsRef.current = new Set();
              void playStreamflixSource(
                roomRef.current,
                listedMatch,
                listed,
              );
            } else {
              lastWebKey.current = '';
              void playRoom(roomRef.current);
            }
          }
          return;
        }
        if (msg.type === 'subtitles') {
          if (roomRef.current) {
            roomRef.current = { ...roomRef.current, subtitles: msg.subtitles };
            setRoom(roomRef.current);
            const active = streamflixSourcesRef.current.find(
              (s) => s.id === activeSourceIdRef.current,
            );
            applySubtitleOptions(active ?? null, roomRef.current);
          }
          if (!guestPickedSubRef.current) void loadSubtitles(msg.subtitles);
          return;
        }
        if (msg.type === 'browse') {
          lastSourceKey.current = '';
          failedSourceKey.current = '';
          lastSubUrl.current = '';
          lastWebKey.current = '';
          webResolvedRef.current = false;
          guestPickedSourceRef.current = false;
          guestPickedSubRef.current = false;
          triedSourceIdsRef.current = new Set();
          setStreamflixSources([]);
          streamflixSourcesRef.current = [];
          setActiveSourceId(null);
          setSelectedSubId(null);
          setCues([]);
          if (roomRef.current) {
            roomRef.current = {
              ...roomRef.current,
              browsing: true,
              source: null,
              embedUrl: null,
              subtitles: null,
            };
            setRoom(roomRef.current);
          }
          showWaiting('Host is picking something else…');
          return;
        }
        if (msg.type === 'content') {
          lastSourceKey.current = '';
          failedSourceKey.current = '';
          lastSubUrl.current = '';
          lastWebKey.current = '';
          webResolvedRef.current = false;
          guestPickedSourceRef.current = false;
          guestPickedSubRef.current = false;
          triedSourceIdsRef.current = new Set();
          setStreamflixSources([]);
          streamflixSourcesRef.current = [];
          setActiveSourceId(null);
          setSelectedSubId(null);
          setCues([]);
          if (roomRef.current) {
            roomRef.current = {
              ...roomRef.current,
              content: msg.content,
              browsing: false,
              source: null,
              embedUrl: null,
              subtitles: null,
            };
            setRoom(roomRef.current);
          }
          showWaiting('Host switched title — waiting for stream…');
          return;
        }
        if (msg.type === 'episode') {
          lastSourceKey.current = '';
          failedSourceKey.current = '';
          lastSubUrl.current = '';
          lastWebKey.current = '';
          webResolvedRef.current = false;
          guestPickedSourceRef.current = false;
          guestPickedSubRef.current = false;
          triedSourceIdsRef.current = new Set();
          setStreamflixSources([]);
          streamflixSourcesRef.current = [];
          setActiveSourceId(null);
          setSelectedSubId(null);
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
        if (msg.type === 'reaction') {
          enqueueReaction(msg.from, msg.emoji);
          return;
        }
        if (msg.type === 'ended') {
          setMemberId(null);
          setRoomError(msg.reason || 'Room ended');
          showWaiting(msg.reason || 'Room ended');
        }
      };
      ws.onerror = () => {
        setGateError('Could not connect to the party server.');
      };
    },
    [
      applyClock,
      applySubtitleOptions,
      enqueueReaction,
      loadSource,
      loadSubtitles,
      playRoom,
      playStreamflixSource,
      showWaiting,
    ],
  );

  // <video> only mounts after `room` is set. Streamflix sources first,
  // then /media proxy, then the host embed URL.
  useEffect(() => {
    if (!room) return;
    void playRoom(room);
    if (!guestPickedSubRef.current) void loadSubtitles(room.subtitles);
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

  const sheetOpen = membersOpen || chatOpen || settingsOpen;
  useEffect(() => {
    if (!sheetOpen) return;
    history.pushState({ partySheet: true }, '');
    const onPop = () => {
      setMembersOpen(false);
      setChatOpen(false);
      setSettingsOpen(false);
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
    };
  }, [sheetOpen]);

  const closeSheets = useCallback((open: boolean) => {
    if (open) return;
    setMembersOpen(false);
    setChatOpen(false);
    setSettingsOpen(false);
    if (history.state && history.state.partySheet) {
      history.back();
    }
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

  useEffect(() => {
    if (!overlay.visible) setReactionsOpen(false);
  }, [overlay.visible]);

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

  const handleSelectSource = useCallback(
    (id: string) => {
      const current = roomRef.current;
      if (!current) return;
      const source = streamflixSourcesRef.current.find((s) => s.id === id);
      if (!source) return;
      guestPickedSourceRef.current = true;
      triedSourceIdsRef.current = new Set();
      void playStreamflixSource(current, source, streamflixSourcesRef.current);
    },
    [playStreamflixSource],
  );

  const handleSelectAudio = useCallback((id: number) => {
    setSelectedAudioId(id);
    if (hlsRef.current) {
      hlsRef.current.audioTrack = id;
      return;
    }
    const list = (
      videoRef.current as
        | (HTMLVideoElement & {
            audioTracks?: {
              length: number;
              [i: number]: { enabled: boolean };
            };
          })
        | null
    )?.audioTracks;
    if (!list) return;
    for (let i = 0; i < list.length; i += 1) {
      list[i].enabled = i === id;
    }
  }, []);

  const handleSelectSubtitle = useCallback(
    (id: string | null) => {
      guestPickedSubRef.current = true;
      setSelectedSubId(id);
      if (id == null) {
        lastSubUrl.current = '';
        setCues([]);
        return;
      }
      if (id === 'host') {
        const sub = roomRef.current?.subtitles;
        if (sub?.url) void loadSubtitleFile(sub.url);
        return;
      }
      const match = id.match(/^stream:\d+:(.+)$/);
      if (match?.[1]) void loadSubtitleFile(match[1], true);
    },
    [loadSubtitleFile],
  );

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
  const hostOffset = Number(room.subtitles?.offsetSeconds);
  const offset = guestPickedSubRef.current
    ? subOffset
    : Number.isFinite(hostOffset)
      ? hostOffset
      : subOffset;
  const cue = mode === 'video' ? cueAt(cues, t - offset) : null;
  const ep =
    room.content.mediaType === 'tv' && room.content.season != null
      ? `S${room.content.season} E${room.content.episode}`
      : undefined;
  const selectedSubLabel =
    selectedSubId == null
      ? undefined
      : localSubOptions.find((s) => s.id === selectedSubId)?.label;
  const cap = selectedSubLabel
    ? offset
      ? `${selectedSubLabel} ${offset > 0 ? '+' : ''}${offset}s`
      : selectedSubLabel
    : room.subtitles && offset
      ? `${room.subtitles.display} ${offset > 0 ? '+' : ''}${offset}s`
      : room.subtitles?.display;
  const subtitle = [ep, cap, clock.paused ? 'Paused' : 'Playing', 'Following host']
    .filter(Boolean)
    .join(' · ');
  const banner = !hostIsPresent(room)
    ? 'Host is away'
    : roomError === 'Host is away'
      ? ''
      : roomError;

  const onInteract = () => {
    unlockAudio();
    overlay.show();
  };

  return (
    <div className="h-dvh bg-background">
      <div
        ref={setStage}
        className="relative h-dvh w-full overflow-hidden bg-black"
      >
        {mode === 'none' ? (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-muted-foreground">
            {waiting}
          </div>
        ) : null}
        <video
          ref={(el) => {
            videoRef.current = el;
            if (el) {
              el.setAttribute('playsinline', '');
              el.setAttribute('webkit-playsinline', '');
              el.setAttribute('x-webkit-airplay', 'allow');
            }
          }}
          className={mode === 'video' ? 'absolute inset-0 h-full w-full bg-black' : 'hidden'}
          playsInline
          onSeeked={() => {
            seekingRef.current = false;
            if (!clockRef.current.paused) void playFollowingHost();
          }}
          onPlaying={() => {
            const video = videoRef.current;
            if (!video) return;
            if (!needsUnmute) video.muted = false;
          }}
        />
        {mode === 'iframe' && iframeUrl ? (
          <iframe
            title="Embed player"
            src={iframeUrl}
            allow="autoplay; fullscreen; playsinline"
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : null}
        {cue ? (
          <div className="pointer-events-none absolute right-[8%] bottom-[18%] left-[8%] text-center text-lg font-bold whitespace-pre-wrap text-white [text-shadow:0_1px_4px_#000]">
            {cue.text}
          </div>
        ) : null}
        {needsUnmute && mode === 'video' ? (
          <button
            type="button"
            onClick={unlockAudio}
            className="absolute top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-card/95 px-4 py-2 text-sm font-semibold shadow-lg"
          >
            Tap for sound
          </button>
        ) : null}
        {banner ? (
          <p className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-4 left-4 z-20 rounded-md bg-background/80 px-3 py-2 text-center text-sm text-destructive">
            {banner}
          </p>
        ) : null}
        {!overlay.visible ? (
          <button
            type="button"
            className="absolute inset-0 z-5"
            aria-label="Show controls"
            onClick={onInteract}
          />
        ) : null}
        <CallGrid
          localStream={rtc.localStream}
          remotes={rtc.remotes}
          camOff={rtc.camOff}
        />
        <ReactionOverlay items={reactions} onExpire={expireReaction} />
        <PlayerOverlay
          visible={overlay.visible}
          title={room.content.title || 'Watch party'}
          subtitle={subtitle}
          playing={!clock.paused}
          currentTime={t}
          duration={duration}
          fullscreen={fullscreen}
          partyCode={room.code}
          onToggleOverlay={() => {
            if (reactionsOpen) {
              setReactionsOpen(false);
              return;
            }
            overlay.toggle();
          }}
          onInteract={onInteract}
          onBack={() => {
            rtc.leaveCall();
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
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleReactions={() => setReactionsOpen((open) => !open)}
          reactionsOpen={reactionsOpen}
          onSelectReaction={sendReaction}
          onToggleFullscreen={toggleFullscreen}
          inCall={rtc.joined}
          muted={rtc.muted}
          camOff={rtc.camOff}
          onToggleCall={() => {
            if (rtc.joined) rtc.leaveCall();
            else void rtc.joinCall();
          }}
          onToggleMute={rtc.toggleMute}
          onToggleCam={rtc.toggleCam}
        />
        <ChatToast line={toast} onOpen={() => setChatOpen(true)} />
        <MembersSheet
          open={membersOpen}
          onOpenChange={(open) => {
            setMembersOpen(open);
            if (!open) closeSheets(false);
          }}
          container={sheetHost}
          code={room.code}
          members={room.members}
          onLeave={() => {
            rtc.leaveCall();
            send({ type: 'leave' });
            location.href = '/';
          }}
        />
        <ChatSheet
          open={chatOpen}
          onOpenChange={(open) => {
            setChatOpen(open);
            if (!open) closeSheets(false);
          }}
          container={sheetHost}
          chat={chat}
          onSend={(text) => send({ type: 'chat', text })}
        />
        <SettingsSheet
          open={settingsOpen}
          onOpenChange={(open) => {
            setSettingsOpen(open);
            if (!open) closeSheets(false);
          }}
          container={sheetHost}
          sources={streamflixSources}
          activeSourceId={activeSourceId}
          onSelectSource={handleSelectSource}
          audioTracks={audioTracks}
          selectedAudioId={selectedAudioId}
          onSelectAudio={handleSelectAudio}
          subtitles={localSubOptions}
          selectedSubtitleId={selectedSubId}
          onSelectSubtitle={handleSelectSubtitle}
          subtitleOffset={subOffset}
          onChangeOffset={setSubOffset}
        />
      </div>
    </div>
  );
};
