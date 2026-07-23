import { useCallback, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  ArrowLeft,
  Check,
  FlaskConical,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { Button, ButtonText, ButtonIcon } from '@/components/ui/button';
import { Input, InputField } from '@/components/ui/input';
import { ScrollView } from '@/components/ui/scroll-view';
import { SafeAreaView } from '@/components/ui/safe-area-view';
import { KeyboardAvoidingView } from '@/components/ui/keyboard-avoiding-view';
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from '@/components/ui/toast';
import { Focusable } from '@/src/components/Focusable';
import {
  WebViewScraper,
  type ExtractedStream,
} from '@/src/components/player/WebViewScraper';
import { normalizeUrl, useServers, type PlaybackServer } from '@/src/hooks/useServers';
import { previewEmbedUrl } from '@/src/utils/streamUrl';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

// A well-known, always-available TMDB movie used purely as a probe when
// testing a server — "Test" only needs to confirm the server's pattern +
// scraper pipeline resolves *a* stream, not any particular title. The title
// is included (not just the id) so patterns using a `{slug}` placeholder
// resolve to something real (e.g. "inception") instead of an empty string.
const TEST_TMDB_ID = 27205;
const TEST_TITLE = 'Inception';

export const ServerSettingsScreen = () => {
  const navigation = useNavigation();
  const { servers, activeId, addServer, updateServer, removeServer, setActive } =
    useServers();
  const toast = useToast();

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [urlPattern, setUrlPattern] = useState('');
  const [movieTypeLabel, setMovieTypeLabel] = useState('');
  const [tvTypeLabel, setTvTypeLabel] = useState('');

  // When set, the form below edits this existing (custom) server instead of
  // adding a new one — populated from its current values via `startEdit`.
  const [editingId, setEditingId] = useState<string | null>(null);

  // Only one test can run at a time — it drives a single hidden
  // WebViewScraper. `testingId` is the server's id, or '__draft__' for the
  // in-progress add/edit form.
  const [testTarget, setTestTarget] = useState<PlaybackServer | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && url.trim().length > 0;
  const canTestDraft = url.trim().length > 0 && !testingId;

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setUrl('');
    setUrlPattern('');
    setMovieTypeLabel('');
    setTvTypeLabel('');
  };

  const startEdit = (server: PlaybackServer) => {
    setEditingId(server.id);
    setName(server.name);
    setUrl(server.url);
    setUrlPattern(server.urlPattern ?? '');
    setMovieTypeLabel(server.movieTypeLabel ?? '');
    setTvTypeLabel(server.tvTypeLabel ?? '');
  };

  const onSubmit = () => {
    if (!canSubmit) return;
    const options = { urlPattern, movieTypeLabel, tvTypeLabel };
    if (editingId) {
      updateServer(editingId, name, url, options);
    } else {
      addServer(name, url, options);
    }
    resetForm();
  };

  const runTest = useCallback(
    (id: string, server: PlaybackServer) => {
      if (testingId) return;
      setTestingId(id);
      setTestTarget(server);
    },
    [testingId],
  );

  const finishTest = useCallback(() => {
    setTestTarget(null);
    setTestingId(null);
  }, []);

  const onTestSuccess = useCallback(
    (_data: ExtractedStream) => {
      const label = testTarget?.name ?? 'Server';
      finishTest();
      toast.show({
        placement: 'top',
        duration: 3500,
        render: ({ id }) => (
          <Toast nativeID={id} action="success" variant="solid">
            <ToastTitle>{`${label} works`}</ToastTitle>
            <ToastDescription>
              Resolved a test stream successfully.
            </ToastDescription>
          </Toast>
        ),
      });
    },
    [testTarget, finishTest, toast],
  );

  const onTestError = useCallback(
    (message: string) => {
      const label = testTarget?.name ?? 'Server';
      finishTest();
      toast.show({
        placement: 'top',
        duration: 4500,
        render: ({ id }) => (
          <Toast nativeID={id} action="error" variant="solid">
            <ToastTitle>{`${label} test failed`}</ToastTitle>
            <ToastDescription>{message}</ToastDescription>
          </Toast>
        ),
      });
    },
    [testTarget, finishTest, toast],
  );

  const [draftPreviewType, setDraftPreviewType] = useState<'movie' | 'tv'>(
    'movie',
  );

  const draftPreview = previewEmbedUrl(
    {
      url,
      urlPattern: urlPattern || undefined,
      movieTypeLabel: movieTypeLabel || undefined,
      tvTypeLabel: tvTypeLabel || undefined,
    },
    draftPreviewType,
  );

  return (
    // SafeAreaView reserves the device's safe insets (notch, home indicator)
    // so the header/content never sit under them; KeyboardAvoidingView then
    // sits fully inside it and pushes its own children up when the keyboard
    // opens, so the "Add/Edit custom server" inputs are never covered.
    //
    // NOTE: both of these are thin wrappers around third-party/RN core
    // components, not Gluestack primitives — their `flex: 1` sizing is set
    // via inline `style` (not `className`) so the layout doesn't depend on
    // NativeWind's className interop reaching these exact components.
    // Actual theming (`bg-background`) lives on the inner `Box` below, which
    // is a proven Gluestack component used everywhere else in the app.
    <SafeAreaView style={styles.flex1}>
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Box className="flex-1 bg-background">
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

        <ScrollView
          className="flex-1 px-4"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <Text size="sm" className="mb-4 text-muted-foreground">
            Streams are resolved from the selected server using the pattern
            {'  '}
            <Text size="sm" className="text-foreground">
              {'{url}/{type}/{tmdbId}'}
            </Text>
            {'  '}
            by default. Custom servers below can override the pattern, and
            what &quot;movie&quot;/&quot;tv&quot; are called in the URL.
          </Text>

          <VStack space="sm" className="mb-8">
            {servers.map((server) => (
              <ServerRow
                key={server.id}
                server={server}
                active={server.id === activeId}
                testing={testingId === server.id}
                editing={editingId === server.id}
                onSelect={() => setActive(server.id)}
                onTest={() => runTest(server.id, server)}
                onCancelTest={finishTest}
                onEdit={
                  server.builtIn ? undefined : () => startEdit(server)
                }
                onRemove={
                  server.builtIn ? undefined : () => removeServer(server.id)
                }
              />
            ))}
          </VStack>

          <HStack className="mb-3 items-center justify-between">
            <Heading size="md" className="text-foreground">
              {editingId ? 'Edit server' : 'Add custom server'}
            </Heading>
            {editingId ? (
              <Focusable
                onPress={resetForm}
                hitSlop={12}
                className="rounded-full"
                focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
              >
                <HStack space="xs" className="items-center">
                  <Icon as={X} size="sm" className="text-muted-foreground" />
                  <Text size="sm" className="text-muted-foreground">
                    Cancel
                  </Text>
                </HStack>
              </Focusable>
            ) : null}
          </HStack>
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

            <VStack space="xs">
              <Input className="h-12 rounded-md bg-card">
                <InputField
                  placeholder="URL pattern (optional, e.g. {url}/{type}?tmdb={tmdbId})"
                  value={urlPattern}
                  onChangeText={setUrlPattern}
                  autoCorrect={false}
                  autoCapitalize="none"
                  keyboardType="url"
                  className="text-foreground"
                />
              </Input>
              <Text size="xs" className="text-muted-foreground">
                Leave blank to use the default path pattern. Placeholders:
                {' '}
                {'{url}'} {'{type}'} {'{tmdbId}'} {'{slug}'} {'{season}'}{' '}
                {'{episode}'}
                {'  '}(
                {'{slug}'} is the title turned into a URL-safe slug, e.g.
                {' '}
                <Text size="xs" className="text-foreground">
                  disclosure-day
                </Text>
                )
              </Text>
            </VStack>

            <HStack space="sm">
              <VStack space="xs" className="flex-1">
                <Input className="h-12 rounded-md bg-card">
                  <InputField
                    placeholder='Movie type name (e.g. "movies")'
                    value={movieTypeLabel}
                    onChangeText={setMovieTypeLabel}
                    autoCorrect={false}
                    autoCapitalize="none"
                    className="text-foreground"
                  />
                </Input>
              </VStack>
              <VStack space="xs" className="flex-1">
                <Input className="h-12 rounded-md bg-card">
                  <InputField
                    placeholder='TV type name (e.g. "series")'
                    value={tvTypeLabel}
                    onChangeText={setTvTypeLabel}
                    autoCorrect={false}
                    autoCapitalize="none"
                    className="text-foreground"
                  />
                </Input>
              </VStack>
            </HStack>
            <Text size="xs" className="-mt-2 text-muted-foreground">
              Some servers call movies/TV shows something other than
              {' '}
              <Text size="xs" className="text-foreground">
                movie
              </Text>
              {' / '}
              <Text size="xs" className="text-foreground">
                tv
              </Text>
              {' '}
              in the URL — set what they should be here. Leave blank to keep
              the defaults.
            </Text>

            <HStack space="sm" className="items-center">
              <Text size="xs" className="text-muted-foreground">
                Preview as:
              </Text>
              <Focusable
                onPress={() =>
                  setDraftPreviewType((t) => (t === 'movie' ? 'tv' : 'movie'))
                }
                className="rounded-full bg-card px-3 py-1"
                focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
              >
                <Text size="xs" className="text-foreground">
                  {draftPreviewType === 'movie' ? 'Movie' : 'TV show'}
                </Text>
              </Focusable>
            </HStack>
            <Text size="xs" className="text-muted-foreground">
              Resolves to {draftPreview}
            </Text>

            <HStack space="sm">
              <Button
                className="flex-1 bg-primary"
                onPress={onSubmit}
                isDisabled={!canSubmit}
              >
                <ButtonIcon
                  as={editingId ? Check : Plus}
                  className="text-primary-foreground"
                />
                <ButtonText className="text-primary-foreground">
                  {editingId ? 'Save changes' : 'Add server'}
                </ButtonText>
              </Button>
              <Button
                variant="outline"
                onPress={() =>
                  testingId === '__draft__'
                    ? finishTest()
                    : runTest('__draft__', {
                        id: '__draft__',
                        name: name.trim() || 'New server',
                        url: normalizeUrl(url),
                        urlPattern: urlPattern || undefined,
                        movieTypeLabel: movieTypeLabel || undefined,
                        tvTypeLabel: tvTypeLabel || undefined,
                      })
                }
                isDisabled={
                  testingId === '__draft__' ? false : !canTestDraft
                }
              >
                {testingId === '__draft__' ? (
                  <>
                    <Spinner size="small" color="#E50914" />
                    <ButtonText className="text-foreground">
                      Cancel
                    </ButtonText>
                  </>
                ) : (
                  <>
                    <ButtonIcon
                      as={FlaskConical}
                      className="text-foreground"
                    />
                    <ButtonText className="text-foreground">Test</ButtonText>
                  </>
                )}
              </Button>
            </HStack>
          </VStack>
        </ScrollView>
        </Box>
      </KeyboardAvoidingView>

      {/* Small floating preview of the scraper WebView while a test is
          running — visible (and interactive, in case a challenge needs
          solving) instead of fully offscreen, so there's clear feedback that
          something is actually happening. Torn down as soon as the test
          resolves or errors. Only ever probes the movie path (see
          TEST_TMDB_ID above); that's enough to confirm the base URL, custom
          pattern, and scraper pipeline all work end-to-end. */}
      {testTarget && (
        <Box className="absolute bottom-6 right-4 h-56 w-40 overflow-hidden rounded-lg border-2 border-primary bg-black">
          <WebViewScraper
            server={testTarget}
            tmdbId={TEST_TMDB_ID}
            type="movie"
            title={TEST_TITLE}
            onDataExtracted={onTestSuccess}
            onError={onTestError}
            previewStyle={StyleSheet.absoluteFill}
          />
          <HStack
            space="xs"
            className="absolute inset-x-0 bottom-0 items-center justify-between bg-black/70 px-2 py-1"
          >
            <Text
              size="2xs"
              className="flex-1 text-foreground"
              numberOfLines={1}
            >
              Testing {testTarget.name}…
            </Text>
            <Focusable
              onPress={finishTest}
              hitSlop={8}
              className="rounded-full"
              focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
            >
              <Text size="2xs" bold className="text-primary">
                Cancel
              </Text>
            </Focusable>
          </HStack>
        </Box>
      )}
    </SafeAreaView>
  );
};

