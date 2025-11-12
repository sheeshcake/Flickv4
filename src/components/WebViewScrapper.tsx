import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

// TypeScript interfaces
interface WebViewScrapperProps {
  tmdbId: number;
  seasonNumber?: number;
  episodeNumber?: number;
  type: 'movie' | 'tv';
  onDataExtracted: (data: { videoUrl: string; isWebM: boolean }) => void;
  onLoading?: (isLoading: boolean) => void;
  onError?: (error: string) => void;
}

interface MessageData {
  type: string;
  responseURL: string;
  isWebM: boolean;
}

// Constants
const LOAD_END_DELAY = 60000; // ms
const VIDFAST_SERVER_URL = 'https://vidfast.pro';

// Injected JavaScript - extracted as constant
const INJECTED_JAVASCRIPT = `
(function() {
  const originalOpen = XMLHttpRequest.prototype.open;
  
  XMLHttpRequest.prototype.open = function() {
    this.addEventListener('load', function() {
      try {
        const responseURL = this.responseURL;
        if (!responseURL) return;
        
        // Check for video files (m3u8, mp4, webm, mkv)
        const isVideo = /\\.(m3u8|mp4|webm|mkv)($|\\?)/i.test(responseURL);

        if (isVideo) {
          window.ReactNativeWebView?.postMessage(JSON.stringify({
            type: 'video',
            responseURL: responseURL,
            isWebM: /\\.webm($|\\?)/i.test(responseURL)
          }));
        }
      } catch (error) {
        console.error('Error in XMLHttpRequest listener:', error);
      }
    });
    
    originalOpen.apply(this, arguments);
  };
})();
`;

/**
 * Optimized WebViewScrapper component for extracting video URLs
 * Features:
 * - Efficient state management with refs to prevent unnecessary re-renders
 * - Automatic cleanup of timers and loading states
 * - Better error handling and logging
 * - Optimized URL construction with memoization
 */
const WebViewScrapper: React.FC<WebViewScrapperProps> = ({ 
  tmdbId, 
  seasonNumber, 
  episodeNumber, 
  type, 
  onDataExtracted, 
  onLoading,
  onError 
}) => {
  const [webViewKey, setWebViewKey] = useState(0);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasExtractedDataRef = useRef(false);

  const videoUrl = useMemo(() => {
    let url = `${VIDFAST_SERVER_URL}/${type}/${tmdbId}`;
    
    if (type === 'tv' && seasonNumber != null && episodeNumber != null) {
      url += `/${seasonNumber}/${episodeNumber}`;
    }

    return `${url}?autoPlay=true`;
  }, [tmdbId, seasonNumber, episodeNumber, type]);

  // Reset WebView when dependencies change
  useEffect(() => {
    hasExtractedDataRef.current = false;
    setWebViewKey(prevKey => prevKey + 1);
  }, [tmdbId, seasonNumber, episodeNumber, type]);

  // Handle messages from WebView
  const handleMessage = useCallback((event: any) => {
    // Prevent duplicate data extraction
    if (hasExtractedDataRef.current) return;

    try {
      const data: MessageData = JSON.parse(event.nativeEvent.data);
      
      if (data.type === 'video' && data.responseURL) {
        hasExtractedDataRef.current = true;
        
        // Clear loading timer
        if (loadingTimerRef.current) {
          clearTimeout(loadingTimerRef.current);
          loadingTimerRef.current = null;
        }

        onDataExtracted({
          videoUrl: data.responseURL,
          isWebM: data.isWebM,
        });
        
        onLoading?.(false);
        
        console.log('[WebViewScrapper] Video URL extracted:', {
          url: data.responseURL.substring(0, 50) + '...',
          isWebM: data.isWebM,
        });
      }
    } catch (error) {
      console.error('[WebViewScrapper] Failed to parse message:', error);
      onError?.('Failed to parse video data');
    }
  }, [onDataExtracted, onLoading, onError]);

  // Handle WebView load start
  const handleLoadStart = useCallback(() => {
    onLoading?.(true);
  }, [onLoading]);

  // Handle WebView load end with timeout fallback
  const handleLoadEnd = useCallback(() => {
    // Clear any existing timer
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
    }

    // Set fallback timer to stop loading
    loadingTimerRef.current = setTimeout(() => {
      if (!hasExtractedDataRef.current) {
        console.log('[WebViewScrapper] Load timeout reached without data extraction');
        onLoading?.(false);
      }
    }, LOAD_END_DELAY);
  }, [onLoading]);

  // Handle WebView errors
  const handleError = useCallback((syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.error('[WebViewScrapper] WebView error:', nativeEvent);
    
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
    
    onLoading?.(false);
    onError?.('WebView load error');
  }, [onLoading, onError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
      }
    };
  }, []);

  return (
    <View style={styles.hiddenContainer}>
      <WebView
        key={webViewKey}
        source={{ uri: videoUrl }}
        injectedJavaScript={INJECTED_JAVASCRIPT}
        onMessage={handleMessage}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        onShouldStartLoadWithRequest={() => true}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        useWebKit
        // Performance optimizations
        cacheEnabled={false}
        incognito
        thirdPartyCookiesEnabled={false}
        sharedCookiesEnabled={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  hiddenContainer: {
    position: 'absolute' as const,
    top: -10000,
    left: -10000,
    width: 1,
    height: 1,
    opacity: 0,
  },
});

export default React.memo(WebViewScrapper);