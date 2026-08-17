import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Lock, Users } from 'lucide-react-native';
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
import { WatchPartyIntroModal } from '@/src/components/party/WatchPartyIntroModal';
import { useWatchParty } from '@/src/hooks/useWatchParty';
import { WATCH_PARTY_CONFIG } from '@/src/config/env';
import { PARTY_DISPLAY_NAME_MAX } from '@/src/party/displayName';
import { mediaItemFromPartyContent } from '@/src/party/content';
import { fetchPublicRooms } from '@/src/party/WatchPartyClient';
import type { PublicRoomSummary } from '@/src/party/protocol';
import { TMDBService } from '@/src/services/TMDBService';
import { getTitle } from '@/src/types';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';
import type { RootStackParamList, RootStackScreenProps } from '@/src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const partyPosterUrl = (posterPath: string | null): string | null => {
  if (!posterPath) return null;
  if (/^https?:\/\//i.test(posterPath)) return posterPath;
  return TMDBService.getImageUrl(posterPath, 'w185') || null;
};

export const JoinPartyScreen = ({
  route,
}: RootStackScreenProps<'JoinParty'>) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const { enabled, joinRoom, leaveRoom, displayName, setDisplayName } =
    useWatchParty();
  const [nameDraft, setNameDraft] = useState(displayName);
  const [code, setCode] = useState(route.params?.code ?? '');
  const passwordRef = useRef<{ focus: () => void } | null>(null);

  useEffect(() => {
    setNameDraft(displayName);
  }, [displayName]);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [introDone, setIntroDone] = useState(false);
  const [rooms, setRooms] = useState<PublicRoomSummary[]>([]);

  useEffect(() => {
    if (!introDone || !isFocused || !WATCH_PARTY_CONFIG.url) return;
    let cancelled = false;
    const load = () => {
      void fetchPublicRooms(WATCH_PARTY_CONFIG.url).then((next) => {
        if (!cancelled) setRooms(next);
      });
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [introDone, isFocused]);

  const selected = useMemo(
    () => rooms.find((r) => r.code === code.trim().toUpperCase()),
    [rooms, code],
  );

  const pickRoom = useCallback((room: PublicRoomSummary) => {
    setCode(room.code);
    if (room.locked) {
      setTimeout(() => passwordRef.current?.focus(), 0);
    }
  }, []);

  const goToPlayer = useCallback(
    async (rawCode: string, roomPassword?: string) => {
      if (!enabled) {
        setError('Watch party is not configured on this build.');
        return;
      }
      const trimmed = rawCode.trim().toUpperCase();
      if (trimmed.length < 4) {
        setError('Enter a room code.');
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await setDisplayName(nameDraft);
        const room = await joinRoom(
          trimmed,
          'player',
          roomPassword?.trim() || undefined,
        );
        const item = await mediaItemFromPartyContent(room.content);
        const season = room.content.season;
        const episode = room.content.episode;
        navigation.replace('Player', {
          item,
          title:
            season != null && episode != null
              ? `${getTitle(item)} — S${season} E${episode}`
              : getTitle(item),
          season,
          episode,
          resumeFrom:
            room.clock.positionSeconds > 1
              ? room.clock.positionSeconds
              : undefined,
          subtitle:
            season != null && episode != null
              ? `S${season} E${episode}`
              : undefined,
        });
      } catch (e) {
        leaveRoom();
        setError(e instanceof Error ? e.message : 'Could not join room');
      } finally {
        setBusy(false);
      }
    },
    [enabled, joinRoom, leaveRoom, nameDraft, navigation, setDisplayName],
  );

  useEffect(() => {
    if (!introDone) return;
    const initial = route.params?.code;
    if (initial) void goToPlayer(initial);
    // Only auto-join from the incoming deep-link param after the intro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introDone, route.params?.code]);

  return (
    <Box className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <HStack space="md" className="items-center px-4 py-3">
        <Focusable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          className="rounded-full"
          focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
        >
          <Icon as={ArrowLeft} size="xl" className="text-foreground" />
        </Focusable>
        <Heading size="xl" bold className="text-foreground">
          Join watch party
        </Heading>
      </HStack>

      {introDone ? (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          <VStack space="lg" className="px-4 pt-4">
            <HStack space="sm" className="items-center">
              <Icon as={Users} className="text-primary" />
              <Text className="flex-1 text-muted-foreground">
                Pick a live party or enter the code from the host. You will play
                the same title on this device, in sync.
              </Text>
            </HStack>

            <VStack space="sm">
              <Text size="sm" bold className="text-muted-foreground">
                Live parties
              </Text>
              {rooms.length === 0 ? (
                <Box className="rounded-xl border border-border bg-card px-4 py-6">
                  <Text size="sm" className="text-muted-foreground">
                    No live parties — ask the host for a code.
                  </Text>
                </Box>
              ) : (
                <VStack space="sm">
                  {rooms.map((room) => {
                    const poster = partyPosterUrl(room.posterPath);
                    const ep =
                      room.mediaType === 'tv' && room.season != null
                        ? `S${room.season} E${room.episode}`
                        : null;
                    const active = room.code === code.trim().toUpperCase();
                    return (
                      <Focusable
                        key={room.code}
                        onPress={() => pickRoom(room)}
                        className={`rounded-xl border bg-card p-2 ${
                          active ? 'border-primary bg-primary/10' : 'border-border'
                        }`}
                        focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
                      >
                        <HStack space="md" className="items-center">
                          <Box className="h-16 w-11 overflow-hidden rounded-md bg-muted">
                            {poster ? (
                              <Image
                                source={{ uri: poster }}
                                alt={room.title}
                                resizeMode="cover"
                                className="h-full w-full"
                              />
                            ) : (
                              <Box className="h-full w-full items-center justify-center">
                                <Text size="xs" className="text-muted-foreground">
                                  {room.code.slice(0, 2)}
                                </Text>
                              </Box>
                            )}
                          </Box>
                          <VStack className="min-w-0 flex-1">
                            <Text bold numberOfLines={1} className="text-foreground">
                              {room.title}
                            </Text>
                            <HStack space="sm" className="flex-wrap items-center">
                              <Text size="xs" className="text-muted-foreground">
                                {room.code}
                              </Text>
                              {ep ? (
                                <Text size="xs" className="text-muted-foreground">
                                  {ep}
                                </Text>
                              ) : null}
                              <Text size="xs" className="text-muted-foreground">
                                {room.paused ? 'Paused' : 'Playing'}
                              </Text>
                            </HStack>
                          </VStack>
                          <HStack space="xs" className="shrink-0 items-center">
                            {room.locked ? (
                              <Icon
                                as={Lock}
                                size="xs"
                                className="text-muted-foreground"
                              />
                            ) : null}
                            <Icon
                              as={Users}
                              size="xs"
                              className="text-muted-foreground"
                            />
                            <Text size="xs" className="text-muted-foreground">
                              {room.memberCount}
                            </Text>
                          </HStack>
                        </HStack>
                      </Focusable>
                    );
                  })}
                </VStack>
              )}
            </VStack>

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

            <Input>
              <InputField
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                placeholder="AB12C"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
                editable={!busy}
              />
            </Input>

            <Input>
              <InputField
                ref={passwordRef as never}
                value={password}
                onChangeText={setPassword}
                placeholder={
                  selected?.locked ? 'Required' : 'Password (if the host set one)'
                }
                secureTextEntry
                autoCorrect={false}
                maxLength={64}
                editable={!busy}
                onSubmitEditing={() => void goToPlayer(code, password)}
              />
            </Input>

            {!!error && (
              <Text size="sm" className="text-destructive">
                {error}
              </Text>
            )}

            <Button
              onPress={() => void goToPlayer(code, password)}
              isDisabled={busy || !enabled}
            >
              {busy ? <ButtonSpinner /> : null}
              <ButtonText>{busy ? 'Joining…' : 'Join'}</ButtonText>
            </Button>

            {busy && (
              <Box className="items-center pt-4">
                <Spinner size="large" color="#E50914" />
              </Box>
            )}
          </VStack>
        </ScrollView>
      ) : null}

      <WatchPartyIntroModal
        visible={!introDone}
        onContinue={() => setIntroDone(true)}
        onDismiss={() => navigation.goBack()}
      />
    </Box>
  );
};
