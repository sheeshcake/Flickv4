import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, Plus, Trash2 } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Button, ButtonText, ButtonIcon } from '@/components/ui/button';
import { Input, InputField } from '@/components/ui/input';
import { ScrollView } from '@/components/ui/scroll-view';
import { Focusable } from '@/src/components/Focusable';
import { useServers, type PlaybackServer } from '@/src/hooks/useServers';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

export const ServerSettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { servers, activeId, addServer, removeServer, setActive } = useServers();

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  const canAdd = name.trim().length > 0 && url.trim().length > 0;

  const onAdd = () => {
    if (!canAdd) return;
    addServer(name, url);
    setName('');
    setUrl('');
  };

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
          Playback server
        </Heading>
      </HStack>

      <ScrollView className="flex-1 px-4">
        <Text size="sm" className="mb-4 text-muted-foreground">
          Streams are resolved from the selected server using the pattern
          {'  '}
          <Text size="sm" className="text-foreground">
            {'{url}/{type}/{tmdbId}'}
          </Text>
          .
        </Text>

        <VStack space="sm" className="mb-8">
          {servers.map((server) => (
            <ServerRow
              key={server.id}
              server={server}
              active={server.id === activeId}
              onSelect={() => setActive(server.id)}
              onRemove={
                server.builtIn ? undefined : () => removeServer(server.id)
              }
            />
          ))}
        </VStack>

        <Heading size="md" className="mb-3 text-foreground">
          Add custom server
        </Heading>
        <VStack space="md" className="pb-10">
          <Input className="h-12 rounded-md bg-card">
            <InputField
              placeholder="Name (e.g. VidSrc)"
              value={name}
              onChangeText={setName}
              autoCorrect={false}
              autoCapitalize="words"
              className="text-foreground"
            />
          </Input>
          <Input className="h-12 rounded-md bg-card">
            <InputField
              placeholder="Base URL (e.g. https://vidsrc.to)"
              value={url}
              onChangeText={setUrl}
              autoCorrect={false}
              autoCapitalize="none"
              keyboardType="url"
              className="text-foreground"
            />
          </Input>
          <Text size="xs" className="text-muted-foreground">
            Resolves to {url.trim() ? url.trim().replace(/\/+$/, '') : '{url}'}
            /{'{type}'}/{'{tmdbId}'}
          </Text>
          <Button className="bg-primary" onPress={onAdd} isDisabled={!canAdd}>
            <ButtonIcon as={Plus} className="text-primary-foreground" />
            <ButtonText className="text-primary-foreground">
              Add server
            </ButtonText>
          </Button>
        </VStack>
      </ScrollView>
    </Box>
  );
};

const ServerRow = ({
  server,
  active,
  onSelect,
  onRemove,
}: {
  server: PlaybackServer;
  active: boolean;
  onSelect: () => void;
  onRemove?: () => void;
}) => (
  <HStack className="items-center rounded-lg bg-card px-4 py-3">
    <Focusable
      onPress={onSelect}
      className="flex-1 flex-row items-center gap-3 rounded-md"
      focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
    >
      <Box
        className={`h-5 w-5 items-center justify-center rounded-full border-2 ${
          active ? 'border-primary' : 'border-border'
        }`}
      >
        {active ? <Box className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
      </Box>
      <VStack>
        <Text className="text-foreground">{server.name}</Text>
        <Text size="xs" className="text-muted-foreground">
          {server.url}
        </Text>
      </VStack>
    </Focusable>
    {active ? <Icon as={Check} className="text-primary" /> : null}
    {onRemove ? (
      <Focusable
        onPress={onRemove}
        hitSlop={12}
        className="ml-3 rounded-full"
        focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
      >
        <Icon as={Trash2} className="text-muted-foreground" />
      </Focusable>
    ) : null}
  </HStack>
);
