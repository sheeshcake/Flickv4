import type { ReactNode } from 'react';
import { Modal, StyleSheet } from 'react-native';
import { Users, X } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { Button, ButtonText } from '@/components/ui/button';
import { Focusable } from '@/src/components/Focusable';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

interface WatchPartyIntroModalProps {
  visible: boolean;
  onContinue: () => void;
  onDismiss: () => void;
  /** `overlay` draws in-place (player). `modal` is a native Modal (detail/join). */
  presentation?: 'modal' | 'overlay';
}

const wrapPresentation = (
  presentation: 'modal' | 'overlay',
  visible: boolean,
  onRequestClose: () => void,
  children: ReactNode,
) => {
  if (presentation === 'overlay') {
    if (!visible) return null;
    return (
      <Box style={StyleSheet.absoluteFill} className="z-50">
        {children}
      </Box>
    );
  }
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
    >
      {children}
    </Modal>
  );
};

export const WatchPartyIntroModal = ({
  visible,
  onContinue,
  onDismiss,
  presentation = 'modal',
}: WatchPartyIntroModalProps) =>
  wrapPresentation(
    presentation,
    visible,
    onDismiss,
    <Box className="flex-1 bg-background/80" style={StyleSheet.absoluteFill}>
      <Box className="flex-1 items-center justify-center px-6">
        <Box className="w-full max-w-md rounded-2xl bg-card p-5">
          <HStack className="mb-3 items-center justify-between">
            <HStack space="sm" className="items-center">
              <Icon as={Users} className="text-primary" />
              <Heading size="md" bold className="text-foreground">
                Watch party
              </Heading>
              <Box className="rounded-full bg-primary/20 px-2 py-0.5">
                <Text size="xs" bold className="text-primary">
                  Beta
                </Text>
              </Box>
            </HStack>
            <Focusable
              onPress={onDismiss}
              className="rounded-full p-1"
              focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
            >
              <Icon as={X} className="text-muted-foreground" />
            </Focusable>
          </HStack>

          <VStack space="md">
            <Text size="sm" className="text-muted-foreground">
              Watch the same title together. Each device plays its own stream;
              the room only syncs play, pause, and seek. Friends can join from
              Flick or the web companion.
            </Text>
            <Text size="sm" className="text-muted-foreground">
              This feature is in beta rooms, sync, and the web player may be
              unreliable.
            </Text>
            <HStack className="justify-end">
              <Button onPress={onContinue}>
                <ButtonText>Continue</ButtonText>
              </Button>
            </HStack>
          </VStack>
        </Box>
      </Box>
    </Box>,
  );
