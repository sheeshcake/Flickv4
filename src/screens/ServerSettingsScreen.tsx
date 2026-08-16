import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
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
import { ScrollView } from '@/components/ui/scroll-view';
import { SafeAreaView } from '@/components/ui/safe-area-view';
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from '@/components/ui/toast';
import { ConfirmDialog } from '@/src/components/ConfirmDialog';
import { Focusable } from '@/src/components/Focusable';
import { ServerFormModal } from '@/src/components/ServerFormModal';
import {
  WebViewScraper,
  type ExtractedStream,
} from '@/src/components/player/WebViewScraper';
import {
  DEFAULT_SCRAPER_TIMEOUT_SECONDS,
  useServers,
  type PlaybackServer,
} from '@/src/hooks/useServers';
import {
  StreamflixService,
  isStreamflixServer,
} from '@/src/services/StreamflixService';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

// A well-known, always-available TMDB movie used purely as a probe when
// testing a server — "Test" only needs to confirm the server's pattern +
// scraper pipeline resolves *a* stream, not any particular title. The title
// is included (not just the id) so patterns using a `{slug}` placeholder
// resolve to something real (e.g. "inception") instead of an empty string,
// and the IMDb id covers patterns using `{imdbId}`.
const TEST_TMDB_ID = 27205;
const TEST_IMDB_ID = 'tt1375666';
const TEST_TITLE = 'Inception';

const formatScraperTimeout = (seconds: number): string =>
  seconds <= 0 ? 'No timeout' : `${seconds}s timeout`;

