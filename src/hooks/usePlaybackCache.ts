import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppState } from './useAppState';
import { DEFAULT_PLAYBACK_CACHE } from '../types';
import {
  playbackCacheService,
  PlaybackCacheStatus,
} from '../services/PlaybackCacheService';
import { isM3U8Url } from '../utils/m3u8';

interface UsePlaybackCacheOptions {
  videoUrl: string;
  initialProgress?: number;
  enabled?: boolean;
}

interface UsePlaybackCacheResult {
  playbackUrl: string;
  cacheStatus: PlaybackCacheStatus;
  onPlaybackProgress: (timeSec: number) => void;
  onPlaybackEnd: () => void;
  isCacheLoading: boolean;
}

export function usePlaybackCache({
  videoUrl,
  initialProgress = 0,
  enabled = true,
}: UsePlaybackCacheOptions): UsePlaybackCacheResult {
  const { state } = useAppState();
  const preferences = state.user.preferences.playbackCache ?? DEFAULT_PLAYBACK_CACHE;
  const cacheEnabled = enabled && preferences.enabled && isM3U8Url(videoUrl);

  const [playbackUrl, setPlaybackUrl] = useState(videoUrl);
  const [isCacheLoading, setIsCacheLoading] = useState(cacheEnabled);
  const [cacheStatus, setCacheStatus] = useState<PlaybackCacheStatus>(
    playbackCacheService.getCacheStatus(),
  );
  const sessionVideoUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      if (!cacheEnabled || !videoUrl) {
        setPlaybackUrl(videoUrl);
        setIsCacheLoading(false);
        return;
      }

      if (sessionVideoUrlRef.current === videoUrl) {
        return;
      }

      sessionVideoUrlRef.current = videoUrl;
      setIsCacheLoading(true);

      try {
        const url = await playbackCacheService.startSession({
          videoUrl,
          startTimeSec: initialProgress,
          preferences,
        });
        if (!cancelled) {
          setPlaybackUrl(url);
        }
      } catch (error) {
        console.warn('[usePlaybackCache] Failed to start cache session:', error);
        if (!cancelled) {
          setPlaybackUrl(videoUrl);
        }
      } finally {
        if (!cancelled) {
          setIsCacheLoading(false);
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      sessionVideoUrlRef.current = null;
      playbackCacheService.endSession();
    };
  }, [videoUrl, cacheEnabled, initialProgress, preferences.enabled, preferences.storage, preferences.maxSizeMB, preferences.readAheadSeconds, preferences.preBufferSeconds]);

  useEffect(() => {
    const unsubscribe = playbackCacheService.addStatusListener(setCacheStatus);
    return unsubscribe;
  }, []);

  const onPlaybackProgress = useCallback((timeSec: number) => {
    if (cacheEnabled) {
      playbackCacheService.updatePlayhead(timeSec);
    }
  }, [cacheEnabled]);

  const onPlaybackEnd = useCallback(() => {
    sessionVideoUrlRef.current = null;
    playbackCacheService.endSession();
  }, []);

  return {
    playbackUrl: cacheEnabled ? playbackUrl : videoUrl,
    cacheStatus,
    onPlaybackProgress,
    onPlaybackEnd,
    isCacheLoading,
  };
}
