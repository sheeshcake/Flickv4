import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Users } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { Focusable } from '@/src/components/Focusable';
import { useWatchParty } from '@/src/hooks/useWatchParty';
import { mediaItemFromPartyContent } from '@/src/party/content';
import { getTitle } from '@/src/types';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';
import type { RootStackParamList, RootStackScreenProps } from '@/src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export const JoinPartyScreen = ({
  route,
}: RootStackScreenProps<'JoinParty'>) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { enabled, joinRoom, leaveRoom } = useWatchParty();
  const [code, setCode] = useState(route.params?.code ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goToPlayer = useCallback(
    async (rawCode: string) => {
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
        const room = await joinRoom(trimmed);
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
    [enabled, joinRoom, leaveRoom, navigation],
  );

  useEffect(() => {
    const initial = route.params?.code;
    if (initial) void goToPlayer(initial);
    // Only auto-join from the incoming deep-link param.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.code]);

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

      <VStack space="lg" className="px-4 pt-4">
        <HStack space="sm" className="items-center">
          <Icon as={Users} className="text-primary" />
          <Text className="flex-1 text-muted-foreground">
            Enter the code from the host. You will play the same title on this
            device, in sync.
          </Text>
        </HStack>

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

        {!!error && (
          <Text size="sm" className="text-destructive">
            {error}
          </Text>
        )}

        <Button
          onPress={() => void goToPlayer(code)}
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
    </Box>
  );
};
