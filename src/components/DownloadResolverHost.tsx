import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  WebViewScraper,
  type ExtractedStream,
} from '@/src/components/player/WebViewScraper';
import {
  DownloadService,
  type ResolveRequest,
  type ResolvedStream,
} from '@/src/services/DownloadService';
import { MovieboxService } from '@/src/services/MovieboxService';

/**
 * Off-screen harness that lets `DownloadService` resolve a stream URL by
 * mounting a `WebViewScraper` on demand.
 *
 * The service exposes a resolver contract:
 *
 *   type Resolver = (req: ResolveRequest) => Promise<ResolvedStream>
 *
 * On mount we register a resolver that, when called, kicks a React state
 * update to render a single `WebViewScraper` with the requested params.
 * When the scraper resolves (or errors) we settle the pending promise and
 * unmount the WebView so subsequent calls start clean.
 */
export const DownloadResolverHost = () => {
  const [job, setJob] = useState<ResolveRequest | null>(null);
  const pendingRef = useRef<{
    resolve: (value: ResolvedStream) => void;
    reject: (reason: unknown) => void;
  } | null>(null);

  useEffect(() => {
    const resolver = (req: ResolveRequest) => {
      if (req.resolver === 'moviebox') {
        return MovieboxService.resolve({
          title: req.title ?? '',
          mediaType: req.type,
          season: req.season,
          episode: req.episode,
        }).then((resolved) => {
          if (!resolved) throw new Error('Moviebox: no stream found');
          return { videoUrl: resolved.uri, isWebM: false };
        });
      }
      return new Promise<ResolvedStream>((resolve, reject) => {
        // If a scrape is already in-flight, refuse a concurrent request.
        if (pendingRef.current) {
          reject(new Error('Resolver busy'));
          return;
        }
        pendingRef.current = { resolve, reject };
        setJob(req);
      });
    };

    DownloadService.setResolver(resolver);
    void DownloadService.hydrate();

    return () => {
      DownloadService.setResolver(null);
      // Reject any pending promise on unmount.
      if (pendingRef.current) {
        pendingRef.current.reject(new Error('Resolver unmounted'));
        pendingRef.current = null;
      }
    };
  }, []);

  if (!job) return null;

  const handleExtracted = (stream: ExtractedStream) => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setJob(null);
    if (pending) pending.resolve(stream);
  };

  const handleError = (message: string) => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setJob(null);
    if (pending) pending.reject(new Error(message));
  };

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebViewScraper
        // Downloads always resolve against the default `{url}/{type}/{tmdbId}`
        // pattern — `ResolveRequest` only carries a plain base URL, not a
        // full server config, so a custom pattern/TV type label set on a
        // server only applies to live playback (`PlayerScreen`), not queued
        // downloads.
        server={{ url: job.baseUrl }}
        tmdbId={job.tmdbId}
        type={job.type}
        season={job.season}
        episode={job.episode}
        onDataExtracted={handleExtracted}
        onError={handleError}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  // Full-size (not 1x1) so the inner WebViewScraper's own full-size hidden
  // style isn't clipped down by this wrapper — see the comment on
  // `WebViewScraper`'s `styles.hidden` for why a tiny viewport can make some
  // ad-supported embeds silently refuse to serve the real video request.
  hidden: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },
});
