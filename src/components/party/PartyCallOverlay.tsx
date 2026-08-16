import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { RTCView } from 'react-native-webrtc';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { Focusable } from '@/src/components/Focusable';
import type { PartyRtcRemote } from '@/src/hooks/usePartyRtc';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

const SPEAK_HOLD_MS = 1000;
const SPEAK_THRESHOLD = 0.04;

interface PartyCallOverlayProps {
  localStreamURL: string | null;
  remotes: PartyRtcRemote[];
  camOff: boolean;
  hidden: boolean;
  onToggleHidden: () => void;
}

const Tile = ({
  streamURL,
  label,
  mirror,
  placeholder,
  speaking,
}: {
  streamURL: string | null;
  label: string;
  mirror?: boolean;
  placeholder?: boolean;
  speaking?: boolean;
}) => (
  <Box
    className={`h-28 w-20 overflow-hidden rounded-md border bg-card ${
      speaking ? 'border-primary' : 'border-border'
    }`}
  >
    {streamURL && !placeholder ? (
      <RTCView
        streamURL={streamURL}
        style={StyleSheet.absoluteFill}
        objectFit="cover"
        mirror={mirror}
      />
    ) : (
      <Box className="h-full w-full items-center justify-center bg-muted">
        <Text size="xs" className="text-muted-foreground">
          {label.slice(0, 1).toUpperCase()}
        </Text>
      </Box>
    )}
    <Box className="absolute inset-x-0 bottom-0 bg-background/70 px-1 py-0.5">
      <Text size="xs" numberOfLines={1} className="text-foreground">
        {label}
      </Text>
    </Box>
  </Box>
);

export const PartyCallOverlay = ({
  localStreamURL,
  remotes,
  camOff,
  hidden,
  onToggleHidden,
}: PartyCallOverlayProps) => {
  const [speakerId, setSpeakerId] = useState<string | null>(null);
  const speakerUntilRef = useRef(0);

  useEffect(() => {
    if (remotes.length === 0) {
      setSpeakerId(null);
      speakerUntilRef.current = 0;
      return;
    }
    const loudest = [...remotes].sort(
      (a, b) => (b.audioLevel ?? 0) - (a.audioLevel ?? 0),
    )[0];
    const now = Date.now();
    if (loudest && (loudest.audioLevel ?? 0) >= SPEAK_THRESHOLD) {
      setSpeakerId(loudest.id);
      speakerUntilRef.current = now + SPEAK_HOLD_MS;
    } else if (now > speakerUntilRef.current) {
      setSpeakerId(null);
    }
  }, [remotes]);

  const sortedRemotes = useMemo(() => {
    return [...remotes].sort((a, b) => {
      if (a.id === speakerId) return -1;
      if (b.id === speakerId) return 1;
      return (b.audioLevel ?? 0) - (a.audioLevel ?? 0);
    });
  }, [remotes, speakerId]);

  if (!localStreamURL && remotes.length === 0) return null;

  return (
    <Box
      pointerEvents="box-none"
      className="absolute top-16 right-3 z-30 max-h-[60%] items-end"
    >
      <Focusable
        onPress={onToggleHidden}
        className="mb-2 rounded-full bg-background/70 p-2"
        focusedClassName={`bg-primary/20 ${TV_FOCUS_BORDER_CLASSNAME}`}
      >
        <Icon
          as={hidden ? Eye : EyeOff}
          size="sm"
          className="text-foreground"
        />
      </Focusable>
      {hidden ? null : (
        <ScrollView
          style={{ maxHeight: 280 }}
          contentContainerClassName="items-end gap-2"
        >
          {localStreamURL ? (
            <Tile
              streamURL={localStreamURL}
              label="You"
              mirror
              placeholder={camOff}
            />
          ) : null}
          {sortedRemotes.map((remote) => (
            <Tile
              key={remote.id}
              streamURL={remote.streamURL}
              label={remote.name}
              speaking={remote.id === speakerId}
            />
          ))}
        </ScrollView>
      )}
    </Box>
  );
};
