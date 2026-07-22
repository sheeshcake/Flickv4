import { ScrollView, StyleSheet } from 'react-native';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { VStack } from '@/components/ui/vstack';
import { Pressable } from '@/components/ui/pressable';
import { Focusable } from '@/src/components/Focusable';
import type { Variant } from '@/src/utils/hlsVariants';

export interface DownloadQualityChoice {
  height: number;
  label: string;
  bandwidth?: number;
}

interface DownloadQualitySheetProps {
  visible: boolean;
  /** HLS variants, or an empty list for single-source MP4/MKV streams. */
  variants: Variant[];
  onSelect: (choice: DownloadQualityChoice) => void;
  onClose: () => void;
}

const formatBitrate = (bps: number): string => {
  if (!bps) return '';
  const mbps = bps / 1_000_000;
  if (mbps >= 1) return `${mbps.toFixed(1)} Mbps`;
  return `${Math.round(bps / 1000)} kbps`;
};

export const DownloadQualitySheet = ({
  visible,
  variants,
  onSelect,
  onClose,
}: DownloadQualitySheetProps) => {
  if (!visible) return null;

  // If no HLS variants were found, still surface a single actionable option
  // so nothing is downloaded silently.
  const rows: DownloadQualityChoice[] = variants.length
    ? variants.map((v) => ({
        height: v.height,
        label: v.label,
        bandwidth: v.bandwidth,
      }))
    : [{ height: 0, label: 'Source (best available)' }];

  return (
    <Box style={StyleSheet.absoluteFill} className="z-50">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Box className="h-full w-full bg-background/70" />
      </Pressable>
      <Box className="absolute bottom-0 left-0 right-0 max-h-[60%] rounded-t-2xl bg-card px-4 pb-8 pt-4">
        <Heading size="md" className="mb-3 text-foreground">
          Download quality
        </Heading>
        <ScrollView>
          <VStack space="xs">
            {rows.map((choice, idx) => (
              <Focusable
                key={`${choice.height}-${choice.label}`}
                hasTVPreferredFocus={idx === 0}
                onPress={() => {
                  onSelect(choice);
                  onClose();
                }}
                className="rounded-md"
                focusedClassName="scale-[1.02] border border-primary"
              >
                <Box className="rounded-md px-3 py-3">
                  <HStack className="items-center justify-between">
                    <Text className="font-semibold text-foreground">
                      {choice.label}
                    </Text>
                    {!!choice.bandwidth && (
                      <Text size="xs" className="text-muted-foreground">
                        {formatBitrate(choice.bandwidth)}
                      </Text>
                    )}
                  </HStack>
                </Box>
              </Focusable>
            ))}
          </VStack>
        </ScrollView>
      </Box>
    </Box>
  );
};
