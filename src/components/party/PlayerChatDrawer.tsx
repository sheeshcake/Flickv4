import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { Input, InputField } from '@/components/ui/input';
import { Focusable } from '@/src/components/Focusable';
import type { PartyChatLine } from '@/src/party/protocol';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

interface PlayerChatDrawerProps {
  visible: boolean;
  chat: PartyChatLine[];
  onSend: (text: string) => void;
  onClose: () => void;
}

export const PlayerChatDrawer = ({
  visible,
  chat,
  onSend,
  onClose,
}: PlayerChatDrawerProps) => {
  const [draft, setDraft] = useState('');
  if (!visible) return null;

  const sendDraft = () => {
    const next = draft.trim();
    if (!next) return;
    onSend(next);
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
            Chat
          </Heading>
          <Focusable
            onPress={onClose}
            className="rounded-full p-1"
            focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
          >
            <Icon as={X} className="text-foreground" />
          </Focusable>
        </HStack>
        <ScrollView className="flex-1 px-4">
          <Text size="sm" className="mb-3 text-muted-foreground">
            Messages stay in this room.
          </Text>
          {chat.length === 0 ? (
            <Text size="xs" className="text-muted-foreground">
              No messages yet.
            </Text>
          ) : (
            chat.map((line, i) => (
              <Text
                key={`${line.from}-${i}`}
                size="sm"
                className="mb-1 text-foreground"
              >
                <Text size="sm" bold className="text-foreground">
                  {line.from}
                </Text>{' '}
                {line.text}
              </Text>
            ))
          )}
        </ScrollView>
        <HStack space="sm" className="items-center px-4 py-3">
          <Box className="flex-1">
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
          </Box>
          <Focusable
            onPress={sendDraft}
            className="items-center rounded-md bg-foreground px-4 py-2"
            focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
          >
            <Text className="font-semibold text-background">Send</Text>
          </Focusable>
        </HStack>
      </Box>
    </Box>
  );
};