const ServerRow = ({
  server,
  active,
  testing,
  editing,
  onSelect,
  onTest,
  onCancelTest,
  onEdit,
  onRemove,
}: {
  server: PlaybackServer;
  active: boolean;
  testing: boolean;
  editing: boolean;
  onSelect: () => void;
  onTest: () => void;
  onCancelTest: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
}) => (
  <HStack
    className={`items-center rounded-lg bg-card px-4 py-3 ${
      editing ? 'border border-primary' : ''
    }`}
  >
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
    {editing ? (
      <Text size="xs" className="ml-3 text-primary">
        Editing…
      </Text>
    ) : (
      <>
        {testing ? (
          <Focusable
            onPress={onCancelTest}
            hitSlop={12}
            className="ml-3 flex-row items-center gap-1 rounded-full"
            focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
          >
            <Spinner size="small" color="#E50914" />
            <Icon as={X} size="xs" className="text-muted-foreground" />
          </Focusable>
        ) : (
          <Focusable
            onPress={onTest}
            hitSlop={12}
            className="ml-3 rounded-full"
            focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
          >
            <Icon as={FlaskConical} className="text-muted-foreground" />
          </Focusable>
        )}
        {onEdit ? (
          <Focusable
            onPress={onEdit}
            hitSlop={12}
            className="ml-3 rounded-full"
            focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
          >
            <Icon as={Pencil} className="text-muted-foreground" />
          </Focusable>
        ) : null}
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
      </>
    )}
  </HStack>
);

const styles = StyleSheet.create({
  flex1: { flex: 1 },
});