export const ServerSettingsScreen = () => {
  const navigation = useNavigation();
  const { servers, activeId, addServer, updateServer, removeServer, setActive } =
    useServers();
  const toast = useToast();

  // Add/edit now happens in its own modal (`ServerFormModal`) — `null`
  // server means "add", otherwise it prefills and edits that server.
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<PlaybackServer | null>(
    null,
  );

  // Confirmation gate before a custom server is actually removed.
  const [pendingDeleteServer, setPendingDeleteServer] =
    useState<PlaybackServer | null>(null);

  // Only one test can run at a time — it drives a single hidden
  // WebViewScraper for testing an already-saved server row. (Testing an
  // in-progress draft happens inside `ServerFormModal` instead.)
  const [testTarget, setTestTarget] = useState<PlaybackServer | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const openAddModal = () => {
    setEditingServer(null);
    setFormModalOpen(true);
  };

  const openEditModal = (server: PlaybackServer) => {
    setEditingServer(server);
    setFormModalOpen(true);
  };

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

  const runTest = useCallback(
    (id: string, server: PlaybackServer) => {
      if (testingId) return;
      setTestingId(id);
      setTestTarget(server);
      if (isStreamflixServer(server)) {
        void StreamflixService.resolve({
          tmdbId: TEST_TMDB_ID,
          mediaType: 'movie',
        })
          .then((resolved) => {
            finishTest();
            toast.show({
              placement: 'top',
              duration: resolved ? 3500 : 4500,
              render: ({ id: toastId }) => (
                <Toast
                  nativeID={toastId}
                  action={resolved ? 'success' : 'error'}
                  variant="solid"
                >
                  <ToastTitle>
                    {resolved
                      ? `${server.name} works`
                      : `${server.name} test failed`}
                  </ToastTitle>
                  <ToastDescription>
                    {resolved
                      ? 'Resolved a test stream successfully.'
                      : 'Streamflix: no stream found'}
                  </ToastDescription>
                </Toast>
              ),
            });
          })
          .catch((e) => {
            finishTest();
            toast.show({
              placement: 'top',
              duration: 4500,
              render: ({ id: toastId }) => (
                <Toast nativeID={toastId} action="error" variant="solid">
                  <ToastTitle>{`${server.name} test failed`}</ToastTitle>
                  <ToastDescription>
                    {e instanceof Error ? e.message : 'Streamflix test failed'}
                  </ToastDescription>
                </Toast>
              ),
            });
          });
        return;
      }
    },
    [testingId, finishTest, toast],
  );

  return (
    // SafeAreaView reserves the device's safe insets (notch, home indicator)
    // so the header/content never sit under them.
    <SafeAreaView style={styles.flex1}>
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
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <Text size="sm" className="mb-4 text-muted-foreground">
            Streams are resolved from the selected server using
            {'  '}
            <Text size="sm" className="text-foreground">
              {'{url}/{type}/{tmdbId}'}
            </Text>
            {'  '}
            for movies and
            {'  '}
            <Text size="sm" className="text-foreground">
              {'{url}/{type}/{tmdbId}/{season}/{episode}'}
            </Text>
            {'  '}
            for TV shows by default. Custom servers below can override
            either pattern, and what &quot;movie&quot;/&quot;tv&quot; are
            called in the URL.
          </Text>

          <VStack space="sm" className="mb-4">
            {servers.map((server) => (
              <ServerRow
                key={server.id}
                server={server}
                active={server.id === activeId}
                testing={testingId === server.id}
                onSelect={() => setActive(server.id)}
                onTest={() => runTest(server.id, server)}
                onCancelTest={finishTest}
                onEdit={
                  server.builtIn ? undefined : () => openEditModal(server)
                }
                onRemove={
                  server.builtIn
                    ? undefined
                    : () => setPendingDeleteServer(server)
                }
              />
            ))}
          </VStack>

          <Button variant="outline" onPress={openAddModal}>
            <ButtonIcon as={Plus} className="text-foreground" />
            <ButtonText className="text-foreground">
              Add custom server
            </ButtonText>
          </Button>
        </ScrollView>
      </Box>

      {/* Small floating preview of the scraper WebView while testing an
          already-saved server row — visible (and interactive, in case a
          challenge needs solving) instead of fully offscreen, so there's
          clear feedback that something is actually happening. Torn down as
          soon as the test resolves or errors. Only ever probes the movie
          path (see TEST_TMDB_ID above); that's enough to confirm the base
          URL, custom pattern, and scraper pipeline all work end-to-end.
          (Testing an in-progress add/edit draft has its own copy of this in
          `ServerFormModal`.) */}
      {testTarget &&
        !isStreamflixServer(testTarget) && (
        <Box className="absolute bottom-6 right-4 h-56 w-40 overflow-hidden rounded-lg border-2 border-primary bg-black">
          <WebViewScraper
            server={testTarget}
            tmdbId={TEST_TMDB_ID}
            imdbId={TEST_IMDB_ID}
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

      <ServerFormModal
        visible={formModalOpen}
        server={editingServer}
        onSubmit={(name, url, options) =>
          editingServer
            ? updateServer(editingServer.id, name, url, options)
            : addServer(name, url, options)
        }
        onClose={() => setFormModalOpen(false)}
      />

      <ConfirmDialog
        visible={pendingDeleteServer != null}
        title="Delete server?"
        message={
          pendingDeleteServer
            ? `Remove "${pendingDeleteServer.name}"? This can't be undone.`
            : ''
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (pendingDeleteServer) removeServer(pendingDeleteServer.id);
          setPendingDeleteServer(null);
        }}
        onCancel={() => setPendingDeleteServer(null)}
      />
    </SafeAreaView>
  );
};

const ServerRow = ({
  server,
  active,
  testing,
  onSelect,
  onTest,
  onCancelTest,
  onEdit,
  onRemove,
}: {
  server: PlaybackServer;
  active: boolean;
  testing: boolean;
  onSelect: () => void;
  onTest: () => void;
  onCancelTest: () => void;
  onEdit?: () => void;
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
        <Text size="2xs" className="text-muted-foreground">
          {formatScraperTimeout(
            server.scraperTimeoutSeconds ?? DEFAULT_SCRAPER_TIMEOUT_SECONDS,
          )}
        </Text>
      </VStack>
    </Focusable>
    {active ? <Icon as={Check} className="text-primary" /> : null}
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
  </HStack>
);

const styles = StyleSheet.create({
  flex1: { flex: 1 },
});
