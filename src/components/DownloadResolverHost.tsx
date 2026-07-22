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
    const resolver = (req: ResolveRequest) =>
      new Promise<ResolvedStream>((resolve, reject) => {
        // If a scrape is already in-flight, refuse a concurrent request.
        if (pendingRef.current) {
          reject(new Error('Resolver busy'));
          return;
        }
        pendingRef.current = { resolve, reject };
        setJob(req);
      });

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
        baseUrl={job.baseUrl}
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
  hidden: {
    position: 'absolute',
    top: -10000,
    left: -10000,
    width: 1,
    height: 1,
    opacity: 0,
  },
});
