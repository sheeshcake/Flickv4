import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ViewStyle, TextStyle, Platform } from 'react-native';
import { SubtitleStyle, DEFAULT_SUBTITLE_STYLE } from '../../types';
import { findActiveCue, parseSrtCues } from '../../utils/subtitleUtils';

interface SubtitleOverlayProps {
  subtitleContent: string | null;
  currentTime: number;
  isVideoFullscreen: boolean;
  isNetflixStyle?: boolean;
  delay?: number;
  style?: SubtitleStyle;
}

export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({
  subtitleContent,
  currentTime,
  isVideoFullscreen,
  isNetflixStyle = false,
  delay = 0,
  style = DEFAULT_SUBTITLE_STYLE,
}) => {
  const [cues, setCues] = useState(() =>
    subtitleContent ? parseSrtCues(subtitleContent) : [],
  );

  const computedFontSize = useMemo(() => {
    const baseSizes = {
      small: isVideoFullscreen ? 14 : 10,
      medium: isVideoFullscreen ? 18 : 14,
      large: isVideoFullscreen ? 22 : 18,
      xlarge: isVideoFullscreen ? 26 : 22,
    };
    return baseSizes[style.fontSize] || baseSizes.medium;
  }, [style.fontSize, isVideoFullscreen]);

  const computedBackgroundColor = useMemo(() => {
    if (style.backgroundOpacity === 0) return 'transparent';
    const hex = style.backgroundColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${style.backgroundOpacity})`;
  }, [style.backgroundColor, style.backgroundOpacity]);

  const bottomOffset = useMemo(() => {
    if (isNetflixStyle) return 20;
    if (isVideoFullscreen) return Platform.isTV ? 100 : -65;
    return 20;
  }, [isNetflixStyle, isVideoFullscreen]);

  const containerStyle: ViewStyle = useMemo(() => ({
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
    ...(style.position === 'top' ? { top: 50 } : { bottom: bottomOffset }),
  }), [style.position, bottomOffset]);

  const textStyle: TextStyle = useMemo(() => ({
    color: style.fontColor,
    textAlign: 'center',
    fontSize: computedFontSize,
    fontWeight: style.fontWeight === 'bold' ? '700' : '400',
    textShadowColor: style.textShadow ? 'rgba(0, 0, 0, 1)' : 'transparent',
    textShadowOffset: style.textShadow ? { width: 1, height: 1 } : { width: 0, height: 0 },
    textShadowRadius: style.textShadow ? 2 : 0,
  }), [style.fontColor, style.fontWeight, style.textShadow, computedFontSize]);

  const textContainerStyle: ViewStyle = useMemo(() => ({
    backgroundColor: computedBackgroundColor,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    maxWidth: '100%',
  }), [computedBackgroundColor]);

  useEffect(() => {
    if (subtitleContent) {
      try {
        setCues(parseSrtCues(subtitleContent));
      } catch {
        setCues([]);
      }
    } else {
      setCues([]);
    }
  }, [subtitleContent]);

  const currentCue = useMemo(() => {
    if (cues.length === 0) return null;
    const adjustedTime = currentTime - delay;
    return findActiveCue(cues, adjustedTime)?.text ?? null;
  }, [currentTime, cues, delay]);

  if (!currentCue) {
    return null;
  }

  return (
    <View style={containerStyle}>
      <View style={textContainerStyle}>
        <Text style={textStyle}>{currentCue}</Text>
      </View>
    </View>
  );
};

export default SubtitleOverlay;
