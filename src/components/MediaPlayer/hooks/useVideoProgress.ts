import { useCallback, useEffect, useMemo, useRef } from 'react';
import { WatchProgress } from '../../../types';

interface UseVideoProgressProps {
  contentId: number;
  contentType: 'movie' | 'tv';
  duration: number;
  currentTime: number;
  season?: number;
  episode?: number;
  selectedSubtitle: any;
  updateWatchProgress: (progress: WatchProgress) => void;
  isPlaying: boolean;
}

const PLAYBACK_START_THRESHOLD = 10; // seconds
const PROGRESS_SAVE_THRESHOLD = 5; // Save progress every 5 seconds
const PROGRESS_COMPLETION_THRESHOLD = 95; // Mark as completed at 95%

/**
 * Custom hook for managing video watch progress
 * Handles automatic saving of watch progress at intervals and on pause
 */
export const useVideoProgress = ({
  contentId,
  contentType,
  duration,
  currentTime,
  season,
  episode,
  selectedSubtitle,
  updateWatchProgress,
  isPlaying,
}: UseVideoProgressProps) => {
  const lastSavedTimeRef = useRef(0);

  // Memoized watch progress object
  const watchProgress = useMemo((): WatchProgress | null => {
    if (duration > 0 && currentTime > PLAYBACK_START_THRESHOLD) {
      const progressPercentage = (currentTime / duration) * 100;
      return {
        contentId,
        contentType,
        progress: progressPercentage,
        lastWatched: new Date(),
        duration,
        season: contentType === 'tv' ? season : undefined,
        episode: contentType === 'tv' ? episode : undefined,
        selectedSubtitle,
      };
    }
    return null;
  }, [contentId, contentType, duration, currentTime, season, episode, selectedSubtitle]);

  // Save progress function
  const saveProgress = useCallback((progress: WatchProgress) => {
    try {
      updateWatchProgress(progress);
    } catch (error) {
      console.error('[useVideoProgress] Save failed:', error);
    }
  }, [updateWatchProgress]);

  // Save progress periodically during playback
  useEffect(() => {
    if (!watchProgress || watchProgress.progress >= PROGRESS_COMPLETION_THRESHOLD) {
      return;
    }

    // Check if enough time has passed since last save
    const timeSinceLastSave = Math.floor(currentTime) - lastSavedTimeRef.current;
    
    if (timeSinceLastSave >= PROGRESS_SAVE_THRESHOLD && Math.floor(currentTime) % PROGRESS_SAVE_THRESHOLD === 0) {
      saveProgress(watchProgress);
      lastSavedTimeRef.current = Math.floor(currentTime);
    }

    // Mark as completed if threshold reached
    if (watchProgress.progress >= PROGRESS_COMPLETION_THRESHOLD) {
      saveProgress({
        ...watchProgress,
        progress: 100,
      });
    }
  }, [watchProgress, currentTime, saveProgress]);

  // Save progress on pause
  useEffect(() => {
    if (!isPlaying && watchProgress && watchProgress.progress < PROGRESS_COMPLETION_THRESHOLD) {
      saveProgress(watchProgress);
    }
  }, [isPlaying, watchProgress, saveProgress]);

  // Save progress on unmount
  useEffect(() => {
    return () => {
      if (watchProgress && watchProgress.progress < PROGRESS_COMPLETION_THRESHOLD) {
        saveProgress(watchProgress);
      }
    };
  }, [watchProgress, saveProgress]);

  return { watchProgress };
};
