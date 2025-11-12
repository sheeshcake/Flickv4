import type { ViewStyle } from 'react-native';
import type React from 'react';

export type VideoStatus = 'loading' | 'loaded' | 'error';

export interface ControlsProps {
  hide: boolean;
  title: string;
  _link?: boolean;
  _movie?: any;
  readyNext: boolean;
  playing: boolean;
  currentPosition: number;
  duration: number;
  bufferedPosition?: number;
  fullscreen: boolean;
  onFullscreen: () => void;
  _isBuffering?: boolean;
  onResize: () => void;
  _resize?: number;
  onSeek: (time: number) => void;
  videoStatus: string;
  onHide: () => void;
  onPause: () => void;
  onPlay: () => void;
  onNext?: () => void;
  _onDownload?: () => void;
  upperRightComponent?: React.ReactNode;
  onSubtitlePress?: () => void;
  hasSubtitles?: boolean;
  onSeekingStateChange?: (isSeeking: boolean) => void;
}

export interface DoubleTapSeekAreaProps {
  onDoubleTap: () => void;
  onSingleTap: () => void;
  side: 'left' | 'right';
  style?: ViewStyle;
  seekAmountLabel: string;
}

export interface TopBarProps {
  fullscreen: boolean;
  hidden: boolean;
  title: string;
  onBackPress: () => void;
  upperRightComponent?: React.ReactNode;
}

export interface CenterOverlayProps {
  status: VideoStatus;
  loadingMessage: string;
  playing: boolean;
  hidden: boolean;
  seekIncrementSeconds: number;
  onPlayPause: () => void;
  onHide: () => void;
  onSeekBackward: () => void;
  onSeekForward: () => void;
}

export interface BottomBarProps {
  playing: boolean;
  timeLabel: string;
  hidden: boolean;
  currentPosition: number;
  duration: number;
  bufferedPosition?: number;
  hasSubtitles?: boolean;
  fullscreen: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onTimePreview: (time: number) => void;
  onSeekingStateChange: (isSeeking: boolean) => void;
  onSubtitlePress?: () => void;
  onResize: () => void;
  onFullscreen: () => void;
}

export interface ProgressBarProps {
  currentPosition: number;
  duration: number;
  bufferedPosition?: number;
  hidden: boolean;
  onSeek: (time: number) => void;
  onTimePreview: (time: number) => void;
  onSeekingStateChange: (isSeeking: boolean) => void;
}
