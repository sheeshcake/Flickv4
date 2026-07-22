import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type {
  WebViewMessageEvent,
  WebViewErrorEvent,
} from 'react-native-webview/lib/WebViewTypes';
import { buildEmbedUrl } from '@/src/utils/streamUrl';

export interface ExtractedStream {
  videoUrl: string;
  isWebM: boolean;
}

interface WebViewScraperProps {
  /** Base URL of the active playback server, e.g. https://vidfast.pro */
  baseUrl: string;
  tmdbId: number;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  onDataExtracted: (data: ExtractedStream) => void;
  onLoading?: (isLoading: boolean) => void;
  onError?: (error: string) => void;
  /** Temporarily render the WebView full-screen & interactive for debugging. */
  debug?: boolean;
}

interface MessageData {
  type: string;
  responseURL?: string;
  isWebM?: boolean;
  message?: string;
  frame?: string;
}

// Time to wait after the page finishes loading before giving up (ms).
const LOAD_END_DELAY = 60000;

// A normal mobile Chrome User-Agent. The default Android WebView UA contains a
// "; wv" token that anti-bot systems (e.g. Cloudflare) flag; presenting a
// regular browser UA lets the standard JS + cookie challenge run like it would
// in Chrome. Combined with persisted cookies, once the challenge is passed the
// `cf_clearance` cookie is stored and subsequent loads go straight through.
const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

const TAG = '[WebViewScraper]';
// eslint-disable-next-line no-console
const log = (...args: unknown[]) => console.log(TAG, ...args);

// Injected into the page (and every frame): hooks XMLHttpRequest to catch
// video responses (m3u8/mp4/webm/mkv) and posts the resolved URL back to React
// Native. Also forwards debug logs (type: 'log') so they surface in devtools.
const INJECTED_JAVASCRIPT = `
(function() {
  function post(p) {
    try {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(p));
    } catch (e) {}
  }
  function log(m) { post({ type: 'log', message: String(m), frame: location.href }); }

  var VIDEO_RE = /\\.(m3u8|mp4|webm|mkv)($|\\?)/i;

  log('hook installed');

  var originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function() {
    this.addEventListener('load', function() {
      try {
        var responseURL = this.responseURL;
        if (!responseURL) return;
        log('xhr ' + responseURL);

        var isVideo = VIDEO_RE.test(responseURL);
        if (isVideo) {
          post({
            type: 'video',
            responseURL: responseURL,
            isWebM: /\\.webm($|\\?)/i.test(responseURL)
          });
        }
      } catch (error) {
        log('xhr listener error: ' + error);
      }
    });
    originalOpen.apply(this, arguments);
  };
})();
true;
`;

/**
 * WebView that loads a streaming-server embed page and intercepts the
 * underlying video request via an injected XMLHttpRequest hook, returning the
 * resolved stream URL. Rendered hidden (offscreen) so it never affects layout.
 *
 * Reimplementation of the reference `WebViewScrapper` adapted to this app:
 * configurable server (`baseUrl` + `buildEmbedUrl`) and debug logging.
 */
export const WebViewScraper = ({
  baseUrl,
  tmdbId,
  type,
  season,
  episode,
  onDataExtracted,
  onLoading,
  onError,
  debug = false,
}: WebViewScraperProps) => {
  const [webViewKey, setWebViewKey] = useState(0);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasExtractedDataRef = useRef(false);

  const embedUrl = useMemo(
    () => buildEmbedUrl(baseUrl, { type, tmdbId, season, episode }),
    [baseUrl, type, tmdbId, season, episode],
  );

  // Reset the WebView when the target changes.
  useEffect(() => {
    hasExtractedDataRef.current = false;
    log('loading embed:', embedUrl);
    setWebViewKey((prev) => prev + 1);
  }, [embedUrl]);

  // Handle messages posted from the page.
  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let data: MessageData;
      try {
        data = JSON.parse(event.nativeEvent.data) as MessageData;
      } catch (error) {
        log('failed to parse message:', error);
        onError?.('Failed to parse video data');
        return;
      }

      if (data.type === 'log') {
        log('page:', data.message);
        return;
      }

      if (hasExtractedDataRef.current) return;

      if (data.type === 'video' && data.responseURL) {
        hasExtractedDataRef.current = true;
        if (loadingTimerRef.current) {
          clearTimeout(loadingTimerRef.current);
          loadingTimerRef.current = null;
        }
        log('resolved stream:', data.responseURL, `(webm=${!!data.isWebM})`);
        onDataExtracted({ videoUrl: data.responseURL, isWebM: !!data.isWebM });
        onLoading?.(false);
      }
    },
    [onDataExtracted, onLoading, onError],
  );

  const handleLoadStart = useCallback(() => {
    log('load start');
    onLoading?.(true);
  }, [onLoading]);

  // On load end, arm a timeout: if nothing was extracted, give up.
  // In debug mode we skip the timeout so there's time to solve a challenge.
  const handleLoadEnd = useCallback(() => {
    log('load end');
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    if (debug) return;
    loadingTimerRef.current = setTimeout(() => {
      if (!hasExtractedDataRef.current) {
        log(`timeout after ${LOAD_END_DELAY}ms - no stream found`);
        onLoading?.(false);
        onError?.('Timed out while finding a stream.');
      }
    }, LOAD_END_DELAY);
  }, [debug, onLoading, onError]);

  const handleError = useCallback(
    (event: WebViewErrorEvent) => {
      const { nativeEvent } = event;
      log('WebView error:', nativeEvent.code, nativeEvent.description);
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
      onLoading?.(false);
      onError?.('WebView load error');
    },
    [onLoading, onError],
  );

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    };
  }, []);

  return (
    <View
      style={debug ? StyleSheet.absoluteFill : styles.hidden}
      pointerEvents={debug ? 'auto' : 'none'}
    >
      <WebView
        key={webViewKey}
        source={{ uri: embedUrl }}
        // Present as a normal mobile browser so Cloudflare's JS challenge runs.
        userAgent={USER_AGENT}
        applicationNameForUserAgent="Chrome/126.0.0.0"
        injectedJavaScript={INJECTED_JAVASCRIPT}
        // Inject into nested (cross-origin) iframes too - the stream request
        // originates inside the embedded player frame, not the top document.
        injectedJavaScriptForMainFrameOnly={false}
        onMessage={handleMessage}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        onShouldStartLoadWithRequest={(req) => {
          log('navigation:', req.url);
          return true;
        }}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        // Cookies must persist so the Cloudflare `cf_clearance` cookie set after
        // the challenge is reused on later requests (bypassing repeat checks).
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        // Let the interactive challenge open in the same view.
        setSupportMultipleWindows={false}
        originWhitelist={['*']}
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
