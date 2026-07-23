import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StatusBar, StyleSheet } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Video, {
  SelectedTrackType,
  TextTrackType,
  type BufferConfig,
  type ISO639_1,
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
import { SubtitleOverlay } from '@/src/components/player/SubtitleOverlay';
import { SubtitleTrackSheet } from '@/src/components/player/SubtitleTrackSheet';
import {
  SeriesEndOverlay,
  UpNextOverlay,
} from '@/src/components/player/UpNextOverlay';
import { VideoAspectSheet } from '@/src/components/player/VideoAspectSheet';
import { VideoQualitySheet } from '@/src/components/player/VideoQualitySheet';
import { useControlsVisibility } from '@/src/components/player/useControlsVisibility';
import { useTVRemote } from '@/src/components/player/useTVRemote';
import { useContinueWatching } from '@/src/hooks/useContinueWatching';
import {
  UP_NEXT_LEAD_SECONDS,
  useNextEpisode,
} from '@/src/hooks/useNextEpisode';
import { usePlaybackSettings } from '@/src/hooks/usePlaybackSettings';
import { useSubtitles } from '@/src/hooks/useSubtitles';
import { useSubtitleSettings } from '@/src/hooks/useSubtitleSettings';
import { toResizeMode, useVideoAspect } from '@/src/hooks/useVideoAspect';
import { useVideoQuality } from '@/src/hooks/useVideoQuality';
import { fetchHlsVariants, type Variant } from '@/src/utils/hlsVariants';
import type { Episode, MediaItem } from '@/src/types';

interface PlayerCoreProps {
  source: ReactVideoSource;
  title: string;
  subtitle?: string;
  item: MediaItem;
  season?: number;
  episode?: number;
  resumeFrom?: number;
  onBack: () => void;
  /** TV only: called when the user picks a different episode from the drawer. */
  onSelectEpisode?: (season: number, episode: Episode) => void;
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
  resumeFrom,
  onBack,
  onSelectEpisode,
}: PlayerCoreProps) => {
  const isFocused = useIsFocused();
  const { upsert, advanceEpisode } = useContinueWatching();
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [episodesOpen, setEpisodesOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [aspectOpen, setAspectOpen] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const { aspect, setAspect } = useVideoAspect();
  const videoRef = useRef<VideoRef>(null);
  const isTVShow = item.media_type === 'tv';
  const pipSupported = isPipSupported();
  const enterPip = useCallback(() => {
    videoRef.current?.enterPictureInPicture();
  }, []);

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

  // Wyzie search always runs now — it drives the picker list either way.
  // Only the cue text fetch/parse is skipped when the sidecar path will
  // hand the track's URL straight to the native player instead.
  const {
    tracks: wyzieTracks,
    selectedId: wyzieSelectedId,
    selectTrack: selectWyzieTrack,
    cueAt,
    loading: loadingWyzieTracks,
  } = useSubtitles({
    tmdbId: item.id,
    season,
    episode,
    loadCues: !useNativeSidecar,
    defaultLanguage: subtitleSettings.defaultLanguage,
  });

  // The picker list is identical in both render modes now.
  const subtitleTrackOptions = wyzieTracks.map((t) => ({
    id: t.id,
    label: `${t.display}${t.isHearingImpaired ? ' (CC)' : ''}`,
  }));
  const selectedWyzieTrack =
    wyzieTracks.find((t) => t.id === wyzieSelectedId) ?? null;
  const subtitlesActive = wyzieSelectedId != null;

  // Sidecar text tracks handed straight to react-native-video: Wyzie serves
  // `.srt` files directly from a hosted URL, so no fetch/parse is needed on
  // our side at all for this path.
  const sidecarTextTracks = useMemo<TextTracks | undefined>(() => {
    if (!useNativeSidecar || !wyzieTracks.length) return undefined;
    return wyzieTracks.map((t) => ({
      title: t.display,
      language: t.language as ISO639_1,
      type: TextTrackType.SUBRIP,
      uri: t.url,
    }));
  }, [useNativeSidecar, wyzieTracks]);

  const selectedTextTrack: SelectedTrack | undefined = useNativeSidecar
    ? selectedWyzieTrack
      ? { type: SelectedTrackType.TITLE, value: selectedWyzieTrack.display }
      : { type: SelectedTrackType.DISABLED }
    : undefined;

  // -------------------------------------------------------------------------
  // Player state (mirrors what expo-video's `useEvent`/`player.*` used to
  // expose, now derived from react-native-video's declarative props/events).
  // -------------------------------------------------------------------------
  const [paused, setPaused] = useState(false);
  const isPlaying = !paused;
  const [status, setStatus] = useState<PlaybackStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playableDuration, setPlayableDuration] = useState(0);
  const buffered =
    duration > 0 && playableDuration > 0 ? playableDuration / duration : 0;

  // Component mode (or the iOS+HLS native fallback): drive `SubtitleOverlay`
  // off the playhead ourselves.
  const activeCue = useNativeSidecar ? null : cueAt(currentTime);

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

  // Apply the sidecar text-track list once Wyzie's search resolves (it
  // arrives shortly after mount, asynchronously). Applied only once per
  // mount/track-list — if the user later changes render mode there's no
  // live re-apply, matching how quality/aspect settings already only take
  // effect at player-creation time.
  const didApplySidecarTracksRef = useRef(false);
  useEffect(() => {
    if (!useNativeSidecar) return;
    if (didApplySidecarTracksRef.current) return;
    if (!sidecarTextTracks || !sidecarTextTracks.length) return;
    didApplySidecarTracksRef.current = true;
    activeTextTracksRef.current = sidecarTextTracks;
    if (activeUriRef.current) {
      videoRef.current?.setSource(
        buildSource(activeUriRef.current, sidecarTextTracks),
      );
    }
  }, [useNativeSidecar, sidecarTextTracks, buildSource]);

  const onLoad = useCallback(
    (e: OnLoadData) => {
      setStatus('ready');
      setDuration(e.duration);
      if (pendingSeekRef.current != null) {
        const seekTo = pendingSeekRef.current;
        pendingSeekRef.current = null;
        videoRef.current?.seek(seekTo);
      } else if (!didResumeRef.current && resumeFrom != null && resumeFrom > 0) {
        didResumeRef.current = true;
        videoRef.current?.seek(resumeFrom);
      }
    },
    [resumeFrom],
  );

  const onError = useCallback((e: OnVideoErrorData) => {
    setStatus('error');
    const err = e.error;
    setErrorMessage(
      err?.localizedDescription ||
        err?.errorString ||
        err?.error ||
        'The source could not be loaded.',
    );
  }, []);

  const onProgress = useCallback((e: OnProgressData) => {
    setCurrentTime(e.currentTime);
    setPlayableDuration(e.playableDuration);
  }, []);

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
    setPaused((p) => !p);
    show();
  }, [show]);

  const seekBy = useCallback(
    (seconds: number) => {
      videoRef.current?.seek(currentTimeRef.current + seconds);
      show();
    },
    [show],
  );

  const seekToFraction = useCallback(
    (value: number) => {
      if (duration > 0) videoRef.current?.seek(value * duration);
    },
    [duration],
  );

  // On Android TV, `TVEventHandler`'s raw remote-event feed and the native
  // focus engine's own "click the focused view" handling both react to the
  // same physical Select/D-pad press. With this hook always listening, a
  // Select press on a row inside one of the sheets/drawer below (episode
  // list, quality/aspect/subtitle picker) gets consumed here as a global
  // "toggle controls" instead of reaching that row's own onPress — so the
  // row visibly focuses but never actually selects. Suspend every handler
  // here while any of those overlays are open so their own Focusable rows
  // own Select/Left/Right/Up/Down uncontested. The Up Next card and the
  // series-end state get the same treatment for the same reason.
  const overlayOpen =
    sheetOpen ||
    episodesOpen ||
    qualityOpen ||
    aspectOpen ||
    showUpNext ||
    seriesEnded;

  useTVRemote({
    onSelect: overlayOpen ? undefined : toggle,
    onPlayPause: overlayOpen ? undefined : togglePlay,
    onLeft: overlayOpen ? undefined : () => seekBy(-10),
    onRight: overlayOpen ? undefined : () => seekBy(10),
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
          progressUpdateInterval={500}
          preferredForwardBufferDuration={
            Platform.OS === 'ios'
              ? initialForwardBufferSecondsRef.current
              : undefined
          }
          selectedTextTrack={selectedTextTrack}
          enterPictureInPictureOnLeave
          onLoadStart={() => setStatus('loading')}
          onLoad={onLoad}
          onError={onError}
          onEnd={onEnd}
          onProgress={onProgress}
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
            onOpenSubtitles={() => {
              setSheetOpen(true);
              show();
            }}
            subtitlesActive={subtitlesActive}
            onOpenEpisodes={
              isTVShow && onSelectEpisode
                ? () => {
                    setEpisodesOpen(true);
                    show();
                  }
                : undefined
            }
            onOpenQuality={
              variants.length > 1
                ? () => {
                    setQualityOpen(true);
                    show();
                  }
                : undefined
            }
            onOpenAspect={() => {
              setAspectOpen(true);
              show();
            }}
            onEnterPip={pipSupported ? enterPip : undefined}
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

      <SubtitleTrackSheet
        visible={sheetOpen}
        tracks={subtitleTrackOptions}
        selectedId={wyzieSelectedId}
        loading={loadingWyzieTracks}
        emptyLabel="No subtitles found for this title."
        onSelect={selectWyzieTrack}
        onClose={() => setSheetOpen(false)}
      />

      <VideoQualitySheet
        visible={qualityOpen}
        variants={variants}
        selectedUri={selectedVariantUri}
        onSelect={onSelectQuality}
        onClose={() => setQualityOpen(false)}
      />

      <VideoAspectSheet
        visible={aspectOpen}
        selected={aspect}
        onSelect={setAspect}
        onClose={() => setAspectOpen(false)}
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
    </Box>
  );
};
