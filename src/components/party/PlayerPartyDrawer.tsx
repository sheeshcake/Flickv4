import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { Input, InputField } from '@/components/ui/input';
import { Focusable } from '@/src/components/Focusable';
import type { PartyChatLine, PartyRoom } from '@/src/party/protocol';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

interface PlayerPartyDrawerProps {
  visible: boolean;
  room: PartyRoom;
  role: 'host' | 'guest';
  chat: PartyChatLine[];
  onSendChat: (text: string) => void;
  onLeave: () => void;
  onClose: () => void;
}

export const PlayerPartyDrawer = ({
  visible,
  room,
  role,
  chat,
  onSendChat,
  onLeave,
  onClose,
}: PlayerPartyDrawerProps) => {
  const [draft, setDraft] = useState('');
  if (!visible) return null;

  const waiting = room.members.filter((m) => m.buffering);

  const sendDraft = () => {
    const next = draft.trim();
    if (!next) return;
    onSendChat(next);
    setDraft('');
  };

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
          {waiting.length > 0 && (
            <Text size="sm" className="mb-3 text-primary">
              Waiting for {waiting.map((m) => m.displayName).join(', ')}
            </Text>
          )}
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
                </Text>
              </Box>
            ))}
          </VStack>

          <Heading size="sm" bold className="mt-5 mb-2 text-foreground">
            Chat
          </Heading>
          <Box className="mb-2 min-h-24 rounded-md border border-border p-2">
            {chat.length === 0 ? (
              <Text size="xs" className="text-muted-foreground">
                No messages yet.
              </Text>
            ) : (
              chat.map((line, i) => (
                <Text key={`${line.from}-${i}`} size="sm" className="mb-1 text-foreground">
                  <Text size="sm" bold className="text-foreground">
                    {line.from}
                  </Text>{' '}
                  {line.text}
                </Text>
              ))
            )}
          </Box>
          <Input>
            <InputField
              value={draft}
              onChangeText={setDraft}
              placeholder="Say something"
              maxLength={200}
              onSubmitEditing={sendDraft}
              returnKeyType="send"
            />
          </Input>
          <Focusable
            onPress={sendDraft}
            className="mt-2 items-center rounded-md bg-foreground px-4 py-2"
            focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
          >
            <Text className="font-semibold text-background">Send</Text>
          </Focusable>

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
