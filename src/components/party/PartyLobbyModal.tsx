import { useEffect, useRef, useState } from 'react';
import { Modal, Share, StyleSheet, useWindowDimensions } from 'react-native';
import { Users, X } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { Image } from '@/components/ui/image';
import { Spinner } from '@/components/ui/spinner';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { ScrollView } from '@/components/ui/scroll-view';
import { Focusable } from '@/src/components/Focusable';
import { useWatchParty } from '@/src/hooks/useWatchParty';
import { PARTY_DISPLAY_NAME_MAX } from '@/src/party/displayName';
import type { PartyClock, PartyContent } from '@/src/party/protocol';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

interface PartyLobbyModalProps {
  visible: boolean;
  content: PartyContent | null;
  clock?: PartyClock;
  playTogetherLabel?: string;
  onPlayTogether: () => void;
  onClose: () => void;
}

const qrUri = (url: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}&bgcolor=ffffff&color=000000&margin=8`;

export const PartyLobbyModal = ({
  visible,
  content,
  clock,
  playTogetherLabel = 'Play together',
  onPlayTogether,
  onClose,
}: PartyLobbyModalProps) => {
  const {
    createRoom,
    leaveRoom,
    room,
    companionUrl,
    error,
    enabled,
    displayName,
    setDisplayName,
  } = useWatchParty();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [password, setPassword] = useState('');
  const [usedPassword, setUsedPassword] = useState(false);
  const clockRef = useRef(clock);
  clockRef.current = clock;

  useEffect(() => {
    if (visible) setNameDraft(displayName);
  }, [visible, displayName]);

  useEffect(() => {
    if (visible) return;
    setPassword('');
    setUsedPassword(false);
    setLocalError(null);
    setBusy(false);
  }, [visible]);

  const onCreate = async () => {
    if (!content || !enabled || busy) return;
    setBusy(true);
    setLocalError(null);
    const nextPassword = password.trim();
    try {
      await setDisplayName(nameDraft);
      await createRoom(
        content,
        clockRef.current,
        nextPassword || undefined,
      );
      setUsedPassword(Boolean(nextPassword));
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Could not create room');
    } finally {
      setBusy(false);
    }
  };

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
    if (!room) leaveRoom();
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
        <Box className="flex-1 items-center justify-center px-4 py-3">
          <Box
            className={`w-full rounded-2xl bg-card p-4 ${landscape ? 'max-w-2xl' : 'max-w-md'}`}
            style={{ maxHeight: height * 0.92 }}
          >
            <HStack className="mb-2 items-center justify-between">
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

            <ScrollView className="shrink" showsVerticalScrollIndicator={false}>
              {!enabled ? (
                <Text size="sm" className="text-muted-foreground">
                  Set EXPO_PUBLIC_WATCH_PARTY_URL to your Railway room server to
                  enable watch party.
                </Text>
              ) : !room ? (
                <VStack space="md">
                  <Text size="sm" className="text-muted-foreground">
                    {content?.title
                      ? `Create a room for ${content.title}. Friends can join from Flick or the web.`
                      : 'Create a room. Friends can join from Flick or the web.'}
                  </Text>
                  <VStack space="xs">
                    <Text size="sm" className="text-muted-foreground">
                      Your name
                    </Text>
                    <Input>
                      <InputField
                        value={nameDraft}
                        onChangeText={setNameDraft}
                        placeholder="Shown to others in the room"
                        autoCorrect={false}
                        maxLength={PARTY_DISPLAY_NAME_MAX}
                        editable={!busy}
                      />
                    </Input>
                  </VStack>
                  <VStack space="xs">
                    <Text size="sm" className="text-muted-foreground">
                      Password (optional)
                    </Text>
                    <Input>
                      <InputField
                        value={password}
                        onChangeText={setPassword}
                        placeholder="Leave blank for an open room"
                        secureTextEntry
                        autoCorrect={false}
                        maxLength={64}
                        editable={!busy}
                        onSubmitEditing={() => void onCreate()}
                      />
                    </Input>
                  </VStack>
                  {(localError || error) && (
                    <Text size="sm" className="text-destructive">
                      {localError || error}
                    </Text>
                  )}
                  <HStack className="justify-end">
                    <Button
                      onPress={() => void onCreate()}
                      isDisabled={busy || !content}
                    >
                      {busy ? <ButtonSpinner /> : null}
                      <ButtonText>
                        {busy ? 'Creating…' : 'Create room'}
                      </ButtonText>
                    </Button>
                  </HStack>
                  {busy ? (
                    <Box className="items-center py-2">
                      <Spinner size="large" color="#E50914" />
                    </Box>
                  ) : null}
                </VStack>
              ) : landscape ? (
                <HStack space="lg" className="items-center">
                  <VStack space="sm" className="min-w-0 flex-1">
                    <Text size="sm" className="text-muted-foreground">
                      Share this code. Each device plays on its own — you only
                      sync play, pause, and seek.
                      {usedPassword
                        ? ' Guests need the password you set.'
                        : ''}
                    </Text>
                    <Text
                      size="3xl"
                      bold
                      className="tracking-widest text-foreground"
                    >
                      {room?.code ?? '—'}
                    </Text>
                    {(localError || error) && (
                      <Text size="sm" className="text-destructive">
                        {localError || error}
                      </Text>
                    )}
                    <HStack space="sm" className="flex-wrap">
                      <Focusable
                        onPress={onShare}
                        className="rounded-md border border-border px-4 py-2"
                        focusedClassName={`bg-primary/10 ${TV_FOCUS_BORDER_CLASSNAME}`}
                      >
                        <Text className="text-foreground">Share</Text>
                      </Focusable>
                      <Button onPress={onPlayTogether} isDisabled={!room}>
                        <ButtonText>{playTogetherLabel}</ButtonText>
                      </Button>
                    </HStack>
                  </VStack>
                  {!!companionUrl && (
                    <Box className="items-center">
                      <Image
                        source={{ uri: qrUri(companionUrl) }}
                        alt="Watch party QR code"
                        size="xl"
                        className="rounded-lg bg-background"
                      />
                      <Text size="xs" className="mt-1 text-center text-muted-foreground">
                        Scan for web
                      </Text>
                    </Box>
                  )}
                </HStack>
              ) : (
                <VStack space="md">
                  <Text size="sm" className="text-muted-foreground">
                    Share this code. Each device plays on its own — you only
                    sync play, pause, and seek.
                    {usedPassword
                      ? ' Guests need the password you set.'
                      : ''}
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
                      <ButtonText>{playTogetherLabel}</ButtonText>
                    </Button>
                  </HStack>
                </VStack>
              )}
            </ScrollView>
          </Box>
        </Box>
      </Box>
    </Modal>
  );
};
