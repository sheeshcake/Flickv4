import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { VStack } from '@/components/ui/vstack';

/** A single selectable entry, decoupled from how it's ultimately rendered
 * (drawn by our own `SubtitleOverlay` vs. handed to react-native-video as a
 * native sidecar text track — see `useSubtitleSettings`'s `renderMode`). */
export interface SubtitleTrackOption {
  id: string;
  label: string;
}

interface SubtitleTrackSheetProps {
  visible: boolean;
  tracks: SubtitleTrackOption[];
  selectedId: string | null;
  loading?: boolean;
  /** Shown instead of the list when `tracks` is empty and not loading. */
  emptyLabel?: string;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}

export const SubtitleTrackSheet = ({
  visible,
  tracks,
  selectedId,
  loading,
  emptyLabel = 'No subtitles found for this title.',
  onSelect,
  onClose,
}: SubtitleTrackSheetProps) => {
  if (!visible) return null;

  return (
    <Box style={StyleSheet.absoluteFill} className="z-50">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Box className="h-full w-full bg-background/70" />
      </Pressable>
      <Box className="absolute bottom-0 left-0 right-0 max-h-[50%] rounded-t-2xl bg-card px-4 pb-8 pt-4">
        <Heading size="md" className="mb-3 text-foreground">
          Subtitles
        </Heading>
        {loading ? (
          <Text className="text-muted-foreground">Loading tracks…</Text>
        ) : (
          <ScrollView>
            <VStack space="xs">
              <TrackRow
                label="Off"
                active={selectedId == null}
                onPress={() => {
                  onSelect(null);
                  onClose();
                }}
              />
              {tracks.map((track) => (
                <TrackRow
                  key={track.id}
                  label={track.label}
                  active={selectedId === track.id}
                  onPress={() => {
                    onSelect(track.id);
                    onClose();
                  }}
                />
              ))}
              {!tracks.length && (
                <Text size="sm" className="py-2 text-muted-foreground">
                  {emptyLabel}
                </Text>
              )}
            </VStack>
          </ScrollView>
        )}
      </Box>
    </Box>
  );
};

const TrackRow = ({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) => (
  <Pressable onPress={onPress}>
    <Box
      className={`rounded-md px-3 py-3 ${active ? 'bg-primary/20' : ''}`}
    >
      <Text
        className={
          active
            ? 'font-semibold text-foreground'
            : 'text-muted-foreground'
        }
      >
        {label}
      </Text>
    </Box>
  </Pressable>
);
