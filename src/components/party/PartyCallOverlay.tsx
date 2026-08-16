import { StyleSheet } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { RTCView } from 'react-native-webrtc';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { Focusable } from '@/src/components/Focusable';
import type { PartyRtcRemote } from '@/src/hooks/usePartyRtc';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

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
}: {
  streamURL: string | null;
  label: string;
  mirror?: boolean;
  placeholder?: boolean;
}) => (
  <Box className="h-28 w-20 overflow-hidden rounded-md border border-border bg-card">
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
  if (!localStreamURL && remotes.length === 0) return null;

  return (
    <Box
      pointerEvents="box-none"
      className="absolute top-16 right-3 z-30 items-end gap-2"
    >
      <Focusable
        onPress={onToggleHidden}
        className="rounded-full bg-background/70 p-2"
        focusedClassName={`bg-primary/20 ${TV_FOCUS_BORDER_CLASSNAME}`}
      >
        <Icon
          as={hidden ? Eye : EyeOff}
          size="sm"
          className="text-foreground"
        />
      </Focusable>
      {hidden ? null : (
        <>
          {localStreamURL ? (
            <Tile
              streamURL={localStreamURL}
              label="You"
              mirror
              placeholder={camOff}
            />
          ) : null}
          {remotes.map((remote) => (
            <Tile
              key={remote.id}
              streamURL={remote.streamURL}
              label={remote.name}
            />
          ))}
        </>
      )}
    </Box>
  );
};
