import { useState, useEffect } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight, Layers, Server } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { VStack } from '@/components/ui/vstack';
import { Pressable } from '@/components/ui/pressable';
import { Icon } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import { Focusable } from '@/src/components/Focusable';
import type { PlaybackServer } from '@/src/hooks/useServers';
import type { Variant } from '@/src/utils/hlsVariants';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

export interface DownloadQualityChoice {
  height: number;
  label: string;
  bandwidth?: number;
}

export interface DownloadStreamflixSourceOption {
  id: string;
  name: string;
}

type PickingPane = 'server' | 'source' | null;

interface DownloadQualitySheetProps {
  visible: boolean;
  servers: PlaybackServer[];
  selectedServerId: string;
  onSelectServer: (id: string) => void;
  /** Streamflix extractors (Vidrock / Videasy / Vidzee). Empty for other servers. */
  streamflixSources?: DownloadStreamflixSourceOption[];
  selectedStreamflixSourceId?: string | null;
  onSelectStreamflixSource?: (id: string) => void;
  /** Show the Source row even before the Streamflix list arrives. */
  showStreamflixSourcePicker?: boolean;
  /** HLS variants, or an empty list for single-source MP4/MKV streams. */
  variants: Variant[];
  resolving: boolean;
  resolveError?: string | null;
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
  servers,
  selectedServerId,
  onSelectServer,
  streamflixSources = [],
  selectedStreamflixSourceId,
  onSelectStreamflixSource,
  showStreamflixSourcePicker = false,
  variants,
  resolving,
  resolveError,
  onSelect,
  onClose,
}: DownloadQualitySheetProps) => {
  const [picking, setPicking] = useState<PickingPane>(null);

  useEffect(() => {
    if (!visible) setPicking(null);
  }, [visible]);

  if (!visible) return null;

  const selectedServer =
    servers.find((s) => s.id === selectedServerId) ?? servers[0];
  const selectedStreamflixSource =
    streamflixSources.find((s) => s.id === selectedStreamflixSourceId) ??
    streamflixSources[0];
  const showStreamflixSources =
    showStreamflixSourcePicker ||
    (streamflixSources.length > 0 && !!onSelectStreamflixSource);

  const close = () => {
    setPicking(null);
    onClose();
  };

  const paneTitle =
    picking === 'server' ? 'Server' : picking === 'source' ? 'Source' : null;

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
      <Pressable style={StyleSheet.absoluteFill} onPress={close}>
        <Box className="h-full w-full bg-background/70" />
      </Pressable>
      <Box className="absolute bottom-0 left-0 right-0 max-h-[70%] rounded-t-2xl bg-card px-4 pb-8 pt-4">
        <HStack className="mb-3 items-center justify-between">
          {paneTitle ? (
            <Focusable
              onPress={() => setPicking(null)}
              className="rounded-full p-1"
              focusedClassName={`bg-primary/20 ${TV_FOCUS_BORDER_CLASSNAME}`}
            >
              <HStack className="items-center" space="xs">
                <Icon as={ChevronLeft} className="text-foreground" />
                <Heading size="md" className="text-foreground">
                  {paneTitle}
                </Heading>
              </HStack>
            </Focusable>
          ) : (
            <Heading size="md" className="text-foreground">
              Download
            </Heading>
          )}
        </HStack>
        <ScrollView>
          {picking === 'server' ? (
            <VStack space="xs">
              {servers.map((s, idx) => (
                <Focusable
                  key={s.id}
                  hasTVPreferredFocus={idx === 0}
                  onPress={() => {
                    onSelectServer(s.id);
                    setPicking(null);
                  }}
                  className={`rounded-md px-3 py-3 ${
                    s.id === selectedServerId ? 'bg-primary/20' : ''
                  }`}
                  focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
                >
                  <Text
                    className={
                      s.id === selectedServerId
                        ? 'font-semibold text-foreground'
                        : 'text-muted-foreground'
                    }
                  >
                    {s.name}
                  </Text>
                </Focusable>
              ))}
            </VStack>
          ) : picking === 'source' ? (
            <VStack space="xs">
              {streamflixSources.map((s, idx) => (
                <Focusable
                  key={s.id}
                  hasTVPreferredFocus={idx === 0}
                  onPress={() => {
                    onSelectStreamflixSource?.(s.id);
                    setPicking(null);
                  }}
                  className={`rounded-md px-3 py-3 ${
                    s.id === selectedStreamflixSourceId ? 'bg-primary/20' : ''
                  }`}
                  focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
                >
                  <Text
                    className={
                      s.id === selectedStreamflixSourceId
                        ? 'font-semibold text-foreground'
                        : 'text-muted-foreground'
                    }
                  >
                    {s.name}
                  </Text>
                </Focusable>
              ))}
            </VStack>
          ) : (
            <VStack space="md">
              {servers.length > 0 && (
                <Focusable
                  hasTVPreferredFocus
                  onPress={() => setPicking('server')}
                  className="rounded-md"
                  focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
                >
                  <HStack className="items-center justify-between rounded-md px-3 py-3">
                    <HStack className="items-center" space="sm">
                      <Icon as={Server} className="text-foreground" />
                      <VStack>
                        <Text size="xs" className="text-muted-foreground">
                          Server
                        </Text>
                        <Text className="font-semibold text-foreground">
                          {selectedServer?.name ?? 'Unknown'}
                        </Text>
                      </VStack>
                    </HStack>
                    <Icon as={ChevronRight} className="text-muted-foreground" />
                  </HStack>
                </Focusable>
              )}

              {showStreamflixSources && (
                <Focusable
                  onPress={() => {
                    if (streamflixSources.length) setPicking('source');
                  }}
                  className="rounded-md"
                  focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
                >
                  <HStack className="items-center justify-between rounded-md px-3 py-3">
                    <HStack className="items-center" space="sm">
                      <Icon as={Layers} className="text-foreground" />
                      <VStack>
                        <Text size="xs" className="text-muted-foreground">
                          Source
                        </Text>
                        <Text className="font-semibold text-foreground">
                          {selectedStreamflixSource?.name ??
                            (resolving ? 'Finding sources…' : 'Choose a source')}
                        </Text>
                      </VStack>
                    </HStack>
                    <Icon as={ChevronRight} className="text-muted-foreground" />
                  </HStack>
                </Focusable>
              )}

              <VStack space="xs">
                <Text size="xs" className="px-3 text-muted-foreground">
                  Quality
                </Text>
                {resolving ? (
                  <HStack className="items-center px-3 py-3" space="sm">
                    <Spinner color="#E50914" />
                    <Text className="text-muted-foreground">
                      Finding stream…
                    </Text>
                  </HStack>
                ) : resolveError ? (
                  <Text size="sm" className="px-3 py-3 text-destructive">
                    {resolveError}
                  </Text>
                ) : (
                  rows.map((choice, idx) => (
                    <Focusable
                      key={`${choice.height}-${choice.label}`}
                      hasTVPreferredFocus={
                        servers.length === 0 &&
                        !showStreamflixSources &&
                        idx === 0
                      }
                      onPress={() => {
                        onSelect(choice);
                        close();
                      }}
                      className="rounded-md"
                      focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
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
                  ))
                )}
              </VStack>
            </VStack>
          )}
        </ScrollView>
      </Box>
    </Box>
  );
};
