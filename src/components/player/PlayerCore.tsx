import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StatusBar, StyleSheet } from 'react-native';
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
  /** TV only: called when the user picks a different episode from the drawer. */
  onSelectEpisode?: (season: number, episode: Episode) => void;
  /**
   * Called when the user picks a different server from the Settings
   * drawer, with the current playhead so `PlayerScreen` can resume near
   * where playback was after re-resolving against the new server. Omit to
   * hide the Server setting entirely (e.g. while playing a local download,
   * where there's no scraper to re-run).
   */
  onSelectServer?: (serverId: string, resumeFrom: number) => void;
  streamflixSources?: StreamflixSource[];
  activeStreamflixSourceId?: string | null;
  onSelectStreamflixSource?: (id: string, resumeFrom: number) => void;
  extractorSubtitles?: StreamflixSubtitle[];
  /**
   * Called when the resolved stream fails to actually play (native
   * `<Video>` error) with the current playhead, so `PlayerScreen` can fail
   * over to another server instead of leaving the inline error card up.
   */
  onPlaybackFailed?: (resumeFrom: number) => void;
  /**
   * Offline captions bundled with a completed download. When present,
   * `useSubtitles` skips the Wyzie network search and loads these files.
   */
  localSubtitles?: LocalDownloadedSubtitle[];
}

/** Android has no PiP concept below API 26; iOS/tvOS support it wherever the
 * OS itself does. There's no react-native-video free function for this,
 * unlike expo-video's `isPictureInPictureSupported()`. */
const isPipSupported = (): boolean =>
  Platform.OS === 'ios' ||
  (Platform.OS === 'android' && Number(Platform.Version) >= 26);

/** Approximates expo-video's old `preferredForwardBufferDuration` (seconds)
 * as ExoPlayer `bufferConfig` (ms-based) for Android. iOS uses the RNV
 * top-level `preferredForwardBufferDuration` prop directly instead.
 * `cacheSizeMB` approximates the old `useCaching: true` — expo-video's
 * persistent cache only ever worked for HLS on Android anyway (iOS/
 * AVFoundation never supported HLS caching), so this preserves that half
 * of the behavior without needing a per-request opt-in. */
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

