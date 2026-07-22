import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { VStack } from '@/components/ui/vstack';
import type { Variant } from '@/src/utils/hlsVariants';

interface VideoQualitySheetProps {
  visible: boolean;
  variants: Variant[];
  /** `null` means "Auto" (master ABR). */
  selectedUri: string | null;
  onSelect: (variant: Variant | null) => void;
  onClose: () => void;
}

const formatBitrate = (bps: number): string => {
  if (!bps) return '';
  const mbps = bps / 1_000_000;
  if (mbps >= 1) return `${mbps.toFixed(1)} Mbps`;
  return `${Math.round(bps / 1000)} kbps`;
};

export const VideoQualitySheet = ({
  visible,
  variants,
  selectedUri,
  onSelect,
  onClose,
}: VideoQualitySheetProps) => {
  if (!visible) return null;

  return (
    <Box style={StyleSheet.absoluteFill} className="z-50">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Box className="h-full w-full bg-background/70" />
      </Pressable>
      <Box className="absolute bottom-0 left-0 right-0 max-h-[50%] rounded-t-2xl bg-card px-4 pb-8 pt-4">
        <Heading size="md" className="mb-3 text-foreground">
          Video quality
        </Heading>
        <ScrollView>
          <VStack space="xs">
            <QualityRow
              label="Auto"
              hint="Adaptive"
              active={selectedUri == null}
              onPress={() => {
                onSelect(null);
                onClose();
              }}
            />
            {variants.map((v) => (
              <QualityRow
                key={v.uri}
                label={v.label}
                hint={formatBitrate(v.bandwidth)}
                active={selectedUri === v.uri}
                onPress={() => {
                  onSelect(v);
                  onClose();
                }}
              />
            ))}
            {!variants.length && (
              <Text size="sm" className="py-2 text-muted-foreground">
                Only one quality is available for this stream.
              </Text>
            )}
          </VStack>
        </ScrollView>
      </Box>
    </Box>
  );
};

const QualityRow = ({
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
