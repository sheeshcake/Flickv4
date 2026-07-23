import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StatusBar, StyleSheet } from 'react-native';
import { ArrowLeft, VideoOff } from 'lucide-react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { NavigationBar } from 'expo-navigation-bar';
import type { VideoSource } from 'expo-video';
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
import {
  WebViewScraper,
  type ExtractedStream,
} from '@/src/components/player/WebViewScraper';
import { useServers } from '@/src/hooks/useServers';
import { useDownloads } from '@/src/hooks/useDownloads';
import { usePlayerDebugSettings } from '@/src/hooks/usePlayerDebugSettings';
import { forceLandscape, restoreOrientation } from '@/src/utils/orientation';
import { originOf } from '@/src/utils/streamUrl';
import { getTitle, type Episode } from '@/src/types';
import type { RootStackScreenProps } from '@/src/navigation/types';

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

  const { activeServer } = useServers();
  const { getLocalSource, getJobFor } = useDownloads();
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
  const [source, setSource] = useState<VideoSource | null>(null);
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

  const finish = useCallback((s: VideoSource) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setSource(s);
  }, []);

  // Resolve a downloaded local copy for whatever we're currently trying to
  // play. Priority: explicit `localSourceId` from the caller (e.g. the
  // Downloads screen), otherwise best-effort lookup by the current item +
  // season/episode. This lets Home "Continue Watching", Detail Play, and
  // Downloads all seamlessly reuse a completed download.
  const localForCurrent = useMemo<VideoSource | null>(() => {
    const id = localSourceId ?? getJobFor(item, season, episode)?.id;
    if (!id) return null;
    return getLocalSource(id) ?? null;
  }, [localSourceId, getJobFor, getLocalSource, item, season, episode]);

  // Track which episode key we've already toasted about, so switching
  // between episodes shows the "data saving" toast at most once each.
  const toastedKeyRef = useRef<string | null>(null);

  // Playing back a downloaded copy: short-circuit the scraper entirely and
  // feed the local URI straight into expo-video. We also surface a lightweight
  // "playing offline copy" toast the first time this happens per episode so
  // the user knows we're saving data.
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
      // header/cookie quirks, decoder support) in expo-video play back fine
      // directly inside the browser context that resolved them, so staying
      // on the WebView here doubles as a way to actually watch those.
      if (scraperDebugEnabled) {
        setDebugStreamFound(true);
        return;
      }
      finish({
        uri: url,
        contentType: url.includes('.m3u8') ? 'hls' : 'auto',
        // Persistent LRU cache: Android caches HLS/MP4/WebM, iOS caches
        // MP4/WebM only (HLS caching is unsupported by AVFoundation).
        useCaching: true,
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

  // On scrape failure/timeout, show the empty state — no sample-URL
  // fallback. Callers who want a specific pre-resolved stream should push
  // `Player` with a `localSourceId` (for downloads) instead.
  const onScrapeError = useCallback(() => {
    setNoSource(true);
  }, []);

  // Switch to a different episode without recreating the whole player screen:
  // reset the resolved source so `WebViewScraper` re-runs with new params, and
  // remount `PlayerCore` (via key on season/episode) once the new source lands.
  const handleSelectEpisode = useCallback(
    (nextSeason: number, ep: Episode) => {
      const nextEpisode = ep.episode_number;
      if (season === nextSeason && episode === nextEpisode) return;
      resolvedRef.current = false;
      setSource(null);
      setNoSource(false);
      setDebugStreamFound(false);
      setEffectiveResumeFrom(undefined);
      setSeason(nextSeason);
      setEpisode(nextEpisode);
      setTitle(`${getTitle(item)} — ${ep.name}`);
      setSubtitle(`S${nextSeason} E${nextEpisode}`);
    },
    [item, season, episode],
  );

  if (source) {
    return (
      <PlayerCore
        key={type === 'tv' ? `${season}-${episode}` : 'movie'}
        source={source}
        title={title}
        subtitle={subtitle}
        item={item}
        season={season}
        episode={episode}
        resumeFrom={effectiveResumeFrom}
        onBack={() => navigation.goBack()}
        onSelectEpisode={type === 'tv' ? handleSelectEpisode : undefined}
      />
    );
  }

  // Scrape failed / timed out. Instead of silently loading a sample video,
  // let the user know nothing is playable from the current server and give
  // them a way back to the previous screen.
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
            We couldn&apos;t find a playable stream from the current server.
            Try a different server from Settings.
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
        />
      )}
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
              : 'Finding stream… (debug, no timeout)'}
          </Text>
        </Center>
      ) : (
        <Center style={StyleSheet.absoluteFill} className="bg-black">
          <Spinner size="large" color="#E50914" />
          <Text className="mt-4 text-muted-foreground">Finding stream…</Text>
        </Center>
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
