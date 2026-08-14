import { useEffect, useState } from 'react';
import { Modal, Share, StyleSheet } from 'react-native';
import { Users, X } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { Image } from '@/components/ui/image';
import { Spinner } from '@/components/ui/spinner';
import { Button, ButtonText } from '@/components/ui/button';
import { Focusable } from '@/src/components/Focusable';
import { useWatchParty } from '@/src/hooks/useWatchParty';
import type { PartyContent } from '@/src/party/protocol';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

interface PartyLobbyModalProps {
  visible: boolean;
  content: PartyContent | null;
  onPlayTogether: () => void;
  onClose: () => void;
}

const qrUri = (url: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}&bgcolor=ffffff&color=000000&margin=8`;

export const PartyLobbyModal = ({
  visible,
  content,
  onPlayTogether,
  onClose,
}: PartyLobbyModalProps) => {
  const { createRoom, leaveRoom, room, companionUrl, error, enabled } =
    useWatchParty();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !content || !enabled) return;
    if (room) return;
    let cancelled = false;
    setBusy(true);
    setLocalError(null);
    createRoom(content)
      .catch((e) => {
        if (!cancelled) {
          setLocalError(e instanceof Error ? e.message : 'Could not create room');
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, content, enabled, room, createRoom]);

  const onShare = async () => {
    if (!room) return;
    const link = companionUrl ?? `flick://party/${room.code}`;
    try {
      await Share.share({
        message: `Join my Flick watch party ${room.code}\n${link}`,
      });
    } catch {
      // ignored
    }
  };

  const handleClose = () => {
    leaveRoom();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Box className="flex-1 bg-background/80" style={StyleSheet.absoluteFill}>
        <Box className="flex-1 items-center justify-center px-6">
          <Box className="w-full max-w-md rounded-2xl bg-card p-5">
            <HStack className="mb-3 items-center justify-between">
              <HStack space="sm" className="items-center">
                <Icon as={Users} className="text-primary" />
                <Heading size="md" bold className="text-foreground">
                  Watch party
                </Heading>
              </HStack>
              <Focusable
                onPress={handleClose}
                className="rounded-full p-1"
                focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
              >
                <Icon as={X} className="text-muted-foreground" />
              </Focusable>
            </HStack>

            {!enabled ? (
              <Text size="sm" className="text-muted-foreground">
                Set EXPO_PUBLIC_WATCH_PARTY_URL to your Railway room server to
                enable watch party.
              </Text>
            ) : busy && !room ? (
              <Box className="items-center py-8">
                <Spinner size="large" color="#E50914" />
                <Text className="mt-3 text-muted-foreground">
                  Creating room…
                </Text>
              </Box>
            ) : (
              <VStack space="md">
                <Text size="sm" className="text-muted-foreground">
                  Share this code. Each device plays on its own — you only
                  sync play, pause, and seek.
                </Text>
                <Text
                  size="3xl"
                  bold
                  className="text-center tracking-widest text-foreground"
                >
                  {room?.code ?? '—'}
                </Text>
                {!!companionUrl && (
                  <Box className="items-center">
                    <Image
                      source={{ uri: qrUri(companionUrl) }}
                      alt="Watch party QR code"
                      size="2xl"
                      className="rounded-lg bg-background"
                    />
                    <Text size="xs" className="mt-2 text-center text-muted-foreground">
                      Scan to open the web lobby
                    </Text>
                  </Box>
                )}
                {(localError || error) && (
                  <Text size="sm" className="text-destructive">
                    {localError || error}
                  </Text>
                )}
                <HStack space="sm" className="justify-end">
                  <Focusable
                    onPress={onShare}
                    className="rounded-md border border-border px-4 py-2"
                    focusedClassName={`bg-primary/10 ${TV_FOCUS_BORDER_CLASSNAME}`}
                  >
                    <Text className="text-foreground">Share</Text>
                  </Focusable>
                  <Button onPress={onPlayTogether} isDisabled={!room}>
                    <ButtonText>Play together</ButtonText>
                  </Button>
                </HStack>
              </VStack>
            )}
          </Box>
        </Box>
      </Box>
    </Modal>
  );
};
