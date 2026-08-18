import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Hls from 'hls.js';
import { ChatSheet, type ChatLine } from '@/components/ChatSheet';
import { ChatToast } from '@/components/ChatToast';
import { HostLobby } from '@/components/HostLobby';
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
import { SubtitleOverlay } from '@/components/SubtitleOverlay';
import { CallGrid } from '@/components/CallGrid';
import { useOverlayVisibility } from '@/hooks/useOverlayVisibility';
import { usePartyRtc } from '@/hooks/usePartyRtc';
import { useParty } from '@/hooks/useParty';
import {
  isPartyReaction,
  isWebViewHostSource,
  mediaProxyUrl,
  predictedHostTime,
  subtitleProxyUrl,
  type PartyClock,
  type PartyContent,
  type PartyRoom,
  type PartySource,
  type PartySubtitles,
  type ServerMessage,
} from '@/lib/party';
import {
  createPlaybackSession,
  listSources,
  registerPlaybackSource,
  registerSubtitleUrl,
  resolveSource,
  toWebSource,
  type StreamflixSource,
} from '@/lib/streamflix';
import { languageFromLabel } from '@/lib/languages';
import { useSubtitleSettings } from '@/lib/subtitleSettings';
import { searchVdrkSubtitles } from '@/lib/vdrk';
import { searchWyzieSubtitles, type WyzieSubtitle } from '@/lib/wyzie';
import { cueAt, parseSubtitleText, shiftCues, type Cue } from '@/lib/subtitles';

type Mode = 'none' | 'video' | 'iframe';

/** Safari and iOS use the system video player (fullscreen / AirPlay / PiP). */
const isAppleVideoPlayer = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari =
    /Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return iOS || safari;
};

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

