import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Focusable } from '@/src/components/Focusable';
import type { LiveChannel } from '@/src/services/DaddyLiveService';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

interface LivePlayerChannelDrawerProps {
  visible: boolean;
  channels: LiveChannel[];
  activeChannelId: string;
  resolvingId?: string | null;
  onSelect: (channel: LiveChannel) => void;
  onClose: () => void;
}

export const LivePlayerChannelDrawer = ({
  visible,
  channels,
  activeChannelId,
  resolvingId,
  onSelect,
  onClose,
}: LivePlayerChannelDrawerProps) => {
  if (!visible) return null;

  return (
    <Box style={StyleSheet.absoluteFill} className="z-50">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Box className="h-full w-full bg-background/70" />
      </Pressable>
      <Box className="absolute bottom-0 right-0 top-0 w-[45%] bg-card">
        <HStack className="items-center justify-between px-4 py-3">
          <Heading size="md" className="text-foreground">
            Channels
          </Heading>
          <Focusable
            onPress={onClose}
            className="rounded-full p-1"
            focusedClassName={`bg-primary ${TV_FOCUS_BORDER_CLASSNAME}`}
          >
            <Icon as={X} className="text-foreground" />
          </Focusable>
        </HStack>
        <ScrollView className="flex-1 px-4 pb-6">
          {channels.map((channel) => {
            const active = channel.id === activeChannelId;
            const resolving = channel.id === resolvingId;
            return (
              <Focusable
                key={channel.id}
                onPress={() => onSelect(channel)}
                className={`mb-1 rounded-lg px-3 py-3 ${active ? 'bg-primary/20' : ''}`}
                focusedClassName={`bg-primary/20 ${TV_FOCUS_BORDER_CLASSNAME}`}
              >
                <Text
                  size="sm"
                  className={
                    active
                      ? 'font-semibold text-foreground'
                      : 'text-muted-foreground'
                  }
                  numberOfLines={1}
                >
                  {channel.name}
                  {resolving ? '…' : ''}
                </Text>
                {channel.nowPlaying ? (
                  <Text
                    size="xs"
                    className="text-muted-foreground"
                    numberOfLines={1}
                  >
                    {channel.nowPlaying}
                  </Text>
                ) : null}
              </Focusable>
            );
          })}
        </ScrollView>
      </Box>
    </Box>
  );
};
