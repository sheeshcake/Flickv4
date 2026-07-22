import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import {
  VIDEO_ASPECT_OPTIONS,
  type VideoAspect,
} from '@/src/hooks/useVideoAspect';

interface VideoAspectSheetProps {
  visible: boolean;
  selected: VideoAspect;
  onSelect: (next: VideoAspect) => void;
  onClose: () => void;
}

export const VideoAspectSheet = ({
  visible,
  selected,
  onSelect,
  onClose,
}: VideoAspectSheetProps) => {
  if (!visible) return null;

  return (
    <Box style={StyleSheet.absoluteFill} className="z-50">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Box className="h-full w-full bg-background/70" />
      </Pressable>
      <Box className="absolute bottom-0 left-0 right-0 max-h-[50%] rounded-t-2xl bg-card px-4 pb-8 pt-4">
        <Heading size="md" className="mb-3 text-foreground">
          Video aspect
        </Heading>
        <ScrollView>
          <VStack space="xs">
            {VIDEO_ASPECT_OPTIONS.map((opt) => (
              <AspectRow
                key={opt.value}
                label={opt.label}
                hint={opt.hint}
                active={selected === opt.value}
                onPress={() => {
                  onSelect(opt.value);
                  onClose();
                }}
              />
            ))}
          </VStack>
        </ScrollView>
      </Box>
    </Box>
  );
};

const AspectRow = ({
  label,
  hint,
  active,
  onPress,
}: {
  label: string;
  hint?: string;
  active: boolean;
  onPress: () => void;
}) => (
  <Pressable onPress={onPress}>
    <Box className={`rounded-md px-3 py-3 ${active ? 'bg-primary/20' : ''}`}>
      <HStack className="items-center justify-between">
        <Text
          className={
            active ? 'font-semibold text-foreground' : 'text-muted-foreground'
          }
        >
          {label}
        </Text>
        {!!hint && (
          <Text size="xs" className="text-muted-foreground">
            {hint}
          </Text>
        )}
      </HStack>
    </Box>
  </Pressable>
);
