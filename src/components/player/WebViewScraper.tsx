import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import type {
  WebViewMessageEvent,
  WebViewErrorEvent,
} from 'react-native-webview/lib/WebViewTypes';
import { buildEmbedUrl, type ServerUrlConfig } from '@/src/utils/streamUrl';
import { DEFAULT_SCRAPER_TIMEOUT_SECONDS } from '@/src/hooks/useServers';

export interface ExtractedStream {
  videoUrl: string;
  isWebM: boolean;
}

interface WebViewScraperProps {
  /** Playback server to scrape against — base URL + optional custom URL pattern/type label. */
  server: ServerUrlConfig;
  tmdbId: number;
  /** IMDb id (e.g. "tt1375666") — fills the `{imdbId}` placeholder for
   * servers that need it. */
  imdbId?: string | null;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  /** Raw media title — fills the `{slug}` placeholder for servers that need it. */
  title?: string;
  onDataExtracted: (data: ExtractedStream) => void;
  onLoading?: (isLoading: boolean) => void;
  onError?: (error: string) => void;
  /**
   * Temporarily render the WebView full-screen & interactive for debugging
   * (or for manually solving a captcha challenge). Purely a visibility
   * concern — does NOT affect the give-up timeout; see `timeoutSeconds`.
   */
  debug?: boolean;
  /**
   * Seconds to wait after the page finishes loading before giving up if no
   * stream has been found. `0` (or below) means wait indefinitely.
   * Independent of `debug` — a server can need a long/no timeout to solve
   * a captcha even while its WebView stays hidden, and `debug` can be on
   * with a short timeout for a quick look. Defaults to
   * `DEFAULT_SCRAPER_TIMEOUT_SECONDS` (per-server override lives on
   * `PlaybackServer.scraperTimeoutSeconds`, see `useServers.tsx`).
   */
  timeoutSeconds?: number;
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
//
// `timeoutMs` (the same give-up timeout the component arms in
// `handleLoadEnd`) is threaded in so the page-side center-click retry loop
// below knows when to stop trying — `<= 0` means "no timeout" (retry
// indefinitely, matching the component's own "wait indefinitely" semantics).
const buildInjectedJavaScript = (timeoutMs: number) => `
(function() {
  function post(p) {
    try {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(p));
    } catch (e) {}
  }
  function log(m) { post({ type: 'log', message: String(m), frame: location.href }); }

  var VIDEO_RE = /\\.(m3u8|mp4|webm|mkv)($|\\?)/i;
  var streamFound = false;

  function reportIfVideo(url, source) {
    if (!url || !VIDEO_RE.test(url)) return;
    streamFound = true;
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

  // Many embed players only start (and issue their video request) once
  // their "play" overlay is clicked. Try to find and click that overlay via
  // known selector patterns, falling back to a plain viewport-center click
  // (elementFromPoint) if no known button is found. Retries on an interval
  // (rather than a single attempt) since the overlay may not have rendered
  // yet, or the first click may land on an ad/consent layer instead of the
  // real button — keeps trying until a stream is found or \`timeoutMs\`
  // elapses (matching the component's own give-up timeout).
  var CENTER_CLICK_INTERVAL_MS = 3000;
  var CENTER_CLICK_TIMEOUT_MS = ${timeoutMs};
  var centerClickIntervalId = null;
  var centerClickStartedAt = 0;

  // Known play-button skins used by common embed/video players. Checked in
  // order; first visible match wins. Custom-built players (e.g. Videasy's
  // own React player) don't match any of these — findByText/
  // findNearCenterClickable below, then the plain viewport-center click as
  // a last resort, cover those.
  var PLAY_BUTTON_SELECTORS = [
    '.vjs-big-play-button',
    '.jw-icon-playback',
    '.jw-display-icon-container',
    '.plyr__control--overlaid',
    '.mejs-overlay-play',
    '.mejs-overlay-button',
    '.fluid_initial_play',
    '.fluid_initial_play_button',
    '.clappr-play-wrapper',
    '.vjs-poster',
    '[class*="play-button" i]',
    '[class*="playbutton" i]',
    '[class*="play_button" i]',
    '[class*="play-btn" i]',
    '[id*="play-button" i]',
    '[aria-label*="play" i]',
    '[title="Play" i]',
  ];

  // Short, exact-ish labels used by "click to start" buttons that don't use
  // any of the class names above (icon+text custom buttons).
  var PLAY_TEXT_RE = /^(play|play now|play video|watch now|start watching|tap to play|click to play)$/i;

  function isVisible(el) {
    var rect = el.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return false;
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
    return true;
  }

  function findBySelector() {
    for (var i = 0; i < PLAY_BUTTON_SELECTORS.length; i++) {
      var matches = document.querySelectorAll(PLAY_BUTTON_SELECTORS[i]);
      for (var j = 0; j < matches.length; j++) {
        if (isVisible(matches[j])) return matches[j];
      }
    }
    return null;
  }

  function findByText() {
    var candidates = document.querySelectorAll('button, [role="button"], a, div, span');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var text = (el.textContent || '').trim();
      if (text && text.length <= 24 && PLAY_TEXT_RE.test(text) && isVisible(el)) return el;
    }
    return null;
  }

  // Fully custom/icon-only player skins (no recognizable class name or
  // label — e.g. an SVG triangle in a plain <div>) fall back to a geometric
  // guess: the smallest visibly-clickable (cursor: pointer) element close to
  // the viewport center, excluding near-full-bleed backdrops/containers.
  function findNearCenterClickable() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var cx = vw / 2;
    var cy = vh / 2;
    var maxDist = Math.min(vw, vh) * 0.4;
    var candidates = document.querySelectorAll('button, [role="button"], a, div, span, svg, path, i, label');
    var best = null;
    var bestScore = Infinity;
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var rect = el.getBoundingClientRect();
      if (rect.width < 16 || rect.height < 16) continue;
      if (rect.width > vw * 0.7 && rect.height > vh * 0.7) continue;
      var ex = rect.left + rect.width / 2;
      var ey = rect.top + rect.height / 2;
      var dist = Math.sqrt((ex - cx) * (ex - cx) + (ey - cy) * (ey - cy));
      if (dist > maxDist) continue;
      if (!isVisible(el)) continue;
      var style = window.getComputedStyle(el);
      if (style.cursor !== 'pointer') continue;
      var score = dist + rect.width * rect.height * 0.02;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function findPlayButton() {
    return findBySelector() || findByText() || findNearCenterClickable();
  }

  function dispatchClick(el, x, y) {
    ['mousedown', 'mouseup', 'click'].forEach(function (type) {
      el.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
      }));
    });
  }

  function stopCenterClicking() {
    if (centerClickIntervalId !== null) {
      clearInterval(centerClickIntervalId);
      centerClickIntervalId = null;
    }
  }

  function clickCenter() {
    if (streamFound) {
      log('center click: stream already found, stopping retries');
      stopCenterClicking();
      return;
    }
    if (CENTER_CLICK_TIMEOUT_MS > 0 && (Date.now() - centerClickStartedAt) >= CENTER_CLICK_TIMEOUT_MS) {
      log('center click: timeout reached, stopping retries');
      stopCenterClicking();
      return;
    }
    try {
      var target = findPlayButton();
      var x, y;
      if (target) {
        var rect = target.getBoundingClientRect();
        x = Math.floor(rect.left + rect.width / 2);
        y = Math.floor(rect.top + rect.height / 2);
        log('found play button: ' + (target.className || target.tagName));
      } else {
        x = Math.floor(window.innerWidth / 2);
        y = Math.floor(window.innerHeight / 2);
        target = document.elementFromPoint(x, y);
        log('no known play button matched, falling back to viewport center');
      }
      if (!target) { log('center click: nothing at ' + x + ',' + y); return; }
      dispatchClick(target, x, y);
      log('click dispatched on ' + (target.tagName || 'unknown'));
    } catch (e) {
      log('center click error: ' + e);
    }
  }

  // Guard against the race where a (nested/fast-loading) frame's 'load'
  // event has already fired by the time this script is injected into it —
  // in that case addEventListener('load', ...) would never fire, and the
  // click loop would silently never start.
  function startCenterClickLoop() {
    if (centerClickStartedAt !== 0) return;
    centerClickStartedAt = Date.now();
    clickCenter();
    centerClickIntervalId = setInterval(clickCenter, CENTER_CLICK_INTERVAL_MS);
  }

  if (document.readyState === 'complete') {
    startCenterClickLoop();
  } else {
    window.addEventListener('load', startCenterClickLoop);
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
  imdbId,
  type,
  season,
  episode,
  title,
  onDataExtracted,
  onLoading,
  onError,
  debug = false,
  timeoutSeconds,
  previewStyle,
}: WebViewScraperProps) => {
  const [webViewKey, setWebViewKey] = useState(0);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasExtractedDataRef = useRef(false);
  const timeoutMs =
    (timeoutSeconds ?? DEFAULT_SCRAPER_TIMEOUT_SECONDS) * 1000;

  const embedUrl = useMemo(
    () =>
      buildEmbedUrl(server, { type, tmdbId, imdbId, season, episode, title }),
    [
      server.url,
      server.movieUrlPattern,
      server.tvUrlPattern,
      server.movieTypeLabel,
      server.tvTypeLabel,
      type,
      tmdbId,
      imdbId,
      season,
      episode,
      title,
    ],
  );

  const injectedJavaScript = useMemo(
    () => buildInjectedJavaScript(timeoutMs),
    [timeoutMs],
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

  // On load end, arm a timeout: if nothing was extracted, give up. This is
  // deliberately independent of `debug` (visibility) — a `0`/negative
  // `timeoutSeconds` (per-server "no timeout") is what actually disables
  // it, e.g. to leave time to solve a captcha by hand.
  const handleLoadEnd = useCallback(() => {
    log('load end');
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    if (timeoutMs <= 0) return;
    loadingTimerRef.current = setTimeout(() => {
      if (!hasExtractedDataRef.current) {
        log(`timeout after ${timeoutMs}ms - no stream found`);
        onLoading?.(false);
        onError?.('Timed out while finding a stream.');
      }
    }, timeoutMs);
  }, [timeoutMs, onLoading, onError]);

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
        injectedJavaScript={injectedJavaScript}
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
