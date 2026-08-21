import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StatusBar, StyleSheet, useWindowDimensions } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Video, {
  SelectedTrackType,
  TextTrackType,
  type AudioTrack,
  type BufferConfig,
  type ISO639_1,
  type OnAudioTracksData,
  type OnLoadData,
  type OnProgressData,
  type OnPictureInPictureStatusChangedData,
  type OnVideoErrorData,
  type ReactVideoSource,
  type SelectedTrack,
  type TextTracks,
  type VideoRef,
} from 'react-native-video';
import { Box } from '@/components/ui/box';
import { Center } from '@/components/ui/center';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { PlayerControls } from '@/src/components/player/PlayerControls';
import { PlayerEpisodeDrawer } from '@/src/components/player/PlayerEpisodeDrawer';
import { PartyLobbyModal } from '@/src/components/party/PartyLobbyModal';
import { PlayerChatDrawer } from '@/src/components/party/PlayerChatDrawer';
import { PlayerChatToast } from '@/src/components/party/PlayerChatToast';
import { PartyCallOverlay } from '@/src/components/party/PartyCallOverlay';
import { PlayerPartyDrawer } from '@/src/components/party/PlayerPartyDrawer';
import { PlayerReactionOverlay } from '@/src/components/party/PlayerReactionOverlay';
import {
  appendFloatingReaction,
  isPartyReaction,
  type FloatingReaction,
} from '@/src/components/party/partyReactions';
import { WatchPartyIntroModal } from '@/src/components/party/WatchPartyIntroModal';
import { partyContentFromItem } from '@/src/party/content';
import {
  PlayerSettingsDrawer,
  type PlaybackSpeed,
} from '@/src/components/player/PlayerSettingsDrawer';
import {
  PIP_SUBTITLE_FONT_SIZE,
  SubtitleOverlay,
} from '@/src/components/player/SubtitleOverlay';
import {
  SeriesEndOverlay,
  UpNextOverlay,
  WatchNextOverlay,
} from '@/src/components/player/UpNextOverlay';
import { useControlsVisibility } from '@/src/components/player/useControlsVisibility';
import { useTVRemote } from '@/src/components/player/useTVRemote';
import { useContinueWatching } from '@/src/hooks/useContinueWatching';
import { useWatchParty } from '@/src/hooks/useWatchParty';
import { useDevicePlaybackLevels } from '@/src/hooks/useDevicePlaybackLevels';
import {
  PARTY_URI_MAX,
  isPartyStreamUri,
  partySourceKind,
  predictedHostTime,
  type PartyChatLine,
} from '@/src/party/protocol';
import {
  UP_NEXT_LEAD_SECONDS,
  useNextEpisode,
} from '@/src/hooks/useNextEpisode';
import { useWatchNextRecommendation } from '@/src/hooks/useWatchNextRecommendation';
import { usePlaybackSettings } from '@/src/hooks/usePlaybackSettings';
import { useServers } from '@/src/hooks/useServers';
import { useSubtitles } from '@/src/hooks/useSubtitles';
import { useSubtitleSettings } from '@/src/hooks/useSubtitleSettings';
import { toResizeMode, useVideoAspect } from '@/src/hooks/useVideoAspect';
import { useVideoQuality } from '@/src/hooks/useVideoQuality';
import { File } from 'expo-file-system';
import { fetchHlsVariants, type Variant } from '@/src/utils/hlsVariants';
import { playbackHeadersFor } from '@/src/services/playbackHeaders';
import type {
  StreamflixSource,
  StreamflixSubtitle,
} from '@/src/services/StreamflixService';
import type { WyzieSubtitle } from '@/src/services/WyzieService';
import { writeNativeVttCache } from '@/src/utils/nativeSubtitleCache';
import { WyzieService } from '@/src/services/WyzieService';
import type { LocalDownloadedSubtitle } from '@/src/services/DownloadService';
import type { Episode, MediaItem } from '@/src/types';
import { isTV } from '@/src/utils/tv';

const formatPlaybackUri = (url: string | null | undefined): string => {
  if (!url) return '';
  if (url.startsWith('/') && !url.startsWith('file://')) {
    return `file://${url}`;
  }
  return url;
};

interface PlayerCoreProps {
  source: ReactVideoSource;
  title: string;
  subtitle?: string;
  item: MediaItem;
  season?: number;
  episode?: number;
  imdbId?: string | null;
  resumeFrom?: number;
  onBack: () => void;
  onLeaveParty?: () => void;
  onSelectEpisode?: (season: number, episode: Episode) => void;
  onSelectServer?: (serverId: string, resumeFrom: number) => void;
  streamflixSources?: StreamflixSource[];
  activeStreamflixSourceId?: string | null;
  onSelectStreamflixSource?: (id: string, resumeFrom: number) => void;
  extractorSubtitles?: StreamflixSubtitle[];
  onPlaybackFailed?: (resumeFrom: number) => void;
  localSubtitles?: LocalDownloadedSubtitle[];
  onPlayRecommendation?: (item: MediaItem) => void;
}

const isPipSupported = (): boolean =>
  Platform.OS === 'ios' ||
  (Platform.OS === 'android' && Number(Platform.Version) >= 26);

