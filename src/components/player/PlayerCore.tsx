import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StatusBar, StyleSheet } from 'react-native';
import { useEvent, useEventListener } from 'expo';
import { useIsFocused } from '@react-navigation/native';
import {
  isPictureInPictureSupported,
  useVideoPlayer,
  VideoView,
  type VideoSource,
} from 'expo-video';
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
import { useSubtitles } from '@/src/hooks/useSubtitles';
import { useSubtitleSettings } from '@/src/hooks/useSubtitleSettings';
import { useVideoAspect } from '@/src/hooks/useVideoAspect';
import { useVideoQuality } from '@/src/hooks/useVideoQuality';
import { fetchHlsVariants, type Variant } from '@/src/utils/hlsVariants';
import type { Episode, MediaItem } from '@/src/types';

interface PlayerCoreProps {
  source: VideoSource;
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

/**
 * Owns the expo-video player instance and all playback UI. Created once with a
 * final, resolved source so the player is never recreated mid-playback.
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
  const { upsert } = useContinueWatching();
  const lastSavedRef = useRef(0);
  const didResumeRef = useRef(false);
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
  const videoViewRef = useRef<VideoView>(null);
  const isTVShow = item.media_type === 'tv';
  const pipSupported = isPictureInPictureSupported();
  const enterPip = useCallback(() => {
    videoViewRef.current?.startPictureInPicture();
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
  const masterUri = sourceObj?.uri ?? null;
  const isHls =
    !!masterUri &&
    (sourceObj?.contentType === 'hls' || masterUri.includes('.m3u8'));
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariantUri, setSelectedVariantUri] = useState<string | null>(
    null,
  );
  const didApplyInitialQualityRef = useRef(false);
  const { pickInitial: pickInitialVariant } = useVideoQuality();

  const player = useVideoPlayer(source, (p) => {
    p.timeUpdateEventInterval = 0.5;
    // Widen the forward-buffer window a bit so stalls are less common on
    // spotty networks. Android-only fields no-op on iOS.
    p.bufferOptions = {
      preferredForwardBufferDuration: 500, // Android default 20, iOS 0 = auto
      minBufferForPlayback: 3,
      prioritizeTimeOverSizeThreshold: true,
    };
    p.play();
  });

  const { isPlaying } = useEvent(player, 'playingChange', {
    isPlaying: player.playing,
    oldIsPlaying: undefined,
  });
  const { currentTime, bufferedPosition } = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });
  const { status, error } = useEvent(player, 'statusChange', {
    status: player.status,
  });

  const duration = player.duration ?? 0;
  // `bufferedPosition` is -1 when unknown, 0 when not buffered past playhead.
  const buffered =
    duration > 0 && bufferedPosition > 0 ? bufferedPosition / duration : 0;
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
      onSelectEpisode?.(nextEpisodeInfo.season, nextEpisodeInfo.episode);
    }
  }, [nextEpisodeInfo, onSelectEpisode]);

  // Fires once when the video plays through to its natural end. Just flags
  // that an advance decision is due — the actual decision is made by the
  // effect below, once `nextEpisodeLoading` confirms we actually know
  // whether there's a next episode (see comment on `pendingAdvance` above).
  useEventListener(player, 'playToEnd', () => {
    if (!autoplayNextEnabled) return;
    setPendingAdvance(true);
  });

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

  const { settings: subtitleSettings } = useSubtitleSettings();
  const {
    tracks,
    selectedId,
    selectTrack,
    cueAt,
    loading: loadingTracks,
  } = useSubtitles({
    tmdbId: item.id,
    season,
    episode,
    defaultLanguage: subtitleSettings.defaultLanguage,
  });

  const activeCue = cueAt(currentTime);

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

  // Swap the current stream URI while preserving the play head. Called by
  // both the initial-preference effect and the user-facing quality picker.
  const swapToUri = useCallback(
    async (nextUri: string) => {
      if (!sourceObj) return;
      const resumeAt = currentTimeRef.current;
      const wasPlaying = player.playing;
      try {
        await player.replaceAsync({ ...sourceObj, uri: nextUri });
        if (resumeAt > 0) player.currentTime = resumeAt;
        if (wasPlaying) player.play();
      } catch {
        // If replaceAsync fails, the previous source stays loaded; nothing to
        // roll back on our side.
      }
    },
    [player, sourceObj],
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
    void swapToUri(initial.uri);
  }, [variants, pickInitialVariant, swapToUri]);

  const onSelectQuality = useCallback(
    (variant: Variant | null) => {
      if (!masterUri) return;
      const nextUri = variant?.uri ?? masterUri;
      setSelectedVariantUri(variant?.uri ?? null);
      void swapToUri(nextUri);
    },
    [masterUri, swapToUri],
  );

  // Resume from saved position once ready.
  useEventListener(player, 'statusChange', ({ status: next }) => {
    if (
      next === 'readyToPlay' &&
      !didResumeRef.current &&
      resumeFrom != null &&
      resumeFrom > 0
    ) {
      didResumeRef.current = true;
      player.currentTime = resumeFrom;
    }
  });

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
      saveProgress();
    };
  }, [saveProgress]);

  const togglePlay = useCallback(() => {
    if (player.playing) player.pause();
    else player.play();
    show();
  }, [player, show]);

  const seekBy = useCallback(
    (seconds: number) => {
      player.seekBy(seconds);
      show();
    },
    [player, show],
  );

  const seekToFraction = useCallback(
    (value: number) => {
      if (duration > 0) player.currentTime = value * duration;
    },
    [player, duration],
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
        <VideoView
          ref={videoViewRef}
          player={player}
          style={StyleSheet.absoluteFill}
          nativeControls={false}
          contentFit={aspect}
          pointerEvents="none"
          allowsPictureInPicture
          startsPictureInPictureAutomatically={!!source}
          onPictureInPictureStart={() => setPipActive(true)}
          onPictureInPictureStop={() => setPipActive(false)}
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
            {error?.message ?? 'The source could not be loaded.'}
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
            subtitlesActive={selectedId != null}
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
        tracks={tracks}
        selectedId={selectedId}
        loading={loadingTracks}
        onSelect={selectTrack}
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
