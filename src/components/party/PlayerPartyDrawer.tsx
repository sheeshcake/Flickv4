import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Eye, EyeOff, Video, VideoOff, Mic, MicOff, X } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { Focusable } from '@/src/components/Focusable';
import type { PartyRtcApi } from '@/src/hooks/usePartyRtc';
import type { PartyRoom } from '@/src/party/protocol';
import { isTV, TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

interface PlayerPartyDrawerProps {
  visible: boolean;
  room: PartyRoom;
  role: 'host' | 'guest';
  rtc: PartyRtcApi;
  tilesHidden: boolean;
  onToggleTilesHidden: () => void;
  onLeave: () => void;
  onClose: () => void;
}

export const PlayerPartyDrawer = ({
  visible,
  room,
  role,
  rtc,
  tilesHidden,
  onToggleTilesHidden,
  onLeave,
  onClose,
}: PlayerPartyDrawerProps) => {
  if (!visible) return null;

  const waiting = room.members.filter((m) => m.buffering);

  return (
    <Box style={StyleSheet.absoluteFill} className="z-50">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Box className="h-full w-full bg-background/70" />
      </Pressable>
      <Box className="absolute bottom-0 right-0 top-0 w-[45%] bg-card">
        <HStack className="items-center justify-between px-4 py-3">
          <Heading size="md" bold className="text-foreground">
            Party {room.code}
          </Heading>
          <Focusable
            onPress={onClose}
            className="rounded-full p-1"
            focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
          >
            <Icon as={X} className="text-foreground" />
          </Focusable>
        </HStack>
        <ScrollView className="flex-1 px-4 pb-6">
          <Text size="sm" className="mb-3 text-muted-foreground">
            {role === 'host'
              ? 'You control playback. Guests follow this device.'
              : 'Host controls playback on this device.'}
          </Text>
          {!room.members.some((m) => m.id === room.hostId || m.role === 'host') && (
            <Text size="sm" className="mb-3 text-destructive">
              Host is away
            </Text>
          )}
          {waiting.length > 0 && (
            <Text size="sm" className="mb-3 text-primary">
              Waiting for {waiting.map((m) => m.displayName).join(', ')}
            </Text>
          )}
          {rtc.available && !isTV ? (
            <VStack space="sm" className="mb-4">
              <Text size="sm" bold className="text-foreground">
                Video call
              </Text>
              <Focusable
                onPress={() => {
                  if (rtc.joined) rtc.leaveCall();
                  else void rtc.joinCall();
                }}
                className="items-center rounded-md bg-primary/20 px-4 py-3"
                focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
              >
                <HStack space="sm" className="items-center">
                  <Icon
                    as={rtc.joined ? VideoOff : Video}
                    className="text-foreground"
                  />
                  <Text className="font-semibold text-foreground">
                    {rtc.joined ? 'Leave camera' : 'Join camera'}
                  </Text>
                </HStack>
              </Focusable>
              {rtc.error ? (
                <Text size="xs" className="text-destructive">
                  {rtc.error}
                </Text>
              ) : null}
              {rtc.joined ? (
                <HStack space="sm">
                  <Focusable
                    onPress={rtc.toggleMute}
                    className="min-w-0 flex-1 items-center rounded-md bg-primary/10 px-3 py-2"
                    focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
                  >
                    <HStack space="xs" className="items-center">
                      <Icon
                        as={rtc.muted ? MicOff : Mic}
                        size="sm"
                        className="text-foreground"
                      />
                      <Text size="xs" className="text-foreground">
                        {rtc.muted ? 'Unmute' : 'Mute'}
                      </Text>
                    </HStack>
                  </Focusable>
                  <Focusable
                    onPress={rtc.toggleCam}
                    className="min-w-0 flex-1 items-center rounded-md bg-primary/10 px-3 py-2"
                    focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
                  >
                    <HStack space="xs" className="items-center">
                      <Icon
                        as={rtc.camOff ? VideoOff : Video}
                        size="sm"
                        className="text-foreground"
                      />
                      <Text size="xs" className="text-foreground">
                        {rtc.camOff ? 'Cam on' : 'Cam off'}
                      </Text>
                    </HStack>
                  </Focusable>
                  <Focusable
                    onPress={onToggleTilesHidden}
                    className="min-w-0 flex-1 items-center rounded-md bg-primary/10 px-3 py-2"
                    focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
                  >
                    <HStack space="xs" className="items-center">
                      <Icon
                        as={tilesHidden ? Eye : EyeOff}
                        size="sm"
                        className="text-foreground"
                      />
                      <Text size="xs" className="text-foreground">
                        {tilesHidden ? 'Show' : 'Hide'}
                      </Text>
                    </HStack>
                  </Focusable>
                </HStack>
              ) : null}
            </VStack>
          ) : null}
          <VStack space="xs">
            {room.members.map((m) => (
              <Box
                key={m.id}
                className="rounded-md bg-primary/10 px-3 py-2"
              >
                <Text className="font-semibold text-foreground">
                  {m.displayName}
                </Text>
                <Text size="xs" className="text-muted-foreground">
                  {m.role}
                  {m.kind === 'companion' ? ' · web' : ''}
                  {m.buffering ? ' · buffering' : ''}
                  {room.rtcMemberIds?.includes(m.id) ? ' · camera' : ''}
                </Text>
              </Box>
            ))}
          </VStack>
          <Focusable
            onPress={onLeave}
            className="mt-6 items-center rounded-md bg-primary px-4 py-3"
            focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
          >
            <Text className="font-semibold text-primary-foreground">
              Leave party
            </Text>
          </Focusable>
        </ScrollView>
      </Box>
    </Box>
  );
};
