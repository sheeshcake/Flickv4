import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

interface SubtitleOverlayProps {
  subtitleContent: string | null;
  currentTime: number;
  isVideoFullscreen: boolean;
}

const parseSRT = (srtContent: string): SubtitleCue[] => {
  const cues: SubtitleCue[] = [];
  
  // Split by double newline to get subtitle blocks
  const blocks = srtContent.trim().split(/\r?\n\r?\n/);
  
  for (const block of blocks) {
    const lines = block.trim().split(/\r?\n/);
    if (lines.length < 3) continue;
    
    // Find the timestamp line (contains -->)
    const timestampIndex = lines.findIndex(line => line.includes('-->'));
    if (timestampIndex === -1) continue;
    
    const timestampLine = lines[timestampIndex];
    const textLines = lines.slice(timestampIndex + 1);
    
    // Parse SRT timestamps: 00:00:01,000 --> 00:00:03,500
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
    
    // Clean text (remove tags and extra whitespace)
    const text = textLines
      .join('\n')
      .replace(/<[^>]*>/g, '') // Remove HTML tags
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
}) => {
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [currentCue, setCurrentCue] = useState<string | null>(null);

  useEffect(() => {
    if (subtitleContent) {
      try {
        const parsedCues = parseSRT(subtitleContent);
        setCues(parsedCues);
        console.log('[SubtitleOverlay] Parsed SRT cues:', parsedCues.length);
      } catch (error) {
        console.error('[SubtitleOverlay] Failed to parse SRT:', error);
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

    const adjustedTime = currentTime + 0.5;
    const activeCue = cues.find(
      cue => adjustedTime >= cue.start && adjustedTime <= cue.end
    );

    setCurrentCue(activeCue ? activeCue.text : null);
  }, [currentTime, cues]);

  if (!currentCue) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.textContainer}>
        <Text style={[styles.text, isVideoFullscreen && { fontSize: 18 }]}>{currentCue}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  textContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    maxWidth: '100%',
  },
  text: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 1)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
});
