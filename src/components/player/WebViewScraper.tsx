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
  /**
   * Mute every `<video>`/`<audio>` in the embed. Defaults to muted when
   * `debug` is off so a hidden scrape cannot play sound.
   */
  muted?: boolean;
  /**
   * Auto-click play overlays (and rewrite nested iframes to autoplay=true)
   * so a hidden scrape can start the stream. Defaults to on when `debug`
   * is off; debug leaves the page alone so you can tap yourself.
   */
  autoTap?: boolean;
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

/** Native-side URL check — mirrors the injected `VIDEO_RE` / `VIDEO_HINT_RE`. */
const NATIVE_VIDEO_RE = /\.(m3u8|mpd|mp4|webm|mkv)($|\?)|m3u8|mpegurl/i;

// Injected into the page (and every frame): hooks XMLHttpRequest, fetch(),
// <video>.src, and resource timings to catch video (m3u8/mpd/mp4/webm/mkv)
// and posts the resolved URL back to React Native. Some players (VidLink,
// Vidstack, JW) never put `.m3u8` on the request URL — they return JSON
// with `stream.playlist` and then assign it to a media element, or fetch a
// proxied manifest whose path has no extension — so we also walk JSON
// bodies and treat `#EXTM3U` / DASH MPD responses as streams.
// Also forwards debug logs (type: 'log') so they surface in devtools.
//
// `timeoutMs` (the same give-up timeout the component arms in
// `handleLoadEnd`) is threaded in so the page-side center-click retry loop
// below knows when to stop trying — `<= 0` means "no timeout" (retry
// indefinitely, matching the component's own "wait indefinitely" semantics).
const buildInjectedJavaScript = (
  timeoutMs: number,
  muted: boolean,
  autoTap: boolean,
) => `
(function() {
  function post(p) {
    try {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(p));
    } catch (e) {}
  }
  function log(m) { post({ type: 'log', message: String(m), frame: location.href }); }

  var VIDEO_RE = /\\.(m3u8|mpd|mp4|webm|mkv)($|\\?)/i;
  var VIDEO_HINT_RE = /m3u8|mpegurl|\\.mpd($|\\?)/i;
  var SKIP_RE = /\\.(jpe?g|png|gif|webp|svg|ico|css|woff2?|js|vtt|srt)($|\\?)/i;
  var SKIP_HOST_RE = /image\\.tmdb\\.org|wsrv\\.nl|googletagmanager|doubleclick|adsystem|google-analytics|clarity\\.ms|yandex/i;
  function isStreamFound() { return !!window.__flickStreamFound; }

  function isHttpUrl(url) {
    return typeof url === 'string' && /^https?:\\/\\//i.test(url);
  }
  function isSkippable(url) {
    return !isHttpUrl(url) || SKIP_RE.test(url) || SKIP_HOST_RE.test(url);
  }
  function emitVideo(url, source) {
    if (isStreamFound() || isSkippable(url)) return;
    window.__flickStreamFound = true;
    log(source + ' ' + url);
    post({
      type: 'video',
      responseURL: url,
      isWebM: /\\.webm($|\\?)/i.test(url)
    });
  }
  function reportIfVideo(url, source) {
    if (!url || (!VIDEO_RE.test(url) && !VIDEO_HINT_RE.test(url))) return;
    emitVideo(url, source);
  }
  function reportMediaSrc(url, source) {
    reportIfVideo(url, source);
  }
  function reportPlaylist(url, source) {
    emitVideo(url, source);
  }

  function walkJson(node) {
    if (!node || isStreamFound()) return;
    if (typeof node === 'string') {
      reportIfVideo(node, 'json');
      return;
    }
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length && !isStreamFound(); i++) walkJson(node[i]);
      return;
    }
    if (typeof node !== 'object') return;
    // VidLink (and similar): { stream: { playlist, requiresProxy, qualities } }.
    // If the playlist needs their proxy rewrite, skip it and wait for the
    // player to request the rewritten URL (caught via fetch/video.src).
    if (typeof node.playlist === 'string' && node.requiresProxy !== true) {
      reportPlaylist(node.playlist, 'json.playlist');
      if (isStreamFound()) return;
    }
    if (typeof node.file === 'string') reportIfVideo(node.file, 'json.file');
    if (isStreamFound()) return;
    if (typeof node.url === 'string' && isHttpUrl(node.url)) {
      var kind = String(node.type || node.kind || node.format || '').toLowerCase();
      if (VIDEO_RE.test(node.url) || VIDEO_HINT_RE.test(node.url) || /^(hls|dash|mp4|mpegurl|m3u8|mpd)$/i.test(kind)) {
        emitVideo(node.url, 'json.url');
        if (isStreamFound()) return;
      }
    }
    for (var key in node) {
      if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
      if (key === 'playlist' || key === 'file') continue;
      walkJson(node[key]);
      if (isStreamFound()) return;
    }
  }

  function inspectBody(text, url, source) {
    if (!text || isStreamFound()) return;
    var trimmed = String(text).trim();
    if (trimmed.indexOf('#EXTM3U') === 0) {
      reportPlaylist(url, source + '-hls');
      return;
    }
    if (trimmed.indexOf('<') === 0 && /<MPD[\\s>]/i.test(trimmed.slice(0, 400))) {
      reportPlaylist(url, source + '-dash');
      return;
    }
    if (trimmed.charAt(0) !== '{' && trimmed.charAt(0) !== '[') return;
    try { walkJson(JSON.parse(trimmed)); } catch (e) {}
  }

  log('hook installed');

  var MUTE_MEDIA = ${muted ? 'true' : 'false'};
  function muteMedia() {
    if (!MUTE_MEDIA) return;
    var nodes = document.querySelectorAll('video, audio');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].muted = true;
      nodes[i].defaultMuted = true;
      try { nodes[i].volume = 0; } catch (e) {}
    }
  }
  if (MUTE_MEDIA && !window.__flickScraperMuted) {
    window.__flickScraperMuted = true;
    muteMedia();
    setInterval(muteMedia, 1000);
    try {
      new MutationObserver(muteMedia).observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    } catch (e) {}
  }

  // Lowercase autoplay=true — nxsha/Videasy/VidFast check
  // searchParams.get("autoplay") === "true"; autoplay=1 and autoPlay=true are ignored.
  function withAutoplay(url) {
    if (!url || url === 'about:blank' || url === 'about:srcdoc') return url;
    try {
      var u = new URL(url, location.href);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return url;
      var current = u.searchParams.get('autoplay') || u.searchParams.get('autoPlay');
      if (current === 'true') return url;
      u.searchParams.set('autoplay', 'true');
      return u.toString();
    } catch (e) {
      return url;
    }
  }

  function harvestPlayingVideo() {
    if (isStreamFound()) return;
    var nodes = document.querySelectorAll('video');
    for (var i = 0; i < nodes.length; i++) {
      var v = nodes[i];
      var url = v.currentSrc || v.getAttribute('src') || '';
      if (!url || url.indexOf('blob:') === 0) continue;
      reportIfVideo(url, 'video.currentSrc');
      if (!v.paused && isHttpUrl(url) && !isSkippable(url) &&
          url.split('#')[0] !== location.href.split('#')[0]) {
        emitVideo(url, 'video.playing');
      }
    }
    try {
      if (window.videojs && typeof window.videojs.getPlayers === 'function') {
        var players = window.videojs.getPlayers();
        for (var k in players) {
          var p = players[k];
          if (!p || typeof p.currentSource !== 'function') continue;
          var src = p.currentSource();
          var u = src && (src.src || src.url);
          var mime = (src && src.type) || '';
          if (!u) continue;
          reportIfVideo(u, 'videojs.currentSource');
          if (isHttpUrl(u) && !isSkippable(u) && /mpegurl|m3u8|mp4|dash|mpd/i.test(mime)) {
            emitVideo(u, 'videojs.currentSource');
          }
        }
      }
    } catch (e) {}
  }

  if (!window.__flickScraperHooked) {
  window.__flickScraperHooked = true;

  var originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function() {
    this.addEventListener('load', function() {
      try {
        var responseURL = this.responseURL;
        if (!responseURL) return;
        log('xhr ' + responseURL);
        reportIfVideo(responseURL, 'xhr');
        var text = typeof this.responseText === 'string' ? this.responseText : '';
        inspectBody(text, responseURL, 'xhr');
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
          var ct = '';
          try { ct = (response.headers && response.headers.get('content-type')) || ''; } catch (e) {}
          if (!ct || /json|mpegurl|m3u8|dash|mpd|text|octet-stream|video|mpegurl|application\\/vnd/i.test(ct) || /\\/api\\//i.test(responseURL || '')) {
            response.clone().text().then(function(text) {
              inspectBody(text, responseURL, 'fetch');
            }).catch(function() {});
          }
        } catch (error) {
          log('fetch listener error: ' + error);
        }
        return response;
      });
    };
  }

  try {
    var mediaProto = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
    if (mediaProto && !mediaProto.__flickSrcHooked) {
      mediaProto.__flickSrcHooked = true;
      var srcDesc = Object.getOwnPropertyDescriptor(mediaProto, 'src');
      if (srcDesc && srcDesc.set) {
        Object.defineProperty(mediaProto, 'src', {
          configurable: true,
          enumerable: srcDesc.enumerable,
          get: function() { return srcDesc.get.call(this); },
          set: function(v) {
            reportMediaSrc(String(v || ''), 'video.src');
            srcDesc.set.call(this, v);
          }
        });
      }
      var origSetAttr = mediaProto.setAttribute;
      mediaProto.setAttribute = function(name, value) {
        if (String(name).toLowerCase() === 'src') {
          reportMediaSrc(String(value || ''), 'video.attr');
        }
        return origSetAttr.apply(this, arguments);
      };
    }
  } catch (e) {}

  // ScreenScape (video.js) sets the stream via player.src([{src, type}])
  // rather than <video>.src — VHS then fetches HLS, but the src URL often
  // has no .m3u8 suffix. Wrap Player.prototype.src once video.js loads.
  function hookVideoJsSrc() {
    try {
      var vjs = window.videojs;
      if (!vjs || vjs.__flickSrcHooked) return;
      var Player = vjs.getComponent && vjs.getComponent('Player');
      if (!Player || !Player.prototype || typeof Player.prototype.src !== 'function') return;
      vjs.__flickSrcHooked = true;
      var origVjsSrc = Player.prototype.src;
      Player.prototype.src = function(source) {
        try {
          var list = Array.isArray(source) ? source : (source ? [source] : []);
          for (var i = 0; i < list.length; i++) {
            var s = list[i];
            var url = typeof s === 'string' ? s : (s && (s.src || s.url));
            var mime = typeof s === 'object' && s ? String(s.type || '') : '';
            if (!url) continue;
            reportIfVideo(String(url), 'videojs.src');
            // Extensionless HLS/mp4: trust video.js's MIME, not a bare http URL
            // (ScreenScape also src()'s failed servers / embed pages).
            if (!isStreamFound() && isHttpUrl(url) && !isSkippable(url) &&
                /mpegurl|m3u8|mp4|dash|mpd/i.test(mime)) {
              emitVideo(String(url), 'videojs.src');
            }
          }
        } catch (e) {}
        return origVjsSrc.apply(this, arguments);
      };
      log('videojs.src hooked');
    } catch (e) {}
  }
  hookVideoJsSrc();
  harvestPlayingVideo();
  setInterval(function() {
    hookVideoJsSrc();
    harvestPlayingVideo();
  }, 1000);

  try {
    new PerformanceObserver(function(list) {
      var entries = list.getEntries();
      for (var i = 0; i < entries.length; i++) {
        reportIfVideo(entries[i].name, 'perf');
      }
    }).observe({ type: 'resource', buffered: true });
  } catch (e) {}

  // VidSrc (and similar wrappers) load the real player in a nested iframe
  // *without* forwarding autoplay, and often with a sandbox attribute that
  // blocks playback. Normalize iframe URLs to \`autoplay=true\` (the value
  // nxsha / Videasy / VidFast actually check — \`autoplay=1\` is ignored)
  // and strip sandbox *before* the iframe navigates.
  try {
    var iframeProto = window.HTMLIFrameElement && window.HTMLIFrameElement.prototype;
    if (iframeProto && !iframeProto.__flickSrcHooked) {
      iframeProto.__flickSrcHooked = true;
      var iframeSrcDesc = Object.getOwnPropertyDescriptor(iframeProto, 'src');
      if (iframeSrcDesc && iframeSrcDesc.set) {
        Object.defineProperty(iframeProto, 'src', {
          configurable: true,
          enumerable: iframeSrcDesc.enumerable,
          get: function() { return iframeSrcDesc.get.call(this); },
          set: function(v) {
            iframeSrcDesc.set.call(this, withAutoplay(String(v || '')));
          }
        });
      }
      var origIframeSetAttr = iframeProto.setAttribute;
      iframeProto.setAttribute = function(name, value) {
        var n = String(name).toLowerCase();
        if (n === 'sandbox') {
          log('blocked iframe sandbox');
          return;
        }
        if (n === 'src') value = withAutoplay(String(value || ''));
        return origIframeSetAttr.apply(this, arguments);
      };
    }
  } catch (e) {}

  } // __flickScraperHooked

  // Many embed players only start (and issue their video request) once
  // their "play" overlay is clicked. VidSrc in particular ignores
  // autoplay on its own URL and loads the real player in a nested iframe
  // — a MouseEvent on that <iframe> does not reach the inner document, so
  // we also: strip sandbox, rewrite iframe src to autoplay=true, call
  // video.play() (WebView has mediaPlaybackRequiresUserAction=false), and
  // recurse into same-origin frames. Retries until a stream is found or
  // timeoutMs elapses.
  var CENTER_CLICK_INTERVAL_MS = 1000;
  var CENTER_CLICK_TIMEOUT_MS = ${timeoutMs};
  var centerClickIntervalId = null;
  var centerClickStartedAt = 0;

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
    'button.vjs-big-play-button',
    '[aria-label*="play" i]',
    '[title="Play" i]',
    '[title="play" i]',
  ];
  var PLAY_CLASS_RE = /play-btn|playbtn|playbutton|play-button|big-play|overlay-play|icon-play|play-icon/i;
  var PLAY_TEXT_RE = /^(play|play now|play video|watch now|start watching|tap to play|click to play)$/i;

  function classNameOf(el) {
    var cls = el.className;
    if (!cls) return '';
    if (typeof cls === 'string') return cls;
    if (typeof cls.baseVal === 'string') return cls.baseVal;
    return String(cls);
  }

  function inPlayerChrome(el) {
    var n = el;
    while (n && n !== document && n !== document.documentElement) {
      var c = classNameOf(n).toLowerCase();
      if (c.indexOf('controls-bar') !== -1 || c.indexOf('control-bar') !== -1 ||
          c.indexOf('vjs-control') !== -1) return true;
      n = n.parentElement;
    }
    return false;
  }

  function isVisible(el) {
    var rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return false;
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
    return true;
  }

  function findBySelector() {
    for (var i = 0; i < PLAY_BUTTON_SELECTORS.length; i++) {
      try {
        var matches = document.querySelectorAll(PLAY_BUTTON_SELECTORS[i]);
        for (var j = 0; j < matches.length; j++) {
          if (isVisible(matches[j]) && !inPlayerChrome(matches[j])) return matches[j];
        }
      } catch (e) {}
    }
    return null;
  }

  function findByText() {
    var candidates = document.querySelectorAll('button, [role="button"], a, div, span');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var text = (el.textContent || '').trim();
      if (text && text.length <= 24 && PLAY_TEXT_RE.test(text) && isVisible(el) && !inPlayerChrome(el)) return el;
    }
    return null;
  }

  function findByClassPlay() {
    var candidates = document.querySelectorAll('button, [role="button"], a, div, span, i');
    for (var i = 0; i < candidates.length; i++) {
      if (PLAY_CLASS_RE.test(classNameOf(candidates[i])) && isVisible(candidates[i]) && !inPlayerChrome(candidates[i])) {
        return candidates[i];
      }
    }
    return null;
  }

  // Icon-only circular play buttons (e.g. nxsha's rounded-full SVG button)
  // have no "play" class/label and often no cursor:pointer.
  function findCenterIconButton() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var cx = vw / 2;
    var cy = vh / 2;
    var maxDist = Math.min(vw, vh) * 0.45;
    var buttons = document.querySelectorAll('button, [role="button"]');
    var best = null;
    var bestDist = Infinity;
    for (var i = 0; i < buttons.length; i++) {
      var el = buttons[i];
      var rect = el.getBoundingClientRect();
      if (!isVisible(el) || inPlayerChrome(el)) continue;
      if (rect.width < 24 || rect.height < 24) continue;
      if (rect.width > 220 || rect.height > 220) continue;
      var label = (el.getAttribute('aria-label') || el.getAttribute('title') || '').toLowerCase();
      var hasIcon = !!el.querySelector('svg, i') || /play/.test(label);
      var text = (el.textContent || '').trim();
      var looksRound = Math.abs(rect.width - rect.height) < 16;
      if (!hasIcon && !(looksRound && !text)) continue;
      var dist = Math.sqrt(
        Math.pow(rect.left + rect.width / 2 - cx, 2) +
        Math.pow(rect.top + rect.height / 2 - cy, 2)
      );
      if (dist <= maxDist && dist < bestDist) {
        best = el;
        bestDist = dist;
      }
    }
    return best;
  }

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
      if (!isVisible(el) || inPlayerChrome(el)) continue;
      var tag = (el.tagName || '').toLowerCase();
      var style = window.getComputedStyle(el);
      var clickable = tag === 'button' || el.getAttribute('role') === 'button' || style.cursor === 'pointer';
      if (!clickable) continue;
      var score = dist + rect.width * rect.height * 0.02;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function findVideoEl() {
    var nodes = document.querySelectorAll('video');
    for (var i = 0; i < nodes.length; i++) {
      if (isVisible(nodes[i]) || nodes[i].readyState > 0) return nodes[i];
    }
    return nodes[0] || null;
  }

  function findPlayButton() {
    return findBySelector() || findByText() || findByClassPlay() ||
      findCenterIconButton() || findNearCenterClickable() || findVideoEl();
  }

  function dispatchClick(el, x, y) {
    var opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      button: 0,
      buttons: 1,
    };
    try {
      el.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, view: window,
        clientX: x, clientY: y, button: 0, buttons: 1,
        pointerId: 1, pointerType: 'touch', isPrimary: true
      }));
    } catch (e) {}
    try { el.dispatchEvent(new MouseEvent('mousedown', opts)); } catch (e) {}
    try {
      el.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, view: window,
        clientX: x, clientY: y, button: 0, buttons: 1,
        pointerId: 1, pointerType: 'touch', isPrimary: true
      }));
    } catch (e) {}
    try { el.dispatchEvent(new MouseEvent('mouseup', opts)); } catch (e) {}
    try { el.click(); } catch (e) {}
    try { el.dispatchEvent(new MouseEvent('click', opts)); } catch (e) {}
  }

  function playAllMedia(root) {
    root = root || document;
    var nodes = root.querySelectorAll('video, audio');
    for (var i = 0; i < nodes.length; i++) {
      try {
        nodes[i].setAttribute('playsinline', '');
        nodes[i].setAttribute('webkit-playsinline', '');
        if (MUTE_MEDIA) {
          nodes[i].muted = true;
          nodes[i].defaultMuted = true;
        }
        var p = nodes[i].play();
        if (p && p.catch) p.catch(function() {});
      } catch (e) {}
    }
    try {
      if (window.videojs && typeof window.videojs.getPlayers === 'function') {
        var players = window.videojs.getPlayers();
        for (var k in players) {
          if (!players[k]) continue;
          try { if (MUTE_MEDIA && players[k].muted) players[k].muted(true); } catch (e) {}
          try { players[k].play(); } catch (e) {}
        }
      }
    } catch (e) {}
    try {
      if (typeof window.jwplayer === 'function') {
        var jw = window.jwplayer();
        if (jw && jw.play) jw.play();
      }
    } catch (e) {}
  }

  function unlockIframes() {
    var frames = document.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      if (f.hasAttribute('sandbox')) {
        f.removeAttribute('sandbox');
        log('removed iframe sandbox');
      }
      try {
        var allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
        if (f.getAttribute('allow') !== allow) f.setAttribute('allow', allow);
      } catch (e) {}
      var src = f.getAttribute('src') || '';
      if (!src) continue;
      var next = withAutoplay(src);
      if (next && next !== src) {
        log('iframe autoplay rewrite ' + src + ' -> ' + next);
        f.src = next;
      }
    }
    promotePlayerIframe();
  }

  // Android WebView only injects our hooks into the *main* frame, so a
  // VidSrc-style wrapper (video playing in a cross-origin iframe) never
  // reports the stream. Navigate the WebView to that iframe's src so the
  // next load runs the scraper inside the real player document.
  var PLAYER_IFRAME_RE = /\\/embed|\\/player|\\/watch|\\/tv\\/|\\/movie\\/|nxsha|videasy|vidfast|vidsrc|cinesrc|screenscape|vidlink/i;
  function promotePlayerIframe() {
    if (isStreamFound()) return false;
    var count = window.__flickPromoteCount || 0;
    if (count >= 3) return false;
    var vw = window.innerWidth || 1;
    var vh = window.innerHeight || 1;
    var frames = document.querySelectorAll('iframe');
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      var src = f.src || f.getAttribute('src') || '';
      if (!src || src === 'about:blank') continue;
      try { src = new URL(src, location.href).href; } catch (e) { continue; }
      if (!isHttpUrl(src) || SKIP_HOST_RE.test(src)) continue;
      if (src.split('#')[0] === location.href.split('#')[0]) continue;
      var rect = f.getBoundingClientRect();
      var fills = rect.width >= vw * 0.45 && rect.height >= vh * 0.45;
      var looksPlayer = PLAYER_IFRAME_RE.test(src);
      if (!fills && !looksPlayer) continue;
      var score = rect.width * rect.height + (looksPlayer ? 10000000 : 0);
      if (score > bestScore) {
        best = src;
        bestScore = score;
      }
    }
    if (!best) return false;
    window.__flickPromoteCount = count + 1;
    log('promoting iframe to top: ' + best);
    try { location.replace(best); } catch (e) {}
    return true;
  }

  function clickInsideIframe(iframe, x, y) {
    try {
      var doc = iframe.contentDocument;
      if (!doc) return false;
      var rect = iframe.getBoundingClientRect();
      var ix = x - rect.left;
      var iy = y - rect.top;
      var inner = doc.elementFromPoint(ix, iy) || doc.querySelector('video, button, [role="button"]') || doc.body;
      if (inner && inner !== doc.documentElement) {
        dispatchClick(inner, ix, iy);
        log('clicked inside same-origin iframe: ' + (inner.tagName || 'unknown'));
      }
      playAllMedia(doc);
      return true;
    } catch (e) {
      return false;
    }
  }

  function stopCenterClicking() {
    if (centerClickIntervalId !== null) {
      clearInterval(centerClickIntervalId);
      centerClickIntervalId = null;
    }
  }

  function clickCenter() {
    if (isStreamFound()) {
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
      unlockIframes();
      if (promotePlayerIframe()) return;
      playAllMedia();
      harvestPlayingVideo();
      // ScreenScape's play button toggles pause and its control bar also
      // switches *their* server. Once a <video> is loading/playing, only
      // call play() — a second click pauses the stream and trips failover.
      var videos = document.querySelectorAll('video');
      var mediaArmed = false;
      for (var vi = 0; vi < videos.length; vi++) {
        if (!videos[vi].paused || videos[vi].readyState > 0 || videos[vi].currentSrc) {
          mediaArmed = true;
          break;
        }
      }
      if (mediaArmed) {
        log('video already started, skipping overlay click');
        return;
      }
      var target = findPlayButton();
      var x, y;
      if (target) {
        var rect = target.getBoundingClientRect();
        x = Math.floor(rect.left + rect.width / 2);
        y = Math.floor(rect.top + rect.height / 2);
        log('found play button: ' + (classNameOf(target) || target.tagName));
      } else {
        x = Math.floor(window.innerWidth / 2);
        y = Math.floor(window.innerHeight / 2);
        target = document.elementFromPoint(x, y);
        log('no known play button matched, falling back to viewport center');
      }
      if (!target) { log('center click: nothing at ' + x + ',' + y); return; }
      if ((target.tagName || '').toLowerCase() === 'iframe') {
        if (clickInsideIframe(target, x, y)) return;
        log('iframe is cross-origin; promoting instead of clicking');
        if (promotePlayerIframe()) return;
      }
      dispatchClick(target, x, y);
      if ((target.tagName || '').toLowerCase() === 'video') {
        try {
          var playP = target.play();
          if (playP && playP.catch) playP.catch(function() {});
        } catch (e) {}
      }
      log('click dispatched on ' + (target.tagName || 'unknown'));
    } catch (e) {
      log('center click error: ' + e);
    }
  }

  // Start immediately — don't wait for window 'load'. Nested/fast-loading
  // frames often fire load before this script is injected, so a load
  // listener would never run. MutationObserver catches play overlays and
  // iframes that appear after first paint (VidSrc's delayed iframe.src).
  function hidePlayerChrome() {
    if (window.__flickChromeHidden || !document.documentElement) return;
    window.__flickChromeHidden = true;
    try {
      var s = document.createElement('style');
      s.textContent = '.controls-bar,.vjs-control-bar,.vjs-big-play-button{opacity:0!important;pointer-events:none!important}';
      (document.head || document.documentElement).appendChild(s);
    } catch (e) {}
  }

  function startCenterClickLoop() {
    if (centerClickStartedAt !== 0 || window.__flickScraperClicking) return;
    window.__flickScraperClicking = true;
    centerClickStartedAt = Date.now();
    hidePlayerChrome();
    unlockIframes();
    clickCenter();
    centerClickIntervalId = setInterval(clickCenter, CENTER_CLICK_INTERVAL_MS);
    try {
      new MutationObserver(function() {
        if (isStreamFound()) return;
        unlockIframes();
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  }

  var AUTO_TAP = ${autoTap ? 'true' : 'false'};
  if (AUTO_TAP) {
    startCenterClickLoop();
  } else {
    log('auto tap disabled (debug)');
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
  muted,
  autoTap,
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

  const muteMedia = muted ?? !debug;
  const shouldAutoTap = autoTap ?? !debug;
  const injectedJavaScript = useMemo(
    () => buildInjectedJavaScript(timeoutMs, muteMedia, shouldAutoTap),
    [timeoutMs, muteMedia, shouldAutoTap],
  );

  // Reset the WebView when the target changes.
  useEffect(() => {
    hasExtractedDataRef.current = false;
    log('loading embed:', embedUrl);
    setWebViewKey((prev) => prev + 1);
  }, [embedUrl]);

  const emitExtracted = useCallback(
    (url: string, isWebM: boolean) => {
      if (hasExtractedDataRef.current) return;
      hasExtractedDataRef.current = true;
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
      log('resolved stream:', url, `(webm=${isWebM})`);
      onDataExtracted({ videoUrl: url, isWebM });
      onLoading?.(false);
    },
    [onDataExtracted, onLoading],
  );

  const extractFromUrl = useCallback(
    (url?: string) => {
      if (!url || !NATIVE_VIDEO_RE.test(url)) return;
      emitExtracted(url, /\.webm($|\?)/i.test(url));
    },
    [emitExtracted],
  );

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

      if (data.type === 'video' && data.responseURL) {
        emitExtracted(data.responseURL, !!data.isWebM);
      }
    },
    [emitExtracted, onError],
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
        // Patch fetch/XHR/<video>.src before the page's own JS runs so we
        // catch VidLink's /api/b/* JSON and the subsequent playlist request.
        injectedJavaScriptBeforeContentLoaded={injectedJavaScript}
        injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
        // Inject into nested (cross-origin) iframes too - the stream request
        // originates inside the embedded player frame, not the top document.
        injectedJavaScriptForMainFrameOnly={false}
        onMessage={handleMessage}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        onShouldStartLoadWithRequest={(req) => {
          log('navigation:', req.url);
          // Native media loads (esp. iOS HLS) sometimes show up here
          // instead of going through the page's fetch/XHR hooks.
          extractFromUrl(req.url);
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
        style={
          visible
            ? StyleSheet.absoluteFill
            : [StyleSheet.absoluteFill, styles.webviewHidden]
        }
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
  // Android often ignores opacity on a parent View wrapping a WebView, so
  // hide the WebView itself too — otherwise ScreenScape's control bar is
  // visible during a scrape and our auto-click hits its server switcher.
  webviewHidden: {
    opacity: 0,
  },
});
