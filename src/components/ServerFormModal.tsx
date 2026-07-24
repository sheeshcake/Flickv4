import { useCallback, useEffect, useState } from 'react';
import { Modal, Platform, StyleSheet } from 'react-native';
import { Check, FlaskConical, Plus, X } from 'lucide-react-native';
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
import {
  DEFAULT_SCRAPER_TIMEOUT_SECONDS,
  normalizeUrl,
  type AddServerOptions,
  type PlaybackServer,
} from '@/src/hooks/useServers';
import { previewEmbedUrl } from '@/src/utils/streamUrl';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

// A well-known, always-available TMDB movie used purely as a probe when
// testing a server — "Test" only needs to confirm the server's pattern +
// scraper pipeline resolves *a* stream, not any particular title. The title
// is included (not just the id) so patterns using a `{slug}` placeholder
// resolve to something real (e.g. "inception") instead of an empty string.
const TEST_TMDB_ID = 27205;
const TEST_TITLE = 'Inception';

// `0` = no timeout (wait indefinitely — e.g. to manually solve a captcha via
// the Debug video player in Settings). Independent of that toggle; see
// `WebViewScraper.tsx` / `useServers.tsx`.
const SCRAPER_TIMEOUT_OPTIONS: { value: number; label: string }[] = [
  { value: 30, label: '30s' },
  { value: 60, label: '60s' },
  { value: 90, label: '90s' },
  { value: 120, label: '120s' },
  { value: 180, label: '180s' },
  { value: 0, label: 'No timeout' },
];

interface ServerFormModalProps {
  visible: boolean;
  /** `null` = "Add custom server" mode with a blank form; otherwise prefills
   * and edits this server. */
  server: PlaybackServer | null;
  onSubmit: (name: string, url: string, options: AddServerOptions) => void;
  onClose: () => void;
}

/**
 * Full-screen modal for adding/editing a custom playback server. Self
 * contained — owns its own field state (seeded from `server` on open) and
 * its own draft-test flow (WebViewScraper + floating preview + toasts),
 * since testing a not-yet-saved draft only ever happens while this modal is
 * open. See the `flick-player-controls` skill for the sheet/dialog
 * conventions this borrows (hand-rolled RN `Modal`, no Gluestack
 * Modal/Actionsheet exists in this codebase).
 */
