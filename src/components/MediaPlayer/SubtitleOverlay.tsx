import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ViewStyle, TextStyle } from 'react-native';
import { SubtitleStyle, DEFAULT_SUBTITLE_STYLE } from '../../types';

interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

interface SubtitleOverlayProps {
  subtitleContent: string | null;
  currentTime: number;
  isVideoFullscreen: boolean;
  delay?: number;
  style?: SubtitleStyle;
}

const parseSRT = (srtContent: string): SubtitleCue[] => {
  const cues: SubtitleCue[] = [];
  
  const blocks = srtContent.trim().split(/\r?\n\r?\n/);
  
  for (const block of blocks) {
    const lines = block.trim().split(/\r?\n/);
    if (lines.length < 3) continue;
    
    const timestampIndex = lines.findIndex(line => line.includes('-->'));
    if (timestampIndex === -1) continue;
    
    const timestampLine = lines[timestampIndex];
    const textLines = lines.slice(timestampIndex + 1);
    
    const match = timestampLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
    if (!match) continue;
    
    const startHours = parseInt(match[1], 10);
    const startMinutes = parseInt(match[2], 10);
    const startSeconds = parseFloat(`${match[3]}.${match[4]}`);
    const endHours = parseInt(match[5], 10);
    const endMinutes = parseInt(match[6], 10);
    const endSeconds = parseFloat(`${match[7]}.${match[8]}`);
    
    const start = startHours * 3600 + startMinutes * 60 + startSeconds;
    const end = endHours * 3600 + endMinutes * 60 + endSeconds;
    
    const text = textLines
      .join('\n')
      .replace(/<[^>]*>/g, '')
      .trim();
    
    if (text) {
      cues.push({ start, end, text });
    }
  }
  
  return cues;
};

export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({
  subtitleContent,
  currentTime,
  isVideoFullscreen,
  delay = 0,
  style = DEFAULT_SUBTITLE_STYLE,
}) => {
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [currentCue, setCurrentCue] = useState<string | null>(null);

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

  const containerStyle: ViewStyle = useMemo(() => ({
    position: 'absolute',
    alignItems: 'center',
    paddingHorizontal: 20,
    ...(style.position === 'top' ? { top: 50 } : { bottom: isVideoFullscreen ? -70 : 20 }),
  }), [style.position, isVideoFullscreen]);

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
        const parsedCues = parseSRT(subtitleContent);
        setCues(parsedCues);
      } catch {
      }
    } else {
      setCues([]);
      setCurrentCue(null);
    }
  }, [subtitleContent]);

  useEffect(() => {
    if (cues.length === 0) {
      setCurrentCue(null);
      return;
    }

    const adjustedTime = currentTime - delay + 0.5;
    const activeCue = cues.find(
      cue => adjustedTime >= cue.start && adjustedTime <= cue.end
    );

    setCurrentCue(activeCue ? activeCue.text : null);
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
