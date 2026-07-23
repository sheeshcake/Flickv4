import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import type {
  WebViewMessageEvent,
  WebViewErrorEvent,
} from 'react-native-webview/lib/WebViewTypes';
import { buildEmbedUrl, type ServerUrlConfig } from '@/src/utils/streamUrl';

export interface ExtractedStream {
  videoUrl: string;
  isWebM: boolean;
}

interface WebViewScraperProps {
  /** Playback server to scrape against — base URL + optional custom URL pattern/type label. */
  server: ServerUrlConfig;
  tmdbId: number;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  /** Raw media title — fills the `{slug}` placeholder for servers that need it. */
  title?: string;
  onDataExtracted: (data: ExtractedStream) => void;
  onLoading?: (isLoading: boolean) => void;
  onError?: (error: string) => void;
  /** Temporarily render the WebView full-screen & interactive for debugging. */
  debug?: boolean;
  /**
   * Render the WebView visible (and interactive, in case a challenge needs
   * solving) inside a caller-provided box instead of fully hidden — e.g. a
   * small "Testing…" preview window. Ignored when `debug` is true. Pass the
   * sizing/position style (the WebView itself fills it via
   * `StyleSheet.absoluteFill`).
   */
  previewStyle?: StyleProp<ViewStyle>;
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

// Injected into the page (and every frame): hooks XMLHttpRequest AND fetch()
// to catch video responses (m3u8/mp4/webm/mkv) and posts the resolved URL
// back to React Native. Some newer players (hls.js configured with a fetch
// loader, native <video> + MSE via fetch, etc.) issue segment/manifest
// requests through `fetch` instead of `XMLHttpRequest`, so both are patched.
// Also forwards debug logs (type: 'log') so they surface in devtools.
const INJECTED_JAVASCRIPT = `
(function() {
  function post(p) {
    try {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(p));
    } catch (e) {}
  }
  function log(m) { post({ type: 'log', message: String(m), frame: location.href }); }

  var VIDEO_RE = /\\.(m3u8|mp4|webm|mkv)($|\\?)/i;

  function reportIfVideo(url, source) {
    if (!url || !VIDEO_RE.test(url)) return;
    log(source + ' ' + url);
    post({
      type: 'video',
      responseURL: url,
      isWebM: /\\.webm($|\\?)/i.test(url)
    });
  }

  log('hook installed');

  var originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function() {
    this.addEventListener('load', function() {
      try {
        var responseURL = this.responseURL;
        if (!responseURL) return;
        log('xhr ' + responseURL);
        reportIfVideo(responseURL, 'xhr');
      } catch (error) {
        log('xhr listener error: ' + error);
      }
    });
    originalOpen.apply(this, arguments);
  };

  if (window.fetch) {
    var originalFetch = window.fetch;
    window.fetch = function(input, init) {
      var requestUrl = typeof input === 'string' ? input : (input && input.url);
      return originalFetch.apply(this, arguments).then(function(response) {
        try {
          var responseURL = response.url || requestUrl;
          log('fetch ' + responseURL);
          reportIfVideo(responseURL, 'fetch');
        } catch (error) {
          log('fetch listener error: ' + error);
        }
        return response;
      });
    };
  }
})();
true;
`;

/**
 * WebView that loads a streaming-server embed page and intercepts the
 * underlying video request via an injected XMLHttpRequest hook, returning the
 * resolved stream URL. When not previewed, it's rendered fully transparent
 * and non-interactive (`styles.hidden`) at *normal screen size* — not a 1x1
 * box — so it never affects layout or catches touches, but still presents a
 * normal-looking viewport to the page. Many ad-supported embeds fingerprint
 * `window.innerWidth/innerHeight` (or use `IntersectionObserver`/size checks
 * before initializing their player) as a bot signal; a 1x1 viewport can make
 * those sites quietly refuse to ever fire the real video request, even
 * though the exact same URL resolves fine in a normally-sized WebView (e.g.
 * the visible "Test" preview in `ServerSettingsScreen`).
 *
 * Reimplementation of the reference `WebViewScrapper` adapted to this app:
 * configurable server (`baseUrl` + `buildEmbedUrl`) and debug logging.
 */
export const WebViewScraper = ({
  server,
  tmdbId,
  type,
  season,
  episode,
  title,
  onDataExtracted,
  onLoading,
  onError,
  debug = false,
  previewStyle,
}: WebViewScraperProps) => {
  const [webViewKey, setWebViewKey] = useState(0);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasExtractedDataRef = useRef(false);

  const embedUrl = useMemo(
    () => buildEmbedUrl(server, { type, tmdbId, season, episode, title }),
    [
      server.url,
      server.urlPattern,
      server.movieTypeLabel,
      server.tvTypeLabel,
      type,
      tmdbId,
      season,
      episode,
      title,
    ],
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

  const visible = debug || !!previewStyle;
  const containerStyle = debug
    ? StyleSheet.absoluteFill
    : (previewStyle ?? styles.hidden);

  return (
    <View style={containerStyle} pointerEvents={visible ? 'auto' : 'none'}>
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
  // Fully transparent + non-interactive, but sized like a real screen (NOT
  // 1x1 — see the class doc comment above for why that broke some servers).
  hidden: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },
});