/**
 * Owns the react-native-video player instance and all playback UI. Created
 * once with a final, resolved source so the player is never recreated
 * mid-playback — all later changes (quality swap, sidecar subtitle tracks
 * arriving) go through the imperative `VideoRef.setSource()` call instead of
 * changing the `source` prop, exactly mirroring how this used to work with
 * expo-video's `player.replaceAsync()`.
 */
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
}: PlayerCoreProps) => {
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
  // Set right before autoplay hands off to the next episode. Guards the
  // unmount cleanup below from clobbering the Continue Watching entry we
  // just re-pointed at the next episode (see `playNextEpisode`).
  const advancingRef = useRef(false);
  // Latest position/duration mirrored into refs so unmount cleanup never
  // touches the (already released) player during back navigation.
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [episodesOpen, setEpisodesOpen] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  // Session-only: resets to Normal every time a new video/PlayerCore mounts,
  // rather than persisting app-wide — see the flick-player-controls skill's
  // "session-only vs per-server vs persisted" table.
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

  // The Settings drawer only needs to hand back a server id — the live
  // playhead (for resuming near the same spot after the switch) is read
  // from the ref `PlayerScreen` doesn't have access to.
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

  // "Up Next" autoplay, gated on `onSelectEpisode` being provided (the
  // caller opts a TV show into episode switching at all — see
  // `PlayerScreen.tsx`). `useNextEpisode` takes this flag directly instead
  // of re-deriving its own gating, so there's a single source of truth for
  // "should autoplay-next run at all" — passing a mismatched gate here vs.
  // inside the hook is exactly what caused next-episode lookups to always
  // resolve to "nothing" even when more episodes existed.
  const autoplayNextEnabled = isTVShow && !!onSelectEpisode;
  const { nextEpisode: nextEpisodeInfo, loading: nextEpisodeLoading } =
    useNextEpisode(item, season, episode, autoplayNextEnabled);
  const [upNextDismissed, setUpNextDismissed] = useState(false);
  const [seriesEnded, setSeriesEnded] = useState(false);
  // Set when the video plays to its natural end; the actual advance/"series
  // end" decision is deferred to the effect below until `useNextEpisode` has
  // definitively resolved things (not just "hasn't found one yet") —
  // otherwise a still-loading result gets misread as a confirmed finale.
  const [pendingAdvance, setPendingAdvance] = useState(false);

  // HLS-variant state. The master URI is captured once from the initial
  // `source` prop so quality swaps can always jump back to Auto.
  const sourceObj = typeof source === 'object' && source ? source : null;
  const masterUri = typeof sourceObj?.uri === 'string' ? sourceObj.uri : null;
  const isHls =
    !!masterUri && (sourceObj?.type === 'm3u8' || masterUri.includes('.m3u8'));
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariantUri, setSelectedVariantUri] = useState<string | null>(
    null,
  );
  const didApplyInitialQualityRef = useRef(false);
  const { pickInitial: pickInitialVariant } = useVideoQuality();

  // Settings > "Buffering" — user-editable forward-buffer window, defaulting
  // to a recommendation derived from the device's RAM (see
  // `deviceRecommendations.ts`). Snapshotted once here: like `resumeFrom`
  // and the other options below, this only applies at player-creation time
  // (the player is never recreated mid-playback — see the class doc
  // comment above).
  const { effectiveForwardBufferSeconds } = usePlaybackSettings();
  const initialForwardBufferSecondsRef = useRef(effectiveForwardBufferSeconds);
  const androidBufferConfigRef = useRef<BufferConfig | undefined>(
    Platform.OS === 'android'
      ? toAndroidBufferConfig(initialForwardBufferSecondsRef.current)
      : undefined,
  );

  const { settings: subtitleSettings } = useSubtitleSettings();
  const nativeSubtitlesEnabled = subtitleSettings.renderMode === 'native';
  // Sidecar (native OS) subtitle rendering via react-native-video's
  // `source.textTracks` works on Android always, but NOT with HLS playlists
  // on iOS (AVFoundation limitation — sidecar text tracks are only
  // supported for individual files there, not HLS manifests). Since this
  // app's scraped streams are virtually always HLS, that one
  // platform+format combination falls back to the exact same
  // component-mode rendering path below (Wyzie SRT fetched/parsed and
  // drawn by `SubtitleOverlay`) instead of showing nothing, which is what
  // "native" mode did before this migration (there was never anything
  // embedded to select).
  const useNativeSidecar =
    nativeSubtitlesEnabled && !(Platform.OS === 'ios' && isHls);

  // Online: Wyzie SRT search drives the picker (format=vtt often returns an
  // empty list). Offline: `localSubtitles` skips the network. Cue parse is
  // skipped in native mode — we convert the selected SRT to a local VTT
  // file instead and hand that to RNV (same pattern as the working sample).
  const {
    tracks: wyzieTracks,
    selectedId: wyzieSelectedId,
    selectedTrack: selectedWyzieTrack,
    selectTrack: selectWyzieTrack,
    cueAt,
    loading: loadingWyzieTracks,
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

  // The picker list is identical in both render modes.
  const subtitleTrackOptions = wyzieTracks.map((t) => ({
    id: t.id,
    label: `${t.display}${t.isHearingImpaired ? ' (CC)' : ''}`,
  }));
  const subtitlesActive = wyzieSelectedId != null;

  // Stable ids for native sidecar effects — avoid refetch/cancel races when
  // the track object identity changes but the selection did not.
  const selectedWyzieTrackId = selectedWyzieTrack?.id ?? null;
  const selectedWyzieIsLocal =
    selectedWyzieTrack != null && 'localUri' in selectedWyzieTrack;
  const selectedWyzieSourceUri = selectedWyzieTrack
    ? selectedWyzieIsLocal
      ? selectedWyzieTrack.localUri
      : selectedWyzieTrack.url
    : null;

  // Drives the consolidated Settings button's "something's customized"
  // highlight (see `PlayerSettingsDrawer`) now that quality/aspect/speed/
  // subtitles no longer each get their own top-bar icon to flag at a
  // glance.
  const settingsActive =
    playbackRate !== 1 ||
    subtitlesActive ||
    selectedVariantUri != null ||
    aspect !== 'contain';

  // Session-only sync offset (seconds) for the currently selected track.
  // Component mode applies it in cue lookup; native mode rewrites the local
  // VTT sidecar timestamps (see effects below). Reset whenever the selected
  // track changes, since a different track's natural sync is unrelated to
  // whatever offset fixed the previous one.
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

  // Local WebVTT URI for the currently selected native track (converted
  // from Wyzie/offline SRT/VTT). Raw text is kept so sync offset changes can
  // rewrite the sidecar without re-fetching.
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

  // Rewrite the local VTT whenever raw text or sync offset changes so ExoPlayer
  // loads a new sidecar URI (filename includes the offset). Debounce offset
  // bumps so rapid +/- taps coalesce into one setSource.
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

  // Single local VTT sidecar — matches the probe that rendered successfully.
  const sidecarTextTracks = useMemo<TextTracks | undefined>(() => {
    if (!useNativeSidecar || !nativeVttUri || !selectedWyzieTrack) {
      return undefined;
    }
    // Only apply once the cache matches the currently selected track.
    if (nativeVttTrackId !== selectedWyzieTrack.id) return undefined;
    return [
      {
        title: selectedWyzieTrack.display,
        language: selectedWyzieTrack.language as ISO639_1,
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

  // -------------------------------------------------------------------------
  // Player state (mirrors what expo-video's `useEvent`/`player.*` used to
  // expose, now derived from react-native-video's declarative props/events).
  // -------------------------------------------------------------------------
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

  // Component mode (or the iOS+HLS native fallback): drive `SubtitleOverlay`
  // off the playhead ourselves. Positive offset = captions appear later
  // (delayed), so we look up the cue as of `currentTime - offset`.
  const activeCue = useNativeSidecar
    ? null
    : cueAt(currentTime - subtitleOffsetSeconds);

  const { visible, show, toggle } = useControlsVisibility(isPlaying);

  // Seconds left in the episode; `Infinity` until the player reports a real
  // duration so the Up Next card never flashes on load.
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
      // Re-point the show's Continue Watching entry at the next episode
      // *before* handing off, so it never disappears mid-transition (the
      // outgoing PlayerCore's unmount save would otherwise remove it, since
      // it finished this episode at ~100%). See `advancingRef` below.
      advancingRef.current = true;
      advanceEpisode(
        item,
        nextEpisodeInfo.season,
        nextEpisodeInfo.episode.episode_number,
      );
      onSelectEpisode?.(nextEpisodeInfo.season, nextEpisodeInfo.episode);
    }
  }, [nextEpisodeInfo, onSelectEpisode, advanceEpisode, item]);

  // Fires once when the video plays through to its natural end. Just flags
  // that an advance decision is due — the actual decision is made by the
  // effect below, once `nextEpisodeLoading` confirms we actually know
  // whether there's a next episode (see comment on `pendingAdvance` above).
  const onEnd = useCallback(() => {
    if (!autoplayNextEnabled) return;
    setPendingAdvance(true);
  }, [autoplayNextEnabled]);

  // Resolve the pending advance: autoplay straight into the next episode
  // (unless the user already cancelled the Up Next card), or — only once
  // we've definitively confirmed there's nothing left to play — show a
  // brief "caught up" state before backing out to Detail. While
  // `nextEpisodeLoading` is true this intentionally does nothing and waits
  // for the next run once loading settles.
  useEffect(() => {
    if (!pendingAdvance || nextEpisodeLoading) return;
    setPendingAdvance(false);
    if (nextEpisodeInfo) {
      if (!upNextDismissed) playNextEpisode();
    } else {
      setSeriesEnded(true);
    }
  }, [
    pendingAdvance,
    nextEpisodeLoading,
    nextEpisodeInfo,
    upNextDismissed,
    playNextEpisode,
  ]);

  // Series finale: hold the "caught up" card briefly, then return to Detail.
  useEffect(() => {
    if (!seriesEnded) return;
    const timer = setTimeout(onBack, 2500);
    return () => clearTimeout(timer);
  }, [seriesEnded, onBack]);

  // Mirror the latest position/duration into refs for safe cleanup reads.
  useEffect(() => {
    currentTimeRef.current = currentTime;
    durationRef.current = duration;
  }, [currentTime, duration]);

  // Fetch HLS variants once per source. For non-HLS sources this stays empty
  // and the quality button is hidden.
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

  // -------------------------------------------------------------------------
  // Source construction. The `source` PROP given to `<Video>` is built ONCE
  // at mount (`initialSource` below) and never changed afterwards — quality
  // swaps and the sidecar text-track list arriving both go through the
  // imperative `videoRef.current.setSource()` instead (see `swapToUri` and
  // the sidecar-apply effect), each one folding in whatever the OTHER
  // dimension's latest value is via these refs, so neither clobbers the
  // other.
  // -------------------------------------------------------------------------
  const activeUriRef = useRef<string | null>(masterUri);
  const activeTextTracksRef = useRef<TextTracks | undefined>(undefined);
  const pendingSeekRef = useRef<number | null>(null);
  // Native sync/offset sidecar reloads call setSource and briefly jump to 0 —
  // freeze the real playhead here so onProgress cannot clobber it.
  const sidecarReloadInFlightRef = useRef(false);
  const sidecarResumeSecRef = useRef<number | null>(null);
  const sidecarWasPlayingRef = useRef(false);

  const buildSource = useCallback(
    (uri: string, textTracks: TextTracks | undefined): ReactVideoSource => ({
      ...(sourceObj ?? {}),
      uri,
      bufferConfig: androidBufferConfigRef.current,
      textTracks,
    }),
    [sourceObj],
  );

  const [initialSource] = useState<ReactVideoSource>(() =>
    buildSource(masterUri ?? '', undefined),
  );

  // Swap the current stream URI while preserving the play head. Called by
  // both the initial-preference effect and the user-facing quality picker.
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

  // Apply the persisted preferred quality once variants land. `pickInitial`
  // returns null for `auto` so we leave the master URI alone (ABR).
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

  // Apply (or clear) the local-VTT sidecar whenever the converted file is
  // ready or the user turns captions Off / changes sync offset. Preserve
  // playhead across setSource so native sync does not jump to 0.
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
        // Keep currentTimeRef snapshot.
      }
      if (cancelled) return;

      // Mid-playback reload (sync offset / track swap) — freeze playhead.
      // First attach near 0 leaves resumeFrom / pendingSeek alone.
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
      // Let `PlayerScreen` fail over to another server — this inline error
      // card gets unmounted anyway once it nulls `source` and remounts a
      // fresh `PlayerCore` against the next one.
      onPlaybackFailed?.(currentTimeRef.current);
    },
    [onPlaybackFailed],
  );

  const onProgress = useCallback(
    (e: OnProgressData) => {
      setPlayableDuration(e.playableDuration);
      if (sidecarReloadInFlightRef.current) {
        const resumeAt = sidecarResumeSecRef.current;
        // Backup seek if onLoad missed and we're still at the reload origin.
        if (resumeAt != null && resumeAt > 1 && e.currentTime < 1) {
          videoRef.current?.seek(resumeAt);
          return;
        }
        if (resumeAt != null && Math.abs(e.currentTime - resumeAt) < 1.5) {
          finishSidecarResume();
          return;
        }
        // Keep scrubber frozen at the resume target while reloading.
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

  // Persist continue-watching progress. Reads ONLY from refs.
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
      // Skip the "episode finished" save when we're mid-handoff to the next
      // episode — `playNextEpisode` already re-pointed the Continue
      // Watching entry at the new episode, and this call's ratio>0.95
      // removal would otherwise immediately delete it again (same
      // per-show dedupe key).
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

  // On Android TV, `TVEventHandler`'s raw remote-event feed and the native
  // focus engine's own "click the focused view" handling both react to the
  // same physical Select/D-pad press. With this hook always listening, a
  // Select press on a row inside one of the drawers below (episode list,
  // settings menu/submenu) gets consumed here as a global "toggle controls"
  // instead of reaching that row's own onPress — so the row visibly focuses
  // but never actually selects. Suspend every handler here while any of
  // those overlays are open so their own Focusable rows own
  // Select/Left/Right/Up/Down uncontested. The Up Next card and the
  // series-end state get the same treatment for the same reason.
  const overlayOpen =
    settingsOpen ||
    episodesOpen ||
    partyOpen ||
    chatOpen ||
    partyIntroOpen ||
    partyLobbyOpen ||
    showUpNext ||
    seriesEnded;

  useTVRemote({
    // The hidden-state fallback `Pressable` (focusable, hasTVPreferredFocus,
    // onPress={show}) already covers "Select while hidden" on its own, and
    // while visible, Select should only ever fire whichever button is
    // currently focused (e.g. the Settings gear) — a global `toggle` here
    // would flip the whole HUD's visibility on top of that in the same
    // press. Always leave Select unhandled globally.
    onSelect: undefined,
    onPlayPause: overlayOpen ? undefined : togglePlay,
    // Only steal Left/Right for the seek shortcut while controls are
    // hidden, where there's nothing else to focus horizontally anyway.
    // Once visible, leave Left/Right to the native focus engine so D-pad
    // can reach every top-bar/transport button (seeking is still available
    // there via the focusable RotateCcw/RotateCw buttons).
    onLeft: overlayOpen || visible ? undefined : () => seekBy(-10),
    onRight: overlayOpen || visible ? undefined : () => seekBy(10),
    onUp: overlayOpen ? undefined : show,
    onDown: overlayOpen ? undefined : show,
  });

  const [scrubPreview, setScrubPreview] = useState<number | null>(null);
  const displayTime =
    scrubPreview != null ? scrubPreview * duration : currentTime;

  return (
    <Box className="flex-1 bg-black">
      <StatusBar hidden />
      {isFocused && (
        <Video
          ref={videoRef}
          source={initialSource}
          style={StyleSheet.absoluteFill}
          controls={false}
          resizeMode={toResizeMode(aspect)}
          pointerEvents="none"
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
            // PiP window is tiny — force a small caption size so native
            // SubtitleView doesn't dominate the mini player (Android).
            fontSize: pipActive
              ? Math.min(PIP_SUBTITLE_FONT_SIZE, subtitleSettings.fontSize)
              : subtitleSettings.fontSize,
            // RNV sets SubtitleView to GONE when opacity === 0. App-caption
            // "background opacity" of 0% must not hide native cues. iOS only
            // honors 0/1 — always fully visible there.
            opacity:
              Platform.OS === 'ios'
                ? 1
                : Math.min(
                    1,
                    Math.max(0.2, subtitleSettings.backgroundOpacity || 1),
                  ),
            // Lift cues above the control bar when it's visible; hug the
            // bottom edge in PiP where there are no controls.
            paddingBottom: pipActive
              ? 8
              : Platform.OS === 'android'
                ? visible
                  ? 96
                  : 40
                : visible
                  ? 72
                  : 24,
            // Cover/fill crop the video frame — keep captions on the player
            // bounds instead (requires the ExoPlayerView patch).
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

      {/*
        SubtitleOverlay stays mounted even while `pipActive` so Android's
        activity-level PiP renders our SRT captions inside the mini window.
        NOTE: on iOS the AVKit PiP window shows only the video surface, so
        RN overlays like this cannot appear there. Fixing that would require
        burning subtitles into the stream (out of scope).
      */}
      <SubtitleOverlay
        text={activeCue?.text ?? null}
        controlsVisible={visible}
        pipActive={pipActive}
      />

      {!pipActive && seriesEnded && <SeriesEndOverlay />}

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
        !showUpNext &&
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
        ) : (
          // TV: keep a focusable owner mounted while controls are hidden.
          // Without one, some Android TV/tvOS builds swallow D-pad presses
          // before they reach useTVRemote's global TVEventHandler listener,
          // so nothing brings the controls back. `focusable` +
          // `hasTVPreferredFocus` guarantee Select reliably fires `show`
          // natively, and give the platform an active focus context for the
          // other directions.
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