const toAndroidBufferConfig = (forwardBufferSeconds: number): BufferConfig => {
  const minBufferMs = Math.round(forwardBufferSeconds * 1000);
  return {
    minBufferMs,
    maxBufferMs: Math.max(minBufferMs * 2, 50000),
    bufferForPlaybackMs: 2500,
    bufferForPlaybackAfterRebufferMs: 5000,
    cacheSizeMB: 200,
  };
};

type PlaybackStatus = 'loading' | 'ready' | 'error';

export const PlayerCore = ({
  source,
  title,
  subtitle,
  item,
  season,
  episode,
  imdbId,
  resumeFrom,
  onBack,
  onLeaveParty,
  onSelectEpisode,
  onSelectServer,
  streamflixSources = [],
  activeStreamflixSourceId,
  onSelectStreamflixSource,
  extractorSubtitles = [],
  onPlaybackFailed,
  localSubtitles,
  onPlayRecommendation,
}: PlayerCoreProps) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isFocused = useIsFocused();
  const { servers, activeServer } = useServers();
  const { upsert, advanceEpisode } = useContinueWatching();
  const {
    enabled: partyEnabled,
    role: partyRole,
    room: partyRoom,
    memberId: partyMemberId,
    chat: partyChat,
    displayName: partyDisplayName,
    send: sendParty,
    subscribe: subscribeParty,
    leaveRoom,
    rtc,
    joinNotice,
  } = useWatchParty();
  const [partyOpen, setPartyOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [chatToast, setChatToast] = useState<PartyChatLine | null>(null);
  const prevChatLen = useRef(0);
  const [partyIntroOpen, setPartyIntroOpen] = useState(false);
  const [partyLobbyOpen, setPartyLobbyOpen] = useState(false);
  const [callTilesHidden, setCallTilesHidden] = useState(false);
  const waitingForGuestsRef = useRef(false);
  const lastSavedRef = useRef(0);
  const didResumeRef = useRef(false);
  const advancingRef = useRef(false);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [episodesOpen, setEpisodesOpen] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<PlaybackSpeed>(1);
  const {
    volume,
    setVolume,
    brightness,
    onBrightnessChange: handleBrightnessChange,
    videoVolume,
  } = useDevicePlaybackLevels();
  const { aspect, setAspect } = useVideoAspect();
  const videoRef = useRef<VideoRef>(null);
  const isTVShow = item.media_type === 'tv';
  const pipSupported = isPipSupported();
  const enterPip = useCallback(() => {
    videoRef.current?.enterPictureInPicture();
  }, []);

  const handleSelectServer = useCallback(
    (id: string) => {
      onSelectServer?.(id, currentTimeRef.current);
    },
    [onSelectServer],
  );

  const handleSelectStreamflixSource = useCallback(
    (id: string) => {
      onSelectStreamflixSource?.(id, currentTimeRef.current);
    },
    [onSelectStreamflixSource],
  );

  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [selectedAudioIndex, setSelectedAudioIndex] = useState<number | null>(
    null,
  );
  const onAudioTracks = useCallback((data: OnAudioTracksData) => {
    setAudioTracks(data.audioTracks ?? []);
  }, []);

  const extraSubtitleTracks = useMemo<WyzieSubtitle[]>(
    () =>
      extractorSubtitles
        .filter((t) => t.file)
        .map((t, i) => ({
          id: `stream:${i}:${t.file}`,
          url: t.file,
          display: `${t.label} (stream)`,
          language: t.label.slice(0, 2).toLowerCase(),
          format: 'srt',
        })),
    [extractorSubtitles],
  );

  const autoplayNextEnabled = isTVShow && !!onSelectEpisode;
  const { nextEpisode: nextEpisodeInfo, loading: nextEpisodeLoading } =
    useNextEpisode(item, season, episode, autoplayNextEnabled);
  const [upNextDismissed, setUpNextDismissed] = useState(false);
  const [seriesEnded, setSeriesEnded] = useState(false);
  const [pendingAdvance, setPendingAdvance] = useState(false);
  const watchNextEnabled =
    !isTV && !partyRoom && !!onPlayRecommendation;
  const { recommendation, loading: recommendationLoading } =
    useWatchNextRecommendation(item, watchNextEnabled);
  const [showWatchNext, setShowWatchNext] = useState(false);
  const [pendingWatchNext, setPendingWatchNext] = useState(false);

  const sourceObj = typeof source === 'object' && source ? source : null;
  const rawMasterUri = typeof sourceObj?.uri === 'string' ? sourceObj.uri : null;
  const masterUri = useMemo(() => formatPlaybackUri(rawMasterUri), [rawMasterUri]);
  const isHls =
    !!masterUri && (sourceObj?.type === 'm3u8' || masterUri.includes('.m3u8') || masterUri.startsWith('file://'));
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariantUri, setSelectedVariantUri] = useState<string | null>(
    null,
  );
  const didApplyInitialQualityRef = useRef(false);
  const { pickInitial: pickInitialVariant } = useVideoQuality();

  const { effectiveForwardBufferSeconds } = usePlaybackSettings();
  const initialForwardBufferSecondsRef = useRef(effectiveForwardBufferSeconds);
  const androidBufferConfigRef = useRef<BufferConfig | undefined>(
    Platform.OS === 'android'
      ? toAndroidBufferConfig(initialForwardBufferSecondsRef.current)
      : undefined,
  );

  const { settings: subtitleSettings } = useSubtitleSettings();
  const nativeSubtitlesEnabled = subtitleSettings.renderMode === 'native';
  const useNativeSidecar =
    nativeSubtitlesEnabled && !(Platform.OS === 'ios' && isHls);

  const {
    tracks: wyzieTracks,
    selectedId: wyzieSelectedId,
    selectedTrack: selectedWyzieTrack,
    selectTrack: selectWyzieTrack,
    cueAt,
    loading: loadingWyzieTracks,
    error: wyzieError,
  } = useSubtitles({
    tmdbId: item.id,
    season,
    episode,
    loadCues: !useNativeSidecar,
    defaultLanguage: subtitleSettings.defaultLanguage,
    localTracks: localSubtitles,
    format: 'srt',
    extraTracks: extraSubtitleTracks,
  });

  const subtitleTrackOptions = wyzieTracks.map((t) => ({
    id: t.id,
    label: `${t.display}${t.isHearingImpaired ? ' (CC)' : ''}`,
  }));
  const subtitlesActive = wyzieSelectedId != null;

  const selectedWyzieTrackId = selectedWyzieTrack?.id ?? null;
  const selectedWyzieIsLocal =
    selectedWyzieTrack != null && 'localUri' in selectedWyzieTrack;
  const selectedWyzieSourceUri = selectedWyzieTrack
    ? selectedWyzieIsLocal
      ? selectedWyzieTrack.localUri
      : selectedWyzieTrack.url
    : null;

  const settingsActive =
    playbackRate !== 1 ||
    subtitlesActive ||
    selectedVariantUri != null ||
    aspect !== 'contain';

  const [subtitleOffsetSeconds, setSubtitleOffsetSeconds] = useState(0);
  useEffect(() => {
    setSubtitleOffsetSeconds(0);
  }, [wyzieSelectedId]);

  useEffect(() => {
    if (partyRole !== 'host') return;
    const uri = selectedVariantUri ?? masterUri;
    if (!uri || !isPartyStreamUri(uri)) return;
    const headers = playbackHeadersFor(activeServer);
    sendParty({
      type: 'source',
      uri: uri.slice(0, PARTY_URI_MAX),
      kind: partySourceKind(uri),
      referer: headers.Referer.slice(0, PARTY_URI_MAX),
      origin: headers.Origin.slice(0, PARTY_URI_MAX),
      ...(activeStreamflixSourceId
        ? { sourceId: activeStreamflixSourceId.slice(0, 80) }
        : {}),
    });
  }, [
    partyRole,
    selectedVariantUri,
    masterUri,
    sendParty,
    activeServer,
    activeStreamflixSourceId,
  ]);

  useEffect(() => {
    if (partyRole !== 'host') return;
    if (!selectedWyzieTrack || selectedWyzieIsLocal) {
      sendParty({ type: 'subtitles', subtitles: null });
      return;
    }
    sendParty({
      type: 'subtitles',
      subtitles: {
        url: selectedWyzieTrack.url.slice(0, PARTY_URI_MAX),
        language: selectedWyzieTrack.language,
        display: selectedWyzieTrack.display,
        offsetSeconds: subtitleOffsetSeconds,
      },
    });
  }, [
    partyRole,
    selectedWyzieTrack,
    selectedWyzieIsLocal,
    subtitleOffsetSeconds,
    sendParty,
  ]);

  const [nativeRawText, setNativeRawText] = useState<string | null>(null);
  const [nativeVttUri, setNativeVttUri] = useState<string | null>(null);
  const [nativeVttTrackId, setNativeVttTrackId] = useState<string | null>(null);

  useEffect(() => {
    if (!useNativeSidecar || !selectedWyzieTrackId || !selectedWyzieSourceUri) {
      setNativeRawText(null);
      setNativeVttUri(null);
      setNativeVttTrackId(null);
      return;
    }

    const trackId = selectedWyzieTrackId;
    const sourceUri = selectedWyzieSourceUri;
    const isLocal = selectedWyzieIsLocal;
    let cancelled = false;

    void (async () => {
      try {
        const raw = isLocal
          ? await new File(sourceUri).text()
          : await WyzieService.fetchSubtitleText(sourceUri);
        if (cancelled) return;
        setNativeRawText(raw);
        setNativeVttTrackId(trackId);
      } catch {
        if (!cancelled) {
          setNativeRawText(null);
          setNativeVttUri(null);
          setNativeVttTrackId(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    useNativeSidecar,
    selectedWyzieTrackId,
    selectedWyzieSourceUri,
    selectedWyzieIsLocal,
  ]);

  useEffect(() => {
    if (
      !useNativeSidecar ||
      !selectedWyzieTrackId ||
      !nativeRawText ||
      nativeVttTrackId !== selectedWyzieTrackId
    ) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const uri = await writeNativeVttCache(
            selectedWyzieTrackId,
            nativeRawText,
            subtitleOffsetSeconds,
          );
          if (!cancelled) setNativeVttUri(uri);
        } catch {
          if (!cancelled) setNativeVttUri(null);
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    useNativeSidecar,
    selectedWyzieTrackId,
    nativeRawText,
    nativeVttTrackId,
    subtitleOffsetSeconds,
  ]);

  const sidecarTextTracks = useMemo<TextTracks | undefined>(() => {
    if (!useNativeSidecar || !nativeVttUri || !selectedWyzieTrack) {
      return undefined;
    }
    if (nativeVttTrackId !== selectedWyzieTrack.id) return undefined;
    const language = /^[a-z]{2}$/i.test(selectedWyzieTrack.language)
      ? selectedWyzieTrack.language.toLowerCase()
      : 'en';
    return [
      {
        title: selectedWyzieTrack.display,
        language: language as ISO639_1,
        type: TextTrackType.VTT,
        uri: nativeVttUri,
      },
    ];
  }, [useNativeSidecar, nativeVttUri, nativeVttTrackId, selectedWyzieTrack]);

  const selectedTextTrack: SelectedTrack | undefined = useMemo(() => {
    if (!useNativeSidecar) return undefined;
    if (!selectedWyzieTrack || !sidecarTextTracks?.length) {
      return { type: SelectedTrackType.DISABLED };
    }
    return { type: SelectedTrackType.INDEX, value: 0 };
  }, [useNativeSidecar, selectedWyzieTrack, sidecarTextTracks]);

  const [paused, setPaused] = useState(partyRole === 'guest');
  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  const isPlaying = !paused;
  const [status, setStatus] = useState<PlaybackStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playableDuration, setPlayableDuration] = useState(0);
  const buffered =
    duration > 0 && playableDuration > 0 ? playableDuration / duration : 0;

  const activeCue = useNativeSidecar
    ? null
    : cueAt(currentTime - subtitleOffsetSeconds);

  const controlsHold =
    settingsOpen ||
    episodesOpen ||
    partyOpen ||
    chatOpen ||
    partyIntroOpen ||
    partyLobbyOpen;
  const { visible, show, toggle } = useControlsVisibility(isPlaying, controlsHold);

  const remaining = duration > 0 ? duration - currentTime : Infinity;
  const showUpNext =
    autoplayNextEnabled &&
    !!nextEpisodeInfo &&
    !upNextDismissed &&
    !seriesEnded &&
    remaining <= UP_NEXT_LEAD_SECONDS &&
    remaining > 0;

  const playNextEpisode = useCallback(() => {
    if (nextEpisodeInfo) {
      advancingRef.current = true;
      advanceEpisode(
        item,
        nextEpisodeInfo.season,
        nextEpisodeInfo.episode.episode_number,
      );
      onSelectEpisode?.(nextEpisodeInfo.season, nextEpisodeInfo.episode);
    }
  }, [nextEpisodeInfo, onSelectEpisode, advanceEpisode, item]);

  const onEnd = useCallback(() => {
    if (autoplayNextEnabled) {
      setPendingAdvance(true);
      return;
    }
    if (watchNextEnabled) setPendingWatchNext(true);
  }, [autoplayNextEnabled, watchNextEnabled]);

  const offerWatchNext = useCallback(() => {
    if (recommendation) {
      setPaused(true);
      setShowWatchNext(true);
      return true;
    }
    return false;
  }, [recommendation]);

  useEffect(() => {
    if (!pendingAdvance || nextEpisodeLoading) return;
    if (!nextEpisodeInfo && watchNextEnabled && recommendationLoading) return;
    setPendingAdvance(false);
    if (nextEpisodeInfo) {
      if (!upNextDismissed) playNextEpisode();
    } else if (!watchNextEnabled || !offerWatchNext()) {
      setSeriesEnded(true);
    }
  }, [
    pendingAdvance,
    nextEpisodeLoading,
    nextEpisodeInfo,
    upNextDismissed,
    playNextEpisode,
    watchNextEnabled,
    recommendationLoading,
    offerWatchNext,
  ]);

  useEffect(() => {
    if (!pendingWatchNext || recommendationLoading) return;
    setPendingWatchNext(false);
    if (!offerWatchNext()) {
      // No similar title fallback
    }
  }, [pendingWatchNext, recommendationLoading, offerWatchNext]);

  useEffect(() => {
    if (!seriesEnded) return;
    const timer = setTimeout(onBack, 2500);
    return () => clearTimeout(timer);
  }, [seriesEnded, onBack]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
    durationRef.current = duration;
  }, [currentTime, duration]);

  useEffect(() => {
    if (!isHls || !masterUri) {
      setVariants([]);
      return;
    }
    let cancelled = false;
    fetchHlsVariants(masterUri, sourceObj?.headers).then((v) => {
      if (!cancelled) setVariants(v);
    });
    return () => {
      cancelled = true;
    };
  }, [isHls, masterUri, sourceObj?.headers]);

  const activeUriRef = useRef<string | null>(masterUri);
  const activeTextTracksRef = useRef<TextTracks | undefined>(undefined);
  const pendingSeekRef = useRef<number | null>(null);
  const sidecarReloadInFlightRef = useRef(false);
  const sidecarResumeSecRef = useRef<number | null>(null);
  const sidecarWasPlayingRef = useRef(false);

  const buildSource = useCallback(
    (uri: string, textTracks: TextTracks | undefined): ReactVideoSource => {
      const formatted = formatPlaybackUri(uri);
      const isLocal = formatted.startsWith('file://') || formatted.includes('.m3u8');
      return {
        ...(sourceObj ?? {}),
        uri: formatted,
        type: isLocal ? 'm3u8' : undefined,
        bufferConfig: androidBufferConfigRef.current,
        textTracks,
      };
    },
    [sourceObj],
  );

  const [initialSource] = useState<ReactVideoSource>(() =>
    buildSource(masterUri ?? '', undefined),
  );

  const swapToUri = useCallback(
    (nextUri: string) => {
      if (!sourceObj) return;
      pendingSeekRef.current = currentTimeRef.current;
      activeUriRef.current = nextUri;
      videoRef.current?.setSource(
        buildSource(nextUri, activeTextTracksRef.current),
      );
    },
    [sourceObj, buildSource],
  );

  useEffect(() => {
    if (didApplyInitialQualityRef.current) return;
    if (!variants.length) return;
    const initial = pickInitialVariant(variants);
    didApplyInitialQualityRef.current = true;
    if (!initial) return;
    setSelectedVariantUri(initial.uri);
    swapToUri(initial.uri);
  }, [variants, pickInitialVariant, swapToUri]);

  const onSelectQuality = useCallback(
    (variant: Variant | null) => {
      if (!masterUri) return;
      const nextUri = variant?.uri ?? masterUri;
      setSelectedVariantUri(variant?.uri ?? null);
      swapToUri(nextUri);
    },
    [masterUri, swapToUri],
  );

  const finishSidecarResume = useCallback(() => {
    const resumeAt =
      sidecarResumeSecRef.current ?? pendingSeekRef.current ?? null;
    if (resumeAt != null && resumeAt > 0) {
      videoRef.current?.seek(resumeAt);
      currentTimeRef.current = resumeAt;
      setCurrentTime(resumeAt);
    }
    pendingSeekRef.current = null;
    sidecarResumeSecRef.current = null;
    if (sidecarReloadInFlightRef.current) {
      sidecarReloadInFlightRef.current = false;
      if (sidecarWasPlayingRef.current) {
        setPaused(false);
      }
      sidecarWasPlayingRef.current = false;
    }
  }, []);

  const lastSidecarKeyRef = useRef<string>('');
  useEffect(() => {
    if (!useNativeSidecar) return;
    const tracks =
      sidecarTextTracks && sidecarTextTracks.length
        ? sidecarTextTracks
        : undefined;
    const key = tracks?.map((t) => t.uri).join('|') ?? '__none__';
    if (key === lastSidecarKeyRef.current) return;
    lastSidecarKeyRef.current = key;
    activeTextTracksRef.current = tracks;
    const uri = activeUriRef.current;
    if (!uri) return;

    let cancelled = false;
    void (async () => {
      let resumeAt = currentTimeRef.current;
      try {
        const pos = await videoRef.current?.getCurrentPosition?.();
        if (typeof pos === 'number' && Number.isFinite(pos) && pos > 0) {
          resumeAt = pos;
        }
      } catch {
        // Keep snapshot
      }
      if (cancelled) return;

      if (resumeAt > 1) {
        sidecarReloadInFlightRef.current = true;
        sidecarResumeSecRef.current = resumeAt;
        sidecarWasPlayingRef.current = !pausedRef.current;
        pendingSeekRef.current = resumeAt;
        currentTimeRef.current = resumeAt;
        setCurrentTime(resumeAt);
        setPaused(true);
      }

      videoRef.current?.setSource(buildSource(uri, tracks));
    })();

    return () => {
      cancelled = true;
    };
  }, [useNativeSidecar, sidecarTextTracks, buildSource]);

  const onLoad = useCallback(
    (e: OnLoadData) => {
      setStatus('ready');
      setDuration(e.duration);
      if (
        sidecarReloadInFlightRef.current ||
        pendingSeekRef.current != null
      ) {
        finishSidecarResume();
      } else if (!didResumeRef.current && resumeFrom != null && resumeFrom > 0) {
        didResumeRef.current = true;
        videoRef.current?.seek(resumeFrom);
      }
    },
    [resumeFrom, finishSidecarResume],
  );

  const onError = useCallback(
    (e: OnVideoErrorData) => {
      setStatus('error');
      const err = e.error;
      setErrorMessage(
        err?.localizedDescription ||
          err?.errorString ||
          err?.error ||
          'The source could not be loaded.',
      );
      onPlaybackFailed?.(currentTimeRef.current);
    },
    [onPlaybackFailed],
  );

  const onProgress = useCallback(
    (e: OnProgressData) => {
      setPlayableDuration(e.playableDuration);
      if (sidecarReloadInFlightRef.current) {
        const resumeAt = sidecarResumeSecRef.current;
        if (resumeAt != null && resumeAt > 1 && e.currentTime < 1) {
          videoRef.current?.seek(resumeAt);
          return;
        }
        if (resumeAt != null && Math.abs(e.currentTime - resumeAt) < 1.5) {
          finishSidecarResume();
          return;
        }
        return;
      }
      setCurrentTime(e.currentTime);
    },
    [finishSidecarResume],
  );

  const onPipStatusChanged = useCallback(
    (e: OnPictureInPictureStatusChangedData) => {
      setPipActive(e.isActive);
    },
    [],
  );

  const saveProgress = useCallback(() => {
    const pos = currentTimeRef.current;
    const dur = durationRef.current;
    if (pos < 5) return;
    upsert({ item, position: pos, duration: dur, season, episode });
  }, [upsert, item, season, episode]);

  useEffect(() => {
    if (currentTime - lastSavedRef.current < 5) return;
    lastSavedRef.current = currentTime;
    saveProgress();
  }, [currentTime, saveProgress]);

  useEffect(() => {
    return () => {
      if (advancingRef.current) return;
      saveProgress();
    };
  }, [saveProgress]);

  const togglePlay = useCallback(() => {
    if (partyRole === 'guest') return;
    setPaused((p) => {
      const next = !p;
      if (partyRole === 'host') {
        sendParty({ type: next ? 'pause' : 'play' });
      }
      return next;
    });
    show();
  }, [show, partyRole, sendParty]);

  const seekBy = useCallback(
    (seconds: number) => {
      if (partyRole === 'guest') return;
      const next = Math.max(0, currentTimeRef.current + seconds);
      videoRef.current?.seek(next);
      if (partyRole === 'host') {
        sendParty({ type: 'seek', positionSeconds: next });
      }
      show();
    },
    [show, partyRole, sendParty],
  );

  const seekToFraction = useCallback(
    (value: number) => {
      if (partyRole === 'guest') return;
      if (duration > 0) {
        const next = value * duration;
        videoRef.current?.seek(next);
        if (partyRole === 'host') {
          sendParty({ type: 'seek', positionSeconds: next });
        }
      }
    },
    [duration, partyRole, sendParty],
  );

  useEffect(() => {
    if (partyRole !== 'host') return;
    const id = setInterval(() => {
      sendParty({
        type: 'heartbeat',
        positionSeconds: currentTimeRef.current,
        paused: pausedRef.current,
      });
    }, 2000);
    return () => clearInterval(id);
  }, [partyRole, sendParty]);

  useEffect(() => {
    return subscribeParty((msg) => {
      if (msg.type === 'clock' && partyRole === 'guest') {
        setPaused(msg.clock.paused);
        const target = predictedHostTime(msg.clock);
        if (Math.abs(currentTimeRef.current - target) > 1.5) {
          videoRef.current?.seek(target);
        }
      }
      if (msg.type === 'control' && partyRole === 'host') {
        if (msg.action === 'play') {
          setPaused(false);
          sendParty({ type: 'play' });
        } else if (msg.action === 'pause') {
          setPaused(true);
          sendParty({ type: 'pause' });
        } else if (msg.action === 'seek' && msg.positionSeconds != null) {
          videoRef.current?.seek(msg.positionSeconds);
          sendParty({ type: 'seek', positionSeconds: msg.positionSeconds });
        }
      }
    });
  }, [subscribeParty, partyRole, sendParty]);

  useEffect(() => {
    if (partyRole !== 'host' || !partyRoom) return;
    const waiting = partyRoom.members.some(
      (m) => m.buffering && m.id !== partyMemberId,
    );
    if (waiting && !pausedRef.current) {
      waitingForGuestsRef.current = true;
      setPaused(true);
      sendParty({ type: 'pause' });
    } else if (!waiting && waitingForGuestsRef.current) {
      waitingForGuestsRef.current = false;
      setPaused(false);
      sendParty({ type: 'play' });
    }
  }, [partyRole, partyRoom, partyMemberId, sendParty]);

  const onBuffer = useCallback(
    (e: { isBuffering?: boolean }) => {
      if (!partyRole) return;
      sendParty({ type: 'buffering', buffering: !!e.isBuffering });
    },
    [partyRole, sendParty],
  );

  useEffect(() => {
    if (chatOpen) {
      setChatToast(null);
      prevChatLen.current = partyChat.length;
      return;
    }
    if (partyChat.length <= prevChatLen.current) {
      prevChatLen.current = partyChat.length;
      return;
    }
    prevChatLen.current = partyChat.length;
    const line = partyChat[partyChat.length - 1];
    if (!line) return;
    setChatToast(line);
    const id = setTimeout(() => setChatToast(null), 4000);
    return () => clearTimeout(id);
  }, [partyChat, chatOpen]);

  const enqueueReaction = useCallback((from: string, emoji: string) => {
    if (!isPartyReaction(emoji)) return;
    setReactions((prev) => appendFloatingReaction(prev, { from, emoji }));
  }, []);

  const expireReaction = useCallback((id: string) => {
    setReactions((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const sendReaction = useCallback(
    (emoji: string) => {
      if (!isPartyReaction(emoji)) return;
      sendParty({ type: 'reaction', emoji });
      enqueueReaction(partyDisplayName, emoji);
      show();
    },
    [enqueueReaction, partyDisplayName, sendParty, show],
  );

  useEffect(() => {
    if (!rtc.joined) setCallTilesHidden(false);
  }, [rtc.joined]);

  useEffect(() => {
    if (!partyRoom) {
      setReactions([]);
      return;
    }
    return subscribeParty((msg) => {
      if (msg.type === 'reaction') enqueueReaction(msg.from, msg.emoji);
    });
  }, [enqueueReaction, partyRoom, subscribeParty]);

  const overlayOpen =
    settingsOpen ||
    episodesOpen ||
    partyOpen ||
    chatOpen ||
    partyIntroOpen ||
    partyLobbyOpen ||
    showUpNext ||
    seriesEnded ||
    showWatchNext;

  useTVRemote({
    onSelect: undefined,
    onPlayPause: overlayOpen ? undefined : togglePlay,
    onLeft: overlayOpen || visible ? undefined : () => seekBy(-10),
    onRight: overlayOpen || visible ? undefined : () => seekBy(10),
    onUp: overlayOpen ? undefined : show,
    onDown: overlayOpen ? undefined : show,
  });

  const [scrubPreview, setScrubPreview] = useState<number | null>(null);
  const displayTime =
    scrubPreview != null ? scrubPreview * duration : currentTime;

  return (
    <Box className={`flex-1 bg-black ${isTV ? '' : 'overflow-hidden'}`}>
      <StatusBar hidden />
      {isFocused && (
        <Video
          ref={videoRef}
          source={initialSource}
          style={
            isTV
              ? StyleSheet.absoluteFill
              : { width: windowWidth, height: windowHeight }
          }
          controls={Platform.OS === 'ios'}
          fullscreen={Platform.OS === 'ios'}
          fullscreenAutorotate={true}
          fullscreenOrientation="landscape"
          allowsExternalPlayback={true}
          pictureInPicture={true}
          playInBackground={true}
          resizeMode={toResizeMode(aspect)}
          pointerEvents={Platform.OS === 'ios' ? 'auto' : 'none'}
          paused={paused}
          rate={playbackRate}
          volume={videoVolume}
          progressUpdateInterval={500}
          preferredForwardBufferDuration={
            Platform.OS === 'ios'
              ? initialForwardBufferSecondsRef.current
              : undefined
          }
          selectedTextTrack={selectedTextTrack}
          subtitleStyle={{
            fontSize: pipActive
              ? Math.min(PIP_SUBTITLE_FONT_SIZE, subtitleSettings.fontSize)
              : subtitleSettings.fontSize,
            opacity:
              Platform.OS === 'ios'
                ? 1
                : Math.min(
                    1,
                    Math.max(0.2, subtitleSettings.backgroundOpacity || 1),
                  ),
            paddingBottom: pipActive
              ? 8
              : Platform.OS === 'android'
                ? visible
                  ? 96
                  : 40
                : visible
                  ? 72
                  : 24,
            subtitlesFollowVideo: aspect === 'contain',
          }}
          enterPictureInPictureOnLeave
          onLoadStart={() => setStatus('loading')}
          onLoad={onLoad}
          onAudioTracks={onAudioTracks}
          selectedAudioTrack={
            selectedAudioIndex != null
              ? { type: SelectedTrackType.INDEX, value: selectedAudioIndex }
              : undefined
          }
          onError={onError}
          onEnd={onEnd}
          onProgress={onProgress}
          onBuffer={onBuffer}
          onPictureInPictureStatusChanged={onPipStatusChanged}
        />
      )}

      {status === 'loading' && (
        <Center style={StyleSheet.absoluteFill} pointerEvents="none">
          <Spinner size="large" color="#E50914" />
        </Center>
      )}

      {status === 'error' && (
        <Center
          style={StyleSheet.absoluteFill}
          className="px-8"
          pointerEvents="none"
        >
          <Text className="text-center text-foreground" bold>
            Unable to play this video
          </Text>
          <Text size="sm" className="mt-2 text-center text-muted-foreground">
            {errorMessage ?? 'The source could not be loaded.'}
          </Text>
        </Center>
      )}

      <SubtitleOverlay
        text={activeCue?.text ?? null}
        controlsVisible={visible}
        pipActive={pipActive}
      />

      {!pipActive && seriesEnded && <SeriesEndOverlay />}

      {!pipActive && !seriesEnded && showWatchNext && recommendation && (
        <WatchNextOverlay
          item={recommendation}
          onPlay={() => onPlayRecommendation?.(recommendation)}
          onClose={() => setShowWatchNext(false)}
        />
      )}

      {!pipActive && !seriesEnded && showUpNext && nextEpisodeInfo && (
        <UpNextOverlay
          season={nextEpisodeInfo.season}
          episode={nextEpisodeInfo.episode}
          secondsRemaining={remaining}
          onPlayNow={playNextEpisode}
          onCancel={() => setUpNextDismissed(true)}
        />
      )}

      {!pipActive &&
        !seriesEnded &&
        !showWatchNext &&
        !showUpNext &&
        Platform.OS !== 'ios' &&
        (visible ? (
          <PlayerControls
            title={title}
            subtitle={subtitle}
            playing={isPlaying}
            currentTime={displayTime}
            duration={duration}
            buffered={buffered}
            onOverlayPress={toggle}
            onBack={onBack}
            onTogglePlay={togglePlay}
            onSeekBy={seekBy}
            onScrub={(v) => {
              setScrubPreview(v);
              show();
            }}
            onScrubEnd={(v) => {
              seekToFraction(v);
              setScrubPreview(null);
            }}
            onOpenEpisodes={
              isTVShow && onSelectEpisode
                ? () => {
                    setEpisodesOpen(true);
                    show();
                  }
                : undefined
            }
            onOpenSettings={() => {
              setSettingsOpen(true);
              show();
            }}
            settingsActive={settingsActive}
            volume={volume}
            onVolumeChange={setVolume}
            brightness={brightness}
            onBrightnessChange={
              brightness != null ? handleBrightnessChange : undefined
            }
            onEnterPip={pipSupported ? enterPip : undefined}
            partyCode={partyRoom?.code}
            partyLocked={partyRole === 'guest'}
            onOpenParty={
              partyEnabled
                ? () => {
                    if (partyRoom) setPartyOpen(true);
                    else setPartyIntroOpen(true);
                    show();
                  }
                : undefined
            }
            onOpenChat={
              partyRoom
                ? () => {
                    setChatOpen(true);
                    show();
                  }
                : undefined
            }
            onSelectReaction={partyRoom ? sendReaction : undefined}
          />
        ) : overlayOpen ? null : (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={show}
            focusable
            hasTVPreferredFocus
          />
        ))}

      <PlayerSettingsDrawer
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        servers={servers}
        activeServerId={activeServer.id}
        onSelectServer={onSelectServer ? handleSelectServer : undefined}
        streamflixSources={streamflixSources}
        activeStreamflixSourceId={activeStreamflixSourceId}
        onSelectStreamflixSource={
          onSelectStreamflixSource ? handleSelectStreamflixSource : undefined
        }
        audioTracks={audioTracks.map((t, i) => ({
          index: t.index ?? i,
          label:
            t.title ||
            t.language ||
            `Track ${(t.index ?? i) + 1}`,
        }))}
        selectedAudioIndex={selectedAudioIndex}
        onSelectAudio={setSelectedAudioIndex}
        variants={variants}
        selectedVariantUri={selectedVariantUri}
        onSelectQuality={onSelectQuality}
        aspect={aspect}
        onSelectAspect={setAspect}
        playbackRate={playbackRate}
        onSelectSpeed={setPlaybackRate}
        subtitleTracks={subtitleTrackOptions}
        selectedSubtitleId={wyzieSelectedId}
        subtitlesLoading={loadingWyzieTracks}
        subtitlesError={wyzieError}
        onSelectSubtitle={selectWyzieTrack}
        subtitleOffsetSeconds={subtitleOffsetSeconds}
        onChangeSubtitleOffset={setSubtitleOffsetSeconds}
      />

      {isTVShow && onSelectEpisode && (
        <PlayerEpisodeDrawer
          visible={episodesOpen}
          item={item}
          currentSeason={season}
          currentEpisode={episode}
          onSelect={(s, ep) => {
            setEpisodesOpen(false);
            onSelectEpisode(s, ep);
          }}
          onClose={() => setEpisodesOpen(false)}
        />
      )}

      {partyRoom && partyRole && !pipActive && rtc.joined && (
        <PartyCallOverlay
          localStreamURL={rtc.localStreamURL}
          remotes={rtc.remotes}
          camOff={rtc.camOff}
          hidden={callTilesHidden}
          onToggleHidden={() => setCallTilesHidden((prev) => !prev)}
        />
      )}

      {partyRoom && partyRole && !pipActive && (
        <PlayerReactionOverlay items={reactions} onExpire={expireReaction} />
      )}

      {partyRoom && partyRole && !pipActive && (
        <PlayerChatToast
          line={
            joinNotice
              ? { from: joinNotice, text: 'joined' }
              : chatToast
          }
          onOpen={() => setChatOpen(true)}
        />
      )}

      {partyRoom && partyRole && (
        <>
          <PlayerPartyDrawer
            visible={partyOpen}
            room={partyRoom}
            role={partyRole}
            rtc={rtc}
            tilesHidden={callTilesHidden}
            onToggleTilesHidden={() => setCallTilesHidden((prev) => !prev)}
            onLeave={() => {
              setPartyOpen(false);
              setChatOpen(false);
              setReactions([]);
              if (onLeaveParty) {
                onLeaveParty();
                return;
              }
              leaveRoom();
              onBack();
            }}
            onClose={() => setPartyOpen(false)}
          />
          <PlayerChatDrawer
            visible={chatOpen}
            chat={partyChat}
            onSend={(text) => sendParty({ type: 'chat', text })}
            onClose={() => setChatOpen(false)}
          />
        </>
      )}
      <WatchPartyIntroModal
        visible={partyIntroOpen}
        onContinue={() => {
          setPartyIntroOpen(false);
          setPartyLobbyOpen(true);
        }}
        onDismiss={() => setPartyIntroOpen(false)}
      />
      <PartyLobbyModal
        visible={partyLobbyOpen}
        content={
          partyLobbyOpen
            ? partyContentFromItem(item, season, episode, imdbId)
            : null
        }
        clock={{
          positionSeconds: currentTimeRef.current,
          paused: pausedRef.current,
          updatedAt: Date.now(),
        }}
        playTogetherLabel="Done"
        onPlayTogether={() => {
          setPartyLobbyOpen(false);
          setPartyOpen(true);
        }}
        onClose={() => setPartyLobbyOpen(false)}
      />
    </Box>
  );
};