export const ServerFormModal = ({
  visible,
  server,
  onSubmit,
  onClose,
}: ServerFormModalProps) => {
  const toast = useToast();
  const isEditing = server != null;

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [urlPattern, setUrlPattern] = useState('');
  const [movieTypeLabel, setMovieTypeLabel] = useState('');
  const [tvTypeLabel, setTvTypeLabel] = useState('');
  const [scraperTimeoutSeconds, setScraperTimeoutSeconds] = useState(
    DEFAULT_SCRAPER_TIMEOUT_SECONDS,
  );
  const [draftPreviewType, setDraftPreviewType] = useState<'movie' | 'tv'>(
    'movie',
  );

  // Seed the form fresh every time the modal opens — either blank (add) or
  // from the server being edited.
  useEffect(() => {
    if (!visible) return;
    setName(server?.name ?? '');
    setUrl(server?.url ?? '');
    setUrlPattern(server?.urlPattern ?? '');
    setMovieTypeLabel(server?.movieTypeLabel ?? '');
    setTvTypeLabel(server?.tvTypeLabel ?? '');
    setScraperTimeoutSeconds(
      server?.scraperTimeoutSeconds ?? DEFAULT_SCRAPER_TIMEOUT_SECONDS,
    );
    setDraftPreviewType('movie');
  }, [visible, server]);

  const canSubmit = name.trim().length > 0 && url.trim().length > 0;

  // Draft testing — a single hidden/floating WebViewScraper probing the
  // in-progress (unsaved) form values.
  const [testing, setTesting] = useState(false);
  const [testTarget, setTestTarget] = useState<PlaybackServer | null>(null);
  const canTest = url.trim().length > 0 && !testing;

  const finishTest = useCallback(() => {
    setTesting(false);
    setTestTarget(null);
  }, []);

  const runTest = useCallback(() => {
    if (testing) return;
    setTesting(true);
    setTestTarget({
      id: '__draft__',
      name: name.trim() || 'New server',
      url: normalizeUrl(url),
      urlPattern: urlPattern || undefined,
      movieTypeLabel: movieTypeLabel || undefined,
      tvTypeLabel: tvTypeLabel || undefined,
      scraperTimeoutSeconds,
    });
  }, [
    testing,
    name,
    url,
    urlPattern,
    movieTypeLabel,
    tvTypeLabel,
    scraperTimeoutSeconds,
  ]);

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

  const draftPreview = previewEmbedUrl(
    {
      url,
      urlPattern: urlPattern || undefined,
      movieTypeLabel: movieTypeLabel || undefined,
      tvTypeLabel: tvTypeLabel || undefined,
    },
    draftPreviewType,
  );

  const handleClose = () => {
    finishTest();
    onClose();
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(name, url, {
      urlPattern,
      movieTypeLabel,
      tvTypeLabel,
      scraperTimeoutSeconds,
    });
    finishTest();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.flex1}>
        <KeyboardAvoidingView
          style={styles.flex1}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Box className="flex-1 bg-background">
            <HStack className="items-center justify-between px-4 py-3">
              <Heading size="xl" bold className="text-foreground">
                {isEditing ? 'Edit server' : 'Add custom server'}
              </Heading>
              <Focusable
                onPress={handleClose}
                hitSlop={12}
                className="rounded-full p-1"
                focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
              >
                <Icon as={X} size="lg" className="text-foreground" />
              </Focusable>
            </HStack>

            <ScrollView
              className="flex-1 px-4"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              <Text size="sm" className="mb-4 text-muted-foreground">
                Streams are resolved from this server using the pattern
                {'  '}
                <Text size="sm" className="text-foreground">
                  {'{url}/{type}/{tmdbId}'}
                </Text>
                {'  '}
                by default. You can override the pattern, and what
                &quot;movie&quot;/&quot;tv&quot; are called in the URL, below.
              </Text>

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
                  in the URL — set what they should be here. Leave blank to
                  keep the defaults.
                </Text>

                <VStack space="xs">
                  <Text size="xs" className="text-muted-foreground">
                    Scraper timeout
                  </Text>
                  <Box className="flex-row flex-wrap" style={{ gap: 8 }}>
                    {SCRAPER_TIMEOUT_OPTIONS.map((opt) => {
                      const active = scraperTimeoutSeconds === opt.value;
                      return (
                        <Button
                          key={opt.value}
                          size="sm"
                          variant={active ? 'default' : 'outline'}
                          onPress={() => setScraperTimeoutSeconds(opt.value)}
                        >
                          <ButtonText
                            className={
                              active
                                ? 'text-primary-foreground'
                                : 'text-foreground'
                            }
                          >
                            {opt.label}
                          </ButtonText>
                        </Button>
                      );
                    })}
                  </Box>
                  <Text size="xs" className="text-muted-foreground">
                    How long to wait for a stream after the page loads before
                    giving up. Independent of Settings &gt; Debug video
                    player — pick &quot;No timeout&quot; on a server with a
                    frequent captcha challenge so you have time to solve it by
                    hand (turn on Debug video player to actually see/interact
                    with it).
                  </Text>
                </VStack>

                <HStack space="sm" className="items-center">
                  <Text size="xs" className="text-muted-foreground">
                    Preview as:
                  </Text>
                  <Focusable
                    onPress={() =>
                      setDraftPreviewType((t) =>
                        t === 'movie' ? 'tv' : 'movie',
                      )
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
                    onPress={handleSubmit}
                    isDisabled={!canSubmit}
                  >
                    <ButtonIcon
                      as={isEditing ? Check : Plus}
                      className="text-primary-foreground"
                    />
                    <ButtonText className="text-primary-foreground">
                      {isEditing ? 'Save changes' : 'Add server'}
                    </ButtonText>
                  </Button>
                  <Button
                    variant="outline"
                    onPress={testing ? finishTest : runTest}
                    isDisabled={testing ? false : !canTest}
                  >
                    {testing ? (
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
                        <ButtonText className="text-foreground">
                          Test
                        </ButtonText>
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
            solving) instead of fully offscreen, so there's clear feedback
            that something is actually happening. Torn down as soon as the
            test resolves or errors. Only ever probes the movie path (see
            TEST_TMDB_ID above); that's enough to confirm the base URL,
            custom pattern, and scraper pipeline all work end-to-end. */}
        {testTarget && (
          <Box className="absolute bottom-6 right-4 h-56 w-40 overflow-hidden rounded-lg border-2 border-primary bg-black">
            <WebViewScraper
              server={testTarget}
              tmdbId={TEST_TMDB_ID}
              type="movie"
              title={TEST_TITLE}
              onDataExtracted={onTestSuccess}
              onError={onTestError}
              timeoutSeconds={testTarget.scraperTimeoutSeconds}
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
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex1: { flex: 1 },
});
