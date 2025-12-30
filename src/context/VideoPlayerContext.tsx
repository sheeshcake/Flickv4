import React, {createContext, useContext, useState, useCallback, ReactNode} from 'react';
import {Movie, TVShow} from '../types';

interface VideoPlayerState {
  content: Movie | TVShow | null;
  videoUrl: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  selectedSeason?: number;
  selectedEpisode?: number;
}

interface VideoPlayerContextType {
  playerState: VideoPlayerState;
  openDetailSheet: (content: Movie | TVShow) => void;
  closeDetailSheet: () => void;
  setVideoUrl: (url: string) => void;
  setPlaybackState: (isPlaying: boolean, currentTime?: number, duration?: number) => void;
  setEpisodeInfo: (season?: number, episode?: number) => void;
}

const VideoPlayerContext = createContext<VideoPlayerContextType | undefined>(undefined);

export const VideoPlayerProvider: React.FC<{children: ReactNode}> = ({children}) => {
  const [playerState, setPlayerState] = useState<VideoPlayerState>({
    content: null,
    videoUrl: '',
    isPlaying: false,
    currentTime: 0,
    duration: 0,
  });

  const openDetailSheet = useCallback((content: Movie | TVShow) => {
    setPlayerState(prev => ({
      ...prev,
      content,
    }));
  }, []);

  const closeDetailSheet = useCallback(() => {
    setPlayerState({
      content: null,
      videoUrl: '',
      isPlaying: false,
      currentTime: 0,
      duration: 0,
    });
  }, []);

  const setVideoUrl = useCallback((url: string) => {
    setPlayerState(prev => ({
      ...prev,
      videoUrl: url,
    }));
  }, []);

  const setPlaybackState = useCallback(
    (isPlaying: boolean, currentTime?: number, duration?: number) => {
      setPlayerState(prev => ({
        ...prev,
        isPlaying,
        ...(currentTime !== undefined && {currentTime}),
        ...(duration !== undefined && {duration}),
      }));
    },
    [],
  );

  const setEpisodeInfo = useCallback((season?: number, episode?: number) => {
    setPlayerState(prev => ({
      ...prev,
      selectedSeason: season,
      selectedEpisode: episode,
    }));
  }, []);

  return (
    <VideoPlayerContext.Provider
      value={{
        playerState,
        openDetailSheet,
        closeDetailSheet,
        setVideoUrl,
        setPlaybackState,
        setEpisodeInfo,
      }}>
      {children}
    </VideoPlayerContext.Provider>
  );
};

export const useVideoPlayer = () => {
  const context = useContext(VideoPlayerContext);
  if (!context) {
    throw new Error('useVideoPlayer must be used within VideoPlayerProvider');
  }
  return context;
};
