import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StatusBar, StyleSheet } from 'react-native';
import { ArrowLeft, VideoOff } from 'lucide-react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { NavigationBar } from 'expo-navigation-bar';
import type { ReactVideoSource } from 'react-native-video';
import { Box } from '@/components/ui/box';
import { Center } from '@/components/ui/center';
import { Icon } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from '@/components/ui/toast';
import { PlayerCore } from '@/src/components/player/PlayerCore';
import { ServerLoadingSideNav } from '@/src/components/player/ServerLoadingSideNav';
import {
  WebViewScraper,
  type ExtractedStream,
} from '@/src/components/player/WebViewScraper';
import { useServers } from '@/src/hooks/useServers';
import { useDownloads } from '@/src/hooks/useDownloads';
import { usePlayerDebugSettings } from '@/src/hooks/usePlayerDebugSettings';
import { TMDBService } from '@/src/services/TMDBService';
import { forceLandscape, restoreOrientation } from '@/src/utils/orientation';
import { originOf } from '@/src/utils/streamUrl';
import { getTitle, type Episode } from '@/src/types';
import type { RootStackScreenProps } from '@/src/navigation/types';
import { useWatchParty } from '@/src/hooks/useWatchParty';

export const PlayerScreen = ({
  route,
  navigation,
}: RootStackScreenProps<'Player'>) => {
  const {
    item,
    title: initialTitle,
    // `videoUrl` is kept on the route params for future pre-resolved-stream
    // callers, but the Player no longer uses it as a silent fallback when
    // scraping fails — we render an explicit empty state instead.
    subtitle: initialSubtitle,
    season: initialSeason,
    episode: initialEpisode,
    resumeFrom,
    localSourceId,
  } = route.params;

  // Hold a wake lock while the Player screen is mounted so the device won't
  // sleep during playback (or while paused/buffering). Released on unmount.
  useKeepAwake('flick-player');

  const { servers, activeServer, setActive } = useServers();
  const { jobs, getLocalSource, getJob, getJobFor } = useDownloads();
  const { role, send, subscribe, leaveRoom } = useWatchParty();
  // Settings > "Debug video player" — when on, render the stream-resolving
  // WebViewScraper full-screen and interactive instead of invisible, so you
  // can watch exactly what the embed page is doing.
  const { scraperDebugEnabled } = usePlayerDebugSettings();
  const toast = useToast();
  const type: 'movie' | 'tv' = item.media_type === 'tv' ? 'tv' : 'movie';

  // Episode-switching state: lifted here so the drawer can drive re-scraping
  // via the WebViewScraper without recreating the player mid-playback.
  const [season, setSeason] = useState<number | undefined>(initialSeason);
  const [episode, setEpisode] = useState<number | undefined>(initialEpisode);
  const [title, setTitle] = useState(initialTitle);
  const [subtitle, setSubtitle] = useState<string | undefined>(initialSubtitle);
  const [source, setSource] = useState<ReactVideoSource | null>(null);
  /**
   * Set to `true` when the WebViewScraper gives up. Renders a "No video
   * available" UI instead of silently falling back to a sample URL.
   */
  const [noSource, setNoSource] = useState(false);
  /**
   * Debug mode only: set once a stream URL has actually been intercepted,
   * even though we deliberately don't hand off to `PlayerCore` for it (see
   * `onExtracted`). Just flips the status badge below so it's clear the page
   * is now the thing actually playing the video, not still searching.
   */
  const [debugStreamFound, setDebugStreamFound] = useState(false);
  // `resumeFrom` only applies to the initial episode; switches always start
  // from the beginning.
  const [effectiveResumeFrom, setEffectiveResumeFrom] = useState<
    number | undefined
  >(resumeFrom);
  const resolvedRef = useRef(false);
  // Servers already tried (and failed) for the CURRENT target — reset
  // whenever the target itself changes (item/episode) or the user
  // explicitly picks a server, so a fresh failover cycle can run each time.
  // See `switchToServer`/`tryNextServer` below. State (not a ref) so
  // `ServerLoadingSideNav` re-renders with each server's up-to-date status.
  const [triedServerIds, setTriedServerIds] = useState<Set<string>>(
    new Set(),
  );

  // Best-effort IMDb id lookup for the current item — fills a playback
  // server's `{imdbId}` URL placeholder, if its pattern uses one. Swallow
  // errors; servers that don't need it are unaffected by a missing value.
  const [imdbId, setImdbId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setImdbId(null);
    const request =
      type === 'tv'
        ? TMDBService.getTVExternalIds(item.id)
        : TMDBService.getMovieExternalIds(item.id);
    request
      .then((res) => {
        if (!cancelled) setImdbId(res.imdb_id ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [item.id, type]);

  // Orientation: hard-force landscape for the player; restore on leave.
  // Also hide the Android navigation bar for immersive playback.
  useEffect(() => {
    forceLandscape();
    if (Platform.OS === 'android') {
      NavigationBar.setHidden(true);
    }
    return () => {
      restoreOrientation();
      if (Platform.OS === 'android') {
        NavigationBar.setHidden(false);
      }
    };
  }, []);

  const finish = useCallback((s: ReactVideoSource) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setSource(s);
  }, []);

  // Resolve a downloaded local copy for whatever we're currently trying to
  // play. Priority: explicit `localSourceId` from the caller (e.g. the
  // Downloads screen), otherwise best-effort lookup by the current item +
  // season/episode. This lets Home "Continue Watching", Detail Play, and
  // Downloads all seamlessly reuse a completed download.
  // Depend on `jobs` so subtitle sidecars written after video completion
  // re-render into PlayerCore without remounting.
  const localJob = useMemo(() => {
    if (localSourceId) return getJob(localSourceId);
    return getJobFor(item, season, episode);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jobs triggers refresh
  }, [localSourceId, getJob, getJobFor, item, season, episode, jobs]);

  const localForCurrent = useMemo<ReactVideoSource | null>(() => {
    const id = localJob?.id;
    if (!id) return null;
    return getLocalSource(id) ?? null;
  }, [localJob?.id, getLocalSource]);

  const localSubtitles =
    localForCurrent && localJob?.status === 'completed'
      ? localJob.subtitles
      : undefined;

  // Track which episode key we've already toasted about, so switching
  // between episodes shows the "data saving" toast at most once each.
  const toastedKeyRef = useRef<string | null>(null);

  // Playing back a downloaded copy: short-circuit the scraper entirely and
  // feed the local URI straight into react-native-video. We also surface a
  // lightweight "playing offline copy" toast the first time this happens
  // per episode so the user knows we're saving data.
  //
  // The `resolvedRef` guard matters: if the user was ALREADY streaming and a
  // background download for this same episode finished mid-playback, we
  // don't want to restart or spam a toast — we just leave the stream alone.
  useEffect(() => {
    if (!localForCurrent) return;
    if (resolvedRef.current) return;
    finish(localForCurrent);

    const key = `${item.id}-${season ?? 'm'}-${episode ?? 'm'}`;
    if (toastedKeyRef.current === key) return;
    toastedKeyRef.current = key;
    toast.show({
      placement: 'top',
      duration: 3500,
      render: ({ id }) => (
        <Toast nativeID={id} action="info" variant="solid">
          <ToastTitle>Playing downloaded copy</ToastTitle>
          <ToastDescription>
            Using your offline download to save data.
          </ToastDescription>
        </Toast>
      ),
    });
  }, [localForCurrent, finish, item.id, season, episode, toast]);

  const onExtracted = useCallback(
    ({ videoUrl: url }: ExtractedStream) => {
      // Debug mode: a stream request was intercepted, confirming the page
      // itself is now actually playing the video — but deliberately don't
      // hand off to the native `PlayerCore`. Some streams that fail (DRM,
      // header/cookie quirks, decoder support) in react-native-video play
      // back fine directly inside the browser context that resolved them,
      // so staying on the WebView here doubles as a way to actually watch
      // those.
      if (scraperDebugEnabled) {
        setDebugStreamFound(true);
        return;
      }
      finish({
        uri: url,
        // Explicit MIME hint for HLS; react-native-video otherwise infers
        // from the URL/response, matching expo-video's 'auto' for anything
        // else. Persistent caching is handled separately, per-platform, via
        // `source.bufferConfig.cacheSizeMB` inside `PlayerCore` (Android
        // only — iOS/AVFoundation never cached HLS anyway).
        type: url.includes('.m3u8') ? 'm3u8' : undefined,
        // Default the request origin to the selected server, which many
        // stream hosts require (403 otherwise).
        headers: {
          Referer: `${activeServer.url}/`,
          Origin: originOf(activeServer.url),
        },
      });
    },
    [finish, activeServer.url, scraperDebugEnabled],
  );

  // Shared by manual server switching (Settings > Server, in-player) and
  // automatic failover below: resets resolution state and points `useServers`
  // at a different server, re-arming `WebViewScraper` to resolve against it.
  // `resumeFromSeconds` re-seeds `effectiveResumeFrom` so a switch resumes
  // near wherever playback was, instead of restarting from 0.
  const switchToServer = useCallback(
    (id: string, resumeFromSeconds: number) => {
      setActive(id);
      resolvedRef.current = false;
      setSource(null);
      setNoSource(false);
      setDebugStreamFound(false);
      setEffectiveResumeFrom(resumeFromSeconds);
    },
    [setActive],
  );

  // User-initiated switch (in-player Settings > Server, or Server Settings
  // itself) — always starts a fresh failover cycle from the chosen server.
  const handleSelectServer = useCallback(
    (id: string, resumeFromSeconds: number) => {
      if (id === activeServer.id) return;
      setTriedServerIds(new Set());
      switchToServer(id, resumeFromSeconds);
    },
    [activeServer.id, switchToServer],
  );

  // Failure-driven: mark the current server as tried and move on to the
  // first server in the list not yet tried this cycle. Once every server
  // has failed, fall through to the "No video available" empty state.
  const tryNextServer = useCallback(
    (resumeFromSeconds: number) => {
      const updated = new Set(triedServerIds).add(activeServer.id);
      const next = servers.find((s) => !updated.has(s.id));
      setTriedServerIds(updated);
      if (!next) {
        setNoSource(true);
        return;
      }
      switchToServer(next.id, resumeFromSeconds);
    },
    [servers, activeServer.id, triedServerIds, switchToServer],
  );

  // On scrape failure/timeout, try the next configured server before giving
  // up — no sample-URL fallback either way. Callers who want a specific
  // pre-resolved stream should push `Player` with a `localSourceId` (for
  // downloads) instead.
  const onScrapeError = useCallback(() => {
    // Nothing has played yet at the resolution stage — carry forward
    // whatever resume position was already queued (continue-watching's
    // original position, or one queued by a prior switch this cycle)
    // instead of clobbering it with 0.
    tryNextServer(effectiveResumeFrom ?? 0);
  }, [tryNextServer, effectiveResumeFrom]);

  // A stream that DID resolve but then failed to actually play (403,
  // decoder/DRM issue, etc.) — reported by `PlayerCore`'s native `<Video>`
  // error handler. Also fails over, preserving how far playback got.
  const handlePlaybackFailed = useCallback(
    (resumeFromSeconds: number) => {
      tryNextServer(resumeFromSeconds);
    },
    [tryNextServer],
  );

  // Switch to a different episode without recreating the whole player screen:
  // reset the resolved source so `WebViewScraper` re-runs with new params, and
  // remount `PlayerCore` (via key on season/episode) once the new source lands.
  const handleSelectEpisode = useCallback(
    (nextSeason: number, ep: Episode) => {
      const nextEpisode = ep.episode_number;
      if (season === nextSeason && episode === nextEpisode) return;
      setTriedServerIds(new Set());
      resolvedRef.current = false;
      setSource(null);
      setNoSource(false);
      setDebugStreamFound(false);
      setEffectiveResumeFrom(undefined);
      setSeason(nextSeason);
      setEpisode(nextEpisode);
      setTitle(`${getTitle(item)} — ${ep.name}`);
      setSubtitle(`S${nextSeason} E${nextEpisode}`);
      if (role === 'host') {
        send({ type: 'episode', season: nextSeason, episode: nextEpisode });
      }
    },
    [item, season, episode, role, send],
  );

  const applyPartyEpisode = useCallback(
    (nextSeason: number, nextEpisode: number) => {
      if (season === nextSeason && episode === nextEpisode) return;
      setTriedServerIds(new Set());
      resolvedRef.current = false;
      setSource(null);
      setNoSource(false);
      setDebugStreamFound(false);
      setEffectiveResumeFrom(undefined);
      setSeason(nextSeason);
      setEpisode(nextEpisode);
      setTitle(`${getTitle(item)} — S${nextSeason} E${nextEpisode}`);
      setSubtitle(`S${nextSeason} E${nextEpisode}`);
    },
    [item, season, episode],
  );

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === 'episode' && role === 'guest') {
        applyPartyEpisode(msg.season, msg.episode);
      }
      if (msg.type === 'ended' && role) {
        navigation.goBack();
      }
    });
  }, [subscribe, role, applyPartyEpisode, navigation]);

  useEffect(() => {
    return () => {
      if (role) leaveRoom();
    };
    // Leave only when this screen unmounts, not when role identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (source) {
    return (
      <PlayerCore
        // Server id is included so a switch (manual or automatic failover)
        // always mounts a fresh `<Video>` against the newly-resolved source
        // — `source` already transits through `null` on every switch (see
        // `switchToServer`), but the explicit id keeps this key legible.
        key={`${type === 'tv' ? `${season}-${episode}` : 'movie'}-${activeServer.id}`}
        source={source}
        title={title}
        subtitle={subtitle}
        item={item}
        season={season}
        episode={episode}
        resumeFrom={effectiveResumeFrom}
        onBack={() => navigation.goBack()}
        onSelectEpisode={
          type === 'tv' && role !== 'guest' ? handleSelectEpisode : undefined
        }
        onSelectServer={localForCurrent ? undefined : handleSelectServer}
        onPlaybackFailed={localForCurrent ? undefined : handlePlaybackFailed}
        localSubtitles={localSubtitles}
      />
    );
  }

  // Scrape (or playback) failed on every configured server. Instead of
  // silently loading a sample video, let the user know nothing is playable
  // and give them a way back to the previous screen.
  if (noSource) {
    return (
      <Box className="flex-1 bg-black">
        <StatusBar hidden />
        <Center className="flex-1 px-8">
          <Icon
            as={VideoOff}
            size="xl"
            className="mb-4 text-muted-foreground"
          />
          <Text size="lg" bold className="text-center text-foreground">
            No video available
          </Text>
          <Text size="sm" className="mt-2 text-center text-muted-foreground">
            {servers.length > 1
              ? "We couldn't find a playable stream from any configured server."
              : "We couldn't find a playable stream from the current server. Try a different server from Settings."}
          </Text>
        </Center>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={16}
          style={{ position: 'absolute', top: 24, left: 16, zIndex: 10 }}
        >
          <Icon as={ArrowLeft} size="xl" className="text-foreground" />
        </Pressable>
      </Box>
    );
  }

  return (
    <Box className="flex-1 bg-black">
      <StatusBar hidden />
      {!localForCurrent && (
        <WebViewScraper
          server={activeServer}
          tmdbId={item.id}
          imdbId={imdbId}
          type={type}
          season={season}
          episode={episode}
          // Use the raw item title (not the episode-suffixed display `title`
          // state) so servers with a `{slug}` in their URL pattern always
          // slugify the show/movie name, not "Show — Episode Name".
          title={getTitle(item)}
          onDataExtracted={onExtracted}
          onError={onScrapeError}
          debug={scraperDebugEnabled}
          timeoutSeconds={activeServer.scraperTimeoutSeconds}
        />
      )}
      {/* Once a retry has kicked in (some earlier server already failed
          this cycle), name the server currently being tried so a
          multi-server failover isn't a silent, confusing wait. */}
      {scraperDebugEnabled ? (
        // Debug: keep the WebView visible/interactive — once a stream is
        // found we deliberately keep showing it (see `onExtracted`) instead
        // of switching to the native player, so the page keeps playing the
        // video itself. Just a small status badge on top.
        <Center
          className="absolute bottom-6 self-center rounded-full bg-black/80 px-4 py-2"
          pointerEvents="none"
        >
          <Text size="xs" className="text-muted-foreground">
            {debugStreamFound
              ? 'Stream found — playing in WebView (debug)'
              : `Finding stream… (debug, no timeout)${triedServerIds.size ? ` — trying ${activeServer.name}` : ''}`}
          </Text>
        </Center>
      ) : (
        <Center style={StyleSheet.absoluteFill} className="bg-black">
          <Spinner size="large" color="#E50914" />
          <Text className="mt-4 text-muted-foreground">
            {triedServerIds.size
              ? `Trying ${activeServer.name}…`
              : 'Finding stream…'}
          </Text>
        </Center>
      )}
      {!localForCurrent && (
        <ServerLoadingSideNav
          servers={servers}
          activeServerId={activeServer.id}
          triedServerIds={triedServerIds}
          onSelectServer={(id) =>
            handleSelectServer(id, effectiveResumeFrom ?? 0)
          }
        />
      )}
      <Pressable
        onPress={() => navigation.goBack()}
        hitSlop={16}
        style={{ position: 'absolute', top: 24, left: 16, zIndex: 10 }}
      >
        <Icon as={ArrowLeft} size="xl" className="text-foreground" />
      </Pressable>
    </Box>
  );
};