export const WatchPlayer = ({ content: soloContent }: { content?: PartyContent } = {}) => {
  const navigate = useNavigate();
  const {
    room: partyRoom,
    memberId,
    role,
    send: sendParty,
    subscribe,
    leaveRoom,
    chat,
    displayName,
  } = useParty();
  const solo = Boolean(soloContent);
  const send = useCallback(
    (msg: Parameters<typeof sendParty>[0]) => {
      if (solo) return;
      sendParty(msg);
    },
    [sendParty, solo],
  );
  const [playbackSession, setPlaybackSession] = useState<string | null>(null);
  const playbackSessionRef = useRef<string | null>(null);
  const listedFullRef = useRef<StreamflixSource[]>([]);
  const [lobbyOpen, setLobbyOpen] = useState(false);
  const room = useMemo((): PartyRoom | null => {
    if (soloContent) {
      return {
        code: playbackSessionRef.current || playbackSession || 'solo',
        hostId: 'solo',
        content: soloContent,
        clock: {
          positionSeconds: 0,
          paused: false,
          updatedAt: Date.now(),
        },
        members: [],
      };
    }
    return partyRoom;
  }, [partyRoom, playbackSession, soloContent]);
  const isHost = solo || role === 'host';
  const [roomError, setRoomError] = useState('');
  const [clock, setClock] = useState<PartyClock>(
    room?.clock ?? {
      positionSeconds: 0,
      paused: true,
      updatedAt: Date.now(),
    },
  );
  const [mode, setMode] = useState<Mode>('none');
  const [waiting, setWaiting] = useState(
    solo ? 'Loading stream…' : 'Waiting for the host’s stream…',
  );
  const [membersOpen, setMembersOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [callTilesHidden, setCallTilesHidden] = useState(false);
  const [streamflixSources, setStreamflixSources] = useState<StreamflixWebSource[]>(
    [],
  );
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [audioTracks, setAudioTracks] = useState<AudioOption[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<number | null>(null);
  const [localSubOptions, setLocalSubOptions] = useState<SubtitleOption[]>([]);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [wyzieTracks, setWyzieTracks] = useState<WyzieSubtitle[]>([]);
  const [vdrkTracks, setVdrkTracks] = useState<WyzieSubtitle[]>([]);
  const [wyzieLoading, setWyzieLoading] = useState(false);
  const [wyzieError, setWyzieError] = useState<string | null>(null);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [toast, setToast] = useState<ChatLine | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [duration, setDuration] = useState(0);
  const [videoTime, setVideoTime] = useState(0);
  const [cues, setCues] = useState<Cue[]>([]);
  const [nativeCaptionsActive, setNativeCaptionsActive] = useState(false);
  const [subOffset, setSubOffset] = useState(0);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [videoBuffering, setVideoBuffering] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [sheetHost, setSheetHost] = useState<HTMLElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const modeRef = useRef<Mode>('none');
  const lastSourceKey = useRef('');
  const failedSourceKey = useRef('');
  const lastSubUrl = useRef('');
  const nativeTrackRef = useRef<TextTrack | null>(null);
  const cuesRef = useRef<Cue[]>([]);
  const subOffsetRef = useRef(0);
  const appleVideoPlayer = useMemo(() => isAppleVideoPlayer(), []);
  const applyNativeAppleTrackRef = useRef<() => void>(() => {});
  const lastWebKey = useRef('');
  const webResolvedRef = useRef(false);
  const roomRef = useRef<PartyRoom | null>(null);
  const clockRef = useRef(clock);
  const seekingRef = useRef(false);
  const streamflixSourcesRef = useRef<StreamflixWebSource[]>([]);
  const wyzieTracksRef = useRef<WyzieSubtitle[]>([]);
  const vdrkTracksRef = useRef<WyzieSubtitle[]>([]);
  const localSubOptionsRef = useRef<SubtitleOption[]>([]);
  const selectedSubIdRef = useRef<string | null>(null);
  const triedSourceIdsRef = useRef<Set<string>>(new Set());
  const guestPickedSourceRef = useRef(false);
  const guestPickedSubRef = useRef(false);
  const soloAutoplayDoneRef = useRef(false);
  const activeSourceIdRef = useRef<string | null>(null);
  const bufferingRef = useRef(false);
  const seenMembersRef = useRef<Set<string> | null>(null);

  const overlay = useOverlayVisibility(
    !clock.paused,
    membersOpen || chatOpen || settingsOpen || lobbyOpen,
  );
  const { settings: subtitleSettings } = useSubtitleSettings();
  const isHostRef = useRef(isHost);
  const displayNameRef = useRef(displayName);
  const partyRoomRef = useRef(partyRoom);

  roomRef.current = room;
  clockRef.current = clock;
  modeRef.current = mode;
  activeSourceIdRef.current = activeSourceId;
  selectedSubIdRef.current = selectedSubId;
  isHostRef.current = isHost;
  displayNameRef.current = displayName;
  partyRoomRef.current = partyRoom;
  cuesRef.current = cues;
  subOffsetRef.current = subOffset;

  useEffect(() => {
    playbackSessionRef.current = null;
    setPlaybackSession(null);
    listedFullRef.current = [];
  }, [
    soloContent?.tmdbId,
    soloContent?.mediaType,
    soloContent?.season,
    soloContent?.episode,
  ]);

  const setStage = useCallback((el: HTMLDivElement | null) => {
    stageRef.current = el;
    setSheetHost(el);
  }, []);

  const reportBuffering = useCallback(
    (buffering: boolean) => {
      if (bufferingRef.current === buffering) return;
      bufferingRef.current = buffering;
      setVideoBuffering(buffering);
      send({ type: 'buffering', buffering });
    },
    [send],
  );

  const rtc = usePartyRtc(solo ? null : memberId, solo ? null : partyRoom, (obj) => send(obj));
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

  const applyNativeAppleTrack = useCallback(() => {
    const video = videoRef.current;
    if (!video || !appleVideoPlayer) {
      setNativeCaptionsActive(false);
      return;
    }

    const hostOffset = Number(roomRef.current?.subtitles?.offsetSeconds);
    const offsetSeconds =
      guestPickedSubRef.current || isHostRef.current
        ? subOffsetRef.current
        : Number.isFinite(hostOffset)
          ? hostOffset
          : subOffsetRef.current;
    const cuesNow = cuesRef.current;
    const selected = selectedSubIdRef.current;
    const option = localSubOptionsRef.current.find((t) => t.id === selected);
    const canShow =
      cuesNow.length > 0 && selected != null && modeRef.current === 'video';

    const tracks = video.textTracks;
    let track = nativeTrackRef.current;
    let attached = false;
    if (track) {
      for (let i = 0; i < tracks.length; i += 1) {
        if (tracks[i] === track) {
          attached = true;
          break;
        }
      }
    }
    if (!track || !attached) {
      track = video.addTextTrack(
        'subtitles',
        option?.label || 'Subtitles',
        option?.language || 'en',
      );
      nativeTrackRef.current = track;
    }

    const existing = track.cues;
    if (existing) {
      while (existing.length > 0) track.removeCue(existing[0]);
    }

    if (!canShow) {
      track.mode = 'disabled';
      setNativeCaptionsActive(false);
      return;
    }

    for (const cue of shiftCues(cuesNow, offsetSeconds)) {
      try {
        track.addCue(new VTTCue(cue.start, cue.end, cue.text));
      } catch {
        /* Safari rejects overlapping or inverted cues */
      }
    }
    for (let i = 0; i < tracks.length; i += 1) {
      const other = tracks[i];
      if (other !== track && (other.kind === 'subtitles' || other.kind === 'captions')) {
        other.mode = 'disabled';
      }
    }
    track.mode = 'showing';
    setNativeCaptionsActive(true);
  }, [appleVideoPlayer]);
  applyNativeAppleTrackRef.current = applyNativeAppleTrack;

  const destroyHls = () => {
    hlsRef.current?.destroy();
    hlsRef.current = null;
    nativeTrackRef.current = null;
  };

  const showWaiting = useCallback(
    (text: string) => {
      setWaiting(text);
      setMode('none');
      setIframeUrl(null);
      destroyHls();
      reportBuffering(false);
    },
    [reportBuffering],
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

  const tryPlayWhenReady = useCallback(async () => {
    if (modeRef.current !== 'video' || bufferingRef.current) return;
    if (solo) {
      if (soloAutoplayDoneRef.current) return;
      const video = videoRef.current;
      if (!video) return;
      if (!video.paused) {
        soloAutoplayDoneRef.current = true;
        return;
      }
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
          return;
        }
      }
      soloAutoplayDoneRef.current = true;
      return;
    }
    void playFollowingHost();
  }, [playFollowingHost, solo]);

  const applyClock = useCallback(() => {
    if (isHostRef.current) return;
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
          reportBuffering(false);
        } else {
          showWaiting('Stream blocked in this browser — Open in Flick.');
          setRoomError('This CDN blocked the stream in the browser.');
        }
      };
      const mediaCode =
        (isHostRef.current && playbackSessionRef.current) ||
        (current.code !== 'solo' ? current.code : playbackSessionRef.current);
      const playUrl = opts?.direct
        ? source.uri
        : mediaCode
          ? mediaProxyUrl(mediaCode, source.uri)
          : source.uri;
      watchLog(
        opts?.direct ? 'direct' : 'proxy',
        source.kind,
        shortUrl(source.uri),
      );
      video.onerror = onFail;
      reportBuffering(true);
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
        hls.on(Hls.Events.FRAG_BUFFERED, () => {
          reportBuffering(false);
          void tryPlayWhenReady();
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data?.details === 'bufferStalledError') reportBuffering(true);
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
        applyNativeAppleTrackRef.current();
      };
    },
    [applyClock, reportBuffering, showWaiting, tryPlayWhenReady],
  );

  const playIframe = (url: string) => {
    lastSourceKey.current = '';
    destroyHls();
    setCues([]);
    setMode('iframe');
    modeRef.current = 'iframe';
    setIframeUrl(url);
    reportBuffering(false);
  };

  const applySubtitleOptions = useCallback(
    (source: StreamflixWebSource | null, current: PartyRoom) => {
      const extractor: SubtitleOption[] = (source?.subtitles ?? []).map((t, i) => ({
        id: `stream:${i}:${t.file}`,
        label: `${t.label} (stream)`,
        url: t.file,
        language: languageFromLabel(t.label),
      }));
      const vdrk: SubtitleOption[] = vdrkTracksRef.current.map((t) => ({
        id: `vdrk:${t.id}`,
        label: `${t.display}${t.isHearingImpaired ? ' (CC)' : ''}`,
        url: t.url,
        language: t.language,
      }));
      const wyzie: SubtitleOption[] = wyzieTracksRef.current.map((t) => ({
        id: `wyzie:${t.id}`,
        label: `${t.display}${t.isHearingImpaired ? ' (CC)' : ''}`,
        url: t.url,
        language: t.language,
      }));
      const host: SubtitleOption[] =
        !isHostRef.current && current.subtitles?.url
          ? [
              {
                id: 'host',
                label: current.subtitles.display || 'Host subtitles',
                url: current.subtitles.url,
                language: current.subtitles.language,
              },
            ]
          : [];
      const next = [...extractor, ...vdrk, ...wyzie, ...host];
      localSubOptionsRef.current = next;
      setLocalSubOptions(next);
    },
    [],
  );

  const sessionCode = () =>
    playbackSessionRef.current ||
    (roomRef.current?.code && roomRef.current.code !== 'solo'
      ? roomRef.current.code
      : null);

  const publishSubtitles = useCallback(
    (url: string | null, display: string, language: string, offsetSeconds: number) => {
      if (!isHostRef.current) return;
      if (!url) {
        send({ type: 'subtitles', subtitles: null });
        return;
      }
      send({
        type: 'subtitles',
        subtitles: {
          url,
          language: language.slice(0, 16) || 'en',
          display: display.slice(0, 80) || 'Subtitles',
          offsetSeconds,
        },
      });
    },
    [send],
  );

  const loadSubtitleFile = useCallback(async (url: string) => {
    if (!url) return;
    if (url === lastSubUrl.current) return;
    setCues([]);
    const session = sessionCode();
    const party = partyRoomRef.current?.code;
    if (session) {
      try {
        await registerSubtitleUrl(session, url);
      } catch {
        // allowlist best-effort
      }
    }
    if (party && party !== session) {
      try {
        await registerSubtitleUrl(party, url);
      } catch {
        // allowlist best-effort
      }
    }
    const tryUrls: string[] = [];
    const proxyCode = session || party;
    if (proxyCode) {
      const hostUrl = roomRef.current?.subtitles?.url;
      if (hostUrl && url === hostUrl) tryUrls.push(subtitleProxyUrl(proxyCode));
      tryUrls.push(subtitleProxyUrl(proxyCode, url));
    }
    tryUrls.push(url);
    for (const href of tryUrls) {
      try {
        const res = await fetch(href);
        if (!res.ok) continue;
        const parsed = parseSubtitleText(await res.text());
        if (!parsed.length) continue;
        lastSubUrl.current = url;
        setCues(parsed);
        return;
      } catch {
        // CORS — try party-server caption fetch
      }
    }
    lastSubUrl.current = '';
  }, []);

  const followAvailableSubtitles = useCallback(
    (source: StreamflixWebSource | null, current: PartyRoom) => {
      applySubtitleOptions(source, current);
      if (guestPickedSubRef.current) return;
      if (!isHostRef.current && current.subtitles?.url) {
        const offset = Number(current.subtitles.offsetSeconds);
        if (Number.isFinite(offset)) setSubOffset(offset);
        setSelectedSubId('host');
        void loadSubtitleFile(current.subtitles.url);
      }
    },
    [applySubtitleOptions, loadSubtitleFile],
  );

  const handleSelectSubtitle = useCallback(
    (id: string | null, manual = true) => {
      if (manual) guestPickedSubRef.current = true;
      setSubOffset(0);
      setSelectedSubId(id);
      if (id == null) {
        lastSubUrl.current = '';
        setCues([]);
        publishSubtitles(null, '', '', 0);
        return;
      }
      const option =
        localSubOptionsRef.current.find((t) => t.id === id) ??
        (id === 'host' && roomRef.current?.subtitles?.url
          ? {
              id: 'host',
              label: roomRef.current.subtitles.display || 'Host subtitles',
              url: roomRef.current.subtitles.url,
              language: roomRef.current.subtitles.language,
            }
          : null);
      if (!option?.url) return;
      if (id === 'host') {
        const offset = Number(roomRef.current?.subtitles?.offsetSeconds);
        if (Number.isFinite(offset)) setSubOffset(offset);
      }
      void loadSubtitleFile(option.url);
      if (id !== 'host') {
        publishSubtitles(option.url, option.label, option.language || 'en', 0);
      }
    },
    [loadSubtitleFile, publishSubtitles],
  );

  const handleChangeOffset = useCallback(
    (next: number) => {
      setSubOffset(next);
      if (!isHostRef.current) return;
      const option = localSubOptionsRef.current.find(
        (t) => t.id === selectedSubIdRef.current,
      );
      if (option?.url) {
        publishSubtitles(option.url, option.label, option.language || 'en', next);
      }
    },
    [publishSubtitles],
  );

  const resolveListedSource = useCallback(
    async (
      current: PartyRoom,
      source: StreamflixWebSource,
    ): Promise<StreamflixWebSource | null> => {
      if (source.url && isHostRef.current) {
        const session =
          playbackSessionRef.current ||
          (current.code !== 'solo' ? current.code : null);
        if (session) {
          await registerPlaybackSource(session, {
            uri: source.url,
            kind: source.kind,
            subtitles: source.subtitles,
          });
        }
        const partyCode = partyRoomRef.current?.code;
        if (partyCode && partyCode !== session) {
          await registerPlaybackSource(partyCode, {
            uri: source.url,
            kind: source.kind,
            subtitles: source.subtitles,
          });
        }
        return source;
      }
      if (isHostRef.current) {
        const full = listedFullRef.current.find((s) => s.id === source.id);
        if (!full) return null;
        const resolved = await resolveSource(full);
        if (!resolved?.uri) return null;
        const session =
          playbackSessionRef.current ||
          (current.code !== 'solo' ? current.code : null);
        if (session) {
          await registerPlaybackSource(session, {
            uri: resolved.uri,
            kind: resolved.kind,
            subtitles: resolved.subtitles,
          });
        }
        const partyCode = partyRoomRef.current?.code;
        if (partyCode && partyCode !== session) {
          await registerPlaybackSource(partyCode, {
            uri: resolved.uri,
            kind: resolved.kind,
            subtitles: resolved.subtitles,
          });
        }
        return toWebSource(resolved);
      }
      if (source.url) return source;
      const href = `/streamflix/${current.code}?source=${encodeURIComponent(source.id)}`;
      const res = await fetch(href);
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
      followAvailableSubtitles(null, current);
    },
    [followAvailableSubtitles, loadSource, showWaiting],
  );

  const playStreamflixSource = useCallback(
    async (
      current: PartyRoom,
      source: StreamflixWebSource,
      sources: StreamflixWebSource[],
    ) => {
      try {
        const resolved = await resolveListedSource(current, source);
        if (!resolved?.url) {
          triedSourceIdsRef.current.add(source.id);
          const next = sources.find((s) => !triedSourceIdsRef.current.has(s.id));
          if (next) {
            await playStreamflixSource(current, next, sources);
            return;
          }
          if (isHostRef.current) {
            showWaiting('No Streamflix source played in this browser.');
            setRoomError('No Streamflix source played in this browser.');
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
        if (!guestPickedSubRef.current) lastSubUrl.current = '';
        followAvailableSubtitles(resolved, current);
        webResolvedRef.current = true;
        streamflixLog('play', resolved.name, resolved.kind, shortUrl(resolved.url));
        if (isHostRef.current) {
          send({
            type: 'source',
            uri: resolved.url,
            kind: resolved.kind === 'hls' ? 'hls' : 'file',
            sourceId: resolved.id,
          });
        }
        loadSource(
          { uri: resolved.url, kind: resolved.kind === 'hls' ? 'hls' : 'file' },
          isHostRef.current ? null : current.embedUrl,
          {
            direct: false,
            onFail: () => {
              streamflixLog('playback failed', resolved.name);
              triedSourceIdsRef.current.add(resolved.id);
              const next = sources.find((s) => !triedSourceIdsRef.current.has(s.id));
              if (next) {
                void playStreamflixSource(current, next, sources);
                return;
              }
              if (isHostRef.current) {
                showWaiting('No Streamflix source played in this browser.');
                setRoomError('No Streamflix source played in this browser.');
                return;
              }
              playViaProxy(current);
            },
          },
        );
      } catch (err) {
        streamflixLog('play failed', err);
        if (isHostRef.current) {
          showWaiting('No Streamflix source played in this browser.');
          setRoomError('No Streamflix source played in this browser.');
          return;
        }
        playViaProxy(current);
      }
    },
    [followAvailableSubtitles, loadSource, playViaProxy, resolveListedSource, send, showWaiting],
  );

  const playRoom = useCallback(
    async (current: PartyRoom) => {
      if (current.browsing && !isHostRef.current) {
        showWaiting('Host is picking something else…');
        return;
      }
      const vkey = `${current.content.mediaType}|${current.content.tmdbId}|${current.content.imdbId ?? ''}|${current.content.season ?? ''}|${current.content.episode ?? ''}`;

      const tryStreamflixThenProxy = async () => {
        if (isWebViewHostSource(current) && !isHostRef.current) {
          streamflixLog('skip: webview host source, using proxy');
          playViaProxy(current);
          return;
        }
        if (!current.content.tmdbId) {
          streamflixLog('skip: no tmdbId, using proxy');
          if (isHostRef.current) {
            showWaiting('No Streamflix source played in this browser.');
            setRoomError('Missing title id.');
            return;
          }
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
          let playing = current;
          let sources: StreamflixWebSource[] = [];
          if (isHostRef.current) {
            let session = playbackSessionRef.current;
            if (!session) {
              session =
                current.code && current.code !== 'solo'
                  ? current.code
                  : await createPlaybackSession(current.content);
              playbackSessionRef.current = session;
              playing = { ...current, code: session };
              roomRef.current = playing;
              setPlaybackSession(session);
            } else if (session !== current.code) {
              playing = { ...current, code: session };
              roomRef.current = playing;
            }
            const listed = await listSources({
              tmdbId: current.content.tmdbId,
              mediaType: current.content.mediaType,
              season: current.content.season,
              episode: current.content.episode,
              title: current.content.title,
              imdbId: current.content.imdbId,
            });
            listedFullRef.current = listed;
            sources = listed.map(toWebSource);
          } else {
            const res = await fetch(`/streamflix/${current.code}`);
            if (!res.ok) {
              streamflixLog('http', res.status);
              playViaProxy(current);
              return;
            }
            const data = (await res.json()) as { sources?: StreamflixWebSource[] };
            sources = data.sources ?? [];
          }
          setStreamflixSources(sources);
          streamflixSourcesRef.current = sources;
          const hostSourceId = playing.source?.sourceId;
          const byId = hostSourceId
            ? sources.find((s) => s.id === hostSourceId)
            : undefined;
          const hostUri = playing.source?.uri;
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
            await playStreamflixSource(playing, pick, sources);
            return;
          }
          streamflixLog('http ok but no sources');
        } catch (err) {
          streamflixLog('fetch failed', err);
        }
        streamflixLog('fallback: host proxy');
        if (isHostRef.current) {
          showWaiting('No Streamflix source played in this browser.');
          setRoomError('No Streamflix source played in this browser.');
          return;
        }
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

  const loadSubtitles = useCallback(
    async (sub: PartySubtitles | null | undefined) => {
      const current = roomRef.current;
      if (!current) return;
      const active =
        streamflixSourcesRef.current.find(
          (s) => s.id === activeSourceIdRef.current,
        ) ?? null;
      followAvailableSubtitles(active, { ...current, subtitles: sub ?? null });
    },
    [followAvailableSubtitles],
  );

  const resetPlaybackKeys = useCallback(() => {
    lastSourceKey.current = '';
    failedSourceKey.current = '';
    lastSubUrl.current = '';
    lastWebKey.current = '';
    webResolvedRef.current = false;
    guestPickedSourceRef.current = false;
    guestPickedSubRef.current = false;
    soloAutoplayDoneRef.current = false;
    triedSourceIdsRef.current = new Set();
    listedFullRef.current = [];
    wyzieTracksRef.current = [];
    vdrkTracksRef.current = [];
    setWyzieTracks([]);
    setVdrkTracks([]);
    setWyzieError(null);
    setStreamflixSources([]);
    streamflixSourcesRef.current = [];
    setActiveSourceId(null);
    setSelectedSubId(null);
    setCues([]);
  }, []);

  useEffect(() => {
    if (!room?.clock) return;
    setClock(room.clock);
    clockRef.current = room.clock;
  }, [room?.clock]);

  useEffect(() => {
    return subscribe((msg: ServerMessage) => {
      rtcOnMessageRef.current(msg);
      if (msg.type === 'error' && roomRef.current) setRoomError(msg.message);
      if (msg.type === 'state' && hostIsPresent(msg.room)) {
        setRoomError((prev) => (prev === 'Host is away' ? '' : prev));
      }
      if (msg.type === 'clock') {
        setClock(msg.clock);
        clockRef.current = msg.clock;
        if (!isHostRef.current) applyClock();
        return;
      }
      if (msg.type === 'control' && isHostRef.current) {
        const video = videoRef.current;
        if (msg.action === 'play') {
          void video?.play();
          send({ type: 'play' });
        } else if (msg.action === 'pause') {
          video?.pause();
          send({ type: 'pause' });
        } else if (msg.action === 'seek' && msg.positionSeconds != null && video) {
          video.currentTime = Math.max(0, msg.positionSeconds);
          send({ type: 'seek', positionSeconds: video.currentTime });
        }
        return;
      }
      if (msg.type === 'source' && !isHostRef.current) {
        const hostSourceId = msg.source?.sourceId;
        const webviewHost = roomRef.current
          ? isWebViewHostSource(roomRef.current)
          : false;
        const hostChanged =
          webviewHost ||
          (!!hostSourceId && hostSourceId !== activeSourceIdRef.current);
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
          if (isWebViewHostSource(roomRef.current)) {
            webResolvedRef.current = true;
            playViaProxy(roomRef.current);
            return;
          }
          const listed = streamflixSourcesRef.current;
          const listedMatch = hostSourceId
            ? listed.find((s) => s.id === hostSourceId)
            : undefined;
          if (listedMatch) {
            triedSourceIdsRef.current = new Set();
            void playStreamflixSource(roomRef.current, listedMatch, listed);
          } else {
            lastWebKey.current = '';
            void playRoom(roomRef.current);
          }
        }
        return;
      }
      if (msg.type === 'subtitles' && !isHostRef.current) {
        if (roomRef.current) {
          const active = streamflixSourcesRef.current.find(
            (s) => s.id === activeSourceIdRef.current,
          );
          applySubtitleOptions(active ?? null, roomRef.current);
        }
        if (!guestPickedSubRef.current) void loadSubtitles(msg.subtitles);
        return;
      }
      if (msg.type === 'browse' && !isHostRef.current) {
        resetPlaybackKeys();
        showWaiting('Host is picking something else…');
        return;
      }
      if (msg.type === 'content' && !isHostRef.current) {
        resetPlaybackKeys();
        showWaiting('Host switched title — waiting for stream…');
        return;
      }
      if (msg.type === 'episode' && !isHostRef.current) {
        resetPlaybackKeys();
        showWaiting('Host switched episode — waiting for stream…');
        return;
      }
      if (msg.type === 'reaction') {
        enqueueReaction(msg.from, msg.emoji);
        return;
      }
      if (msg.type === 'ended') {
        setRoomError(msg.reason || 'Room ended');
        showWaiting(msg.reason || 'Room ended');
        navigate('/');
      }
    });
  }, [
    applyClock,
    applySubtitleOptions,
    enqueueReaction,
    loadSubtitles,
    navigate,
    playRoom,
    playStreamflixSource,
    playViaProxy,
    resetPlaybackKeys,
    send,
    showWaiting,
    subscribe,
  ]);

  useEffect(() => {
    if (!isHost || solo) return;
    const id = window.setInterval(() => {
      const video = videoRef.current;
      send({
        type: 'heartbeat',
        positionSeconds: video?.currentTime ?? clockRef.current.positionSeconds,
        paused: video ? video.paused : clockRef.current.paused,
      });
    }, 2000);
    return () => window.clearInterval(id);
  }, [isHost, send, solo]);

  useEffect(() => {
    if (!partyRoom || role !== 'host') return;
    const video = videoRef.current;
    send({
      type: 'heartbeat',
      positionSeconds: video?.currentTime ?? clockRef.current.positionSeconds,
      paused: video ? video.paused : clockRef.current.paused,
    });
    const active = streamflixSourcesRef.current.find(
      (s) => s.id === activeSourceIdRef.current,
    );
    if (!active?.url) return;
    void registerPlaybackSource(partyRoom.code, {
      uri: active.url,
      kind: active.kind,
      subtitles: active.subtitles,
    });
    send({
      type: 'source',
      uri: active.url,
      kind: active.kind === 'hls' ? 'hls' : 'file',
      sourceId: active.id,
    });
    const selected = localSubOptionsRef.current.find(
      (t) => t.id === selectedSubIdRef.current,
    );
    if (selected?.url) {
      void registerSubtitleUrl(partyRoom.code, selected.url);
      send({
        type: 'subtitles',
        subtitles: {
          url: selected.url,
          language: (selected.language || 'en').slice(0, 16),
          display: selected.label.slice(0, 80),
          offsetSeconds: subOffset,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyRoom?.code, role, send]);

  // Resolve once per title/episode. Do not retrigger on clock/state ticks.
  const contentKey = room
    ? `${room.content.mediaType}|${room.content.tmdbId}|${room.content.imdbId ?? ''}|${room.content.season ?? ''}|${room.content.episode ?? ''}|${room.browsing ? 1 : 0}|${isHost ? 'h' : 'g'}`
    : '';
  useEffect(() => {
    if (!room) return;
    void playRoom(room);
    if (!guestPickedSubRef.current) void loadSubtitles(room.subtitles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey, playRoom, loadSubtitles]);

  useEffect(() => {
    const content = room?.content;
    if (!content?.tmdbId) return;
    let cancelled = false;
    wyzieTracksRef.current = [];
    vdrkTracksRef.current = [];
    setWyzieTracks([]);
    setVdrkTracks([]);
    setWyzieError(null);
    setWyzieLoading(true);
    const req = {
      tmdbId: content.tmdbId,
      season: content.season,
      episode: content.episode,
    };
    const sortTracks = (tracks: WyzieSubtitle[]) => {
      const lang = subtitleSettings.defaultLanguage;
      return [...tracks].sort((a, b) => {
        if (lang) {
          const aDefault = a.language === lang ? 0 : 1;
          const bDefault = b.language === lang ? 0 : 1;
          if (aDefault !== bDefault) return aDefault - bDefault;
        }
        return a.display.localeCompare(b.display);
      });
    };
    Promise.allSettled([searchWyzieSubtitles(req), searchVdrkSubtitles(req)])
      .then(([wyzie, vdrk]) => {
        if (cancelled) return;
        const wyzieList = wyzie.status === 'fulfilled' ? wyzie.value : [];
        const vdrkList = vdrk.status === 'fulfilled' ? vdrk.value : [];
        const wyzieSorted = sortTracks(wyzieList);
        const vdrkSorted = sortTracks(vdrkList);
        wyzieTracksRef.current = wyzieSorted;
        vdrkTracksRef.current = vdrkSorted;
        setWyzieTracks(wyzieSorted);
        setVdrkTracks(vdrkSorted);
        if (wyzie.status === 'rejected' && vdrkList.length === 0) {
          setWyzieError('Wyzie unavailable');
        }
      })
      .finally(() => {
        if (!cancelled) setWyzieLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    room?.content.mediaType,
    room?.content.tmdbId,
    room?.content.season,
    room?.content.episode,
    subtitleSettings.defaultLanguage,
  ]);

  useEffect(() => {
    const current = roomRef.current;
    if (!current) return;
    const source =
      streamflixSourcesRef.current.find((s) => s.id === activeSourceIdRef.current) ??
      null;
    applySubtitleOptions(source, current);
  }, [applySubtitleOptions, wyzieTracks, vdrkTracks, activeSourceId]);

  useEffect(() => {
    if (guestPickedSubRef.current) return;
    if (selectedSubId != null) return;
    if (!isHost && room?.subtitles?.url) return;
    const lang = subtitleSettings.defaultLanguage;
    if (!lang) return;
    const match = localSubOptions.find((t) => t.language === lang);
    if (match) handleSelectSubtitle(match.id, false);
  }, [
    handleSelectSubtitle,
    isHost,
    localSubOptions,
    room?.subtitles?.url,
    selectedSubId,
    subtitleSettings.defaultLanguage,
  ]);

  useEffect(() => {
    if (!playbackSession) return;
    const option = localSubOptionsRef.current.find(
      (t) => t.id === selectedSubIdRef.current,
    );
    if (option?.url && lastSubUrl.current !== option.url) {
      void loadSubtitleFile(option.url);
    }
  }, [loadSubtitleFile, playbackSession]);

  useEffect(() => {
    applyNativeAppleTrack();
  }, [
    applyNativeAppleTrack,
    cues,
    selectedSubId,
    subOffset,
    mode,
    isHost,
    room?.subtitles?.offsetSeconds,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !appleVideoPlayer) return;
    const apply = () => applyNativeAppleTrackRef.current();
    video.addEventListener('loadeddata', apply);
    video.addEventListener('webkitbeginfullscreen', apply);
    video.addEventListener('enterpictureinpicture', apply);
    return () => {
      video.removeEventListener('loadeddata', apply);
      video.removeEventListener('webkitbeginfullscreen', apply);
      video.removeEventListener('enterpictureinpicture', apply);
    };
  }, [appleVideoPlayer, mode]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
      const video = videoRef.current;
      if (video && modeRef.current === 'video') {
        setVideoTime(video.currentTime || 0);
        setDuration(video.duration || 0);
        applyClock();
        if (solo) {
          const next = {
            positionSeconds: video.currentTime || 0,
            paused: video.paused,
            updatedAt: Date.now(),
          };
          clockRef.current = next;
          setClock(next);
        }
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [applyClock, solo]);

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
    if (!room) {
      seenMembersRef.current = null;
      return;
    }
    const nextIds = new Set(room.members.map((m) => m.id));
    if (seenMembersRef.current == null) {
      seenMembersRef.current = nextIds;
      return;
    }
    let joinedName: string | null = null;
    for (const member of room.members) {
      if (!seenMembersRef.current.has(member.id) && member.id !== memberId) {
        joinedName = member.displayName;
      }
    }
    seenMembersRef.current = nextIds;
    if (!joinedName) return;
    setToast({ from: joinedName, text: 'joined' });
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [memberId, room]);

  useEffect(() => {
    if (!rtc.joined) setCallTilesHidden(false);
  }, [rtc.joined]);

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

  if (!room) return null;

  const t = mode === 'video' ? videoTime : predictedHostTime(clock, now);
  const hostOffset = Number(room.subtitles?.offsetSeconds);
  const offset = guestPickedSubRef.current || isHost
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
  const subtitle = [
    ep,
    cap,
    clock.paused ? 'Paused' : 'Playing',
    solo ? null : isHost ? 'Hosting' : 'Following host',
  ]
    .filter(Boolean)
    .join(' · ');
  const banner = !isHost && !hostIsPresent(room)
    ? 'Host is away'
    : roomError === 'Host is away'
      ? ''
      : roomError;

  const exitPlayer = () => {
    rtc.leaveCall();
    if (soloContent) {
      if (partyRoom) leaveRoom();
      const fromTvWatch =
        window.location.pathname.startsWith('/watch/tv/') ||
        soloContent.mediaType === 'tv';
      navigate(
        fromTvWatch
          ? `/title/tv/${soloContent.tmdbId}`
          : `/title/movie/${soloContent.tmdbId}`,
      );
      return;
    }
    if (isHost) {
      send({ type: 'browse' });
      navigate('/');
      return;
    }
    leaveRoom();
    navigate('/');
  };

  const leavePartyKeepWatching = () => {
    rtc.leaveCall();
    setMembersOpen(false);
    setLobbyOpen(false);
    if (soloContent) {
      leaveRoom();
      return;
    }
    if (isHost) {
      send({ type: 'browse' });
      navigate('/');
      return;
    }
    leaveRoom();
    navigate('/');
  };

  const onTogglePlay = () => {
    if (isHost) {
      const video = videoRef.current;
      if (clock.paused) {
        void video?.play();
        send({ type: 'play' });
      } else {
        video?.pause();
        send({ type: 'pause' });
      }
      return;
    }
    send({ type: 'control', action: clock.paused ? 'play' : 'pause' });
  };

  const onSeekTo = (positionSeconds: number) => {
    const next = Math.max(0, positionSeconds);
    if (isHost) {
      const video = videoRef.current;
      if (video) video.currentTime = next;
      send({ type: 'seek', positionSeconds: next });
      return;
    }
    send({ type: 'control', action: 'seek', positionSeconds: next });
  };

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
            if (isHostRef.current) {
              if (!clockRef.current.paused) void videoRef.current?.play();
              return;
            }
            if (!clockRef.current.paused) void playFollowingHost();
          }}
          onWaiting={() => reportBuffering(true)}
          onStalled={() => reportBuffering(true)}
          onCanPlay={() => {
            reportBuffering(false);
            void tryPlayWhenReady();
          }}
          onPlaying={() => {
            reportBuffering(false);
            const video = videoRef.current;
            if (!video) return;
            if (!needsUnmute) video.muted = false;
          }}
        />
        {mode === 'video' && videoBuffering ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
            <div className="size-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm font-medium text-primary">Buffering</p>
          </div>
        ) : null}
        {mode === 'iframe' && iframeUrl ? (
          <iframe
            title="Embed player"
            src={iframeUrl}
            allow="autoplay; fullscreen; playsinline"
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : null}
        <SubtitleOverlay
          text={nativeCaptionsActive ? null : (cue?.text ?? null)}
          controlsVisible={overlay.visible}
        />
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
          hidden={callTilesHidden}
          onToggleHidden={() => setCallTilesHidden((prev) => !prev)}
        />
        <ReactionOverlay items={reactions} onExpire={expireReaction} />
        <PlayerOverlay
          visible={overlay.visible}
          title={room.content.title || (solo ? 'Watch' : 'Watch party')}
          subtitle={subtitle}
          playing={!clock.paused}
          currentTime={t}
          duration={duration}
          fullscreen={fullscreen}
          partyCode={partyRoom?.code}
          onToggleOverlay={overlay.toggle}
          onInteract={onInteract}
          onBack={exitPlayer}
          onTogglePlay={onTogglePlay}
          onSeekBy={(seconds) => onSeekTo(predicted() + seconds)}
          onScrubEnd={(frac) => {
            if (!duration) return;
            onSeekTo(frac * duration);
          }}
          onOpenParty={
            soloContent
              ? () => {
                  onInteract();
                  if (partyRoom) setMembersOpen(true);
                  else setLobbyOpen(true);
                }
              : undefined
          }
          onOpenMembers={() => setMembersOpen(true)}
          onOpenChat={() => setChatOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onSelectReaction={partyRoom ? sendReaction : undefined}
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
          tilesHidden={callTilesHidden}
          onToggleTilesHidden={() => setCallTilesHidden((prev) => !prev)}
        />
        <ChatToast line={toast} onOpen={() => setChatOpen(true)} />
        <MembersSheet
          open={membersOpen}
          onOpenChange={(open) => {
            setMembersOpen(open);
            if (!open) closeSheets(false);
          }}
          container={sheetHost}
          code={partyRoom?.code ?? room.code}
          members={room.members}
          onLeave={leavePartyKeepWatching}
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
          subtitlesLoading={wyzieLoading}
          subtitlesError={wyzieError}
          subtitleOffset={subOffset}
          onChangeOffset={handleChangeOffset}
        />
        {soloContent ? (
          <HostLobby
            open={lobbyOpen}
            content={soloContent}
            clock={clock}
            playTogetherLabel="Done"
            onPlayTogether={() => setLobbyOpen(false)}
            onClose={() => setLobbyOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
};
