import { useCallback, useEffect, useState } from 'react';
import { Modal, ScrollView } from 'react-native';
import { X } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import { Pressable } from '@/components/ui/pressable';
import { Focusable } from '@/src/components/Focusable';
import {
  updateService,
  type UpdateInfo,
} from '@/src/services/UpdateService';

interface UpdateModalProps {
  visible: boolean;
  onClose: () => void;
  /** Pre-fetched update info (from the background checker). */
  initialUpdateInfo?: UpdateInfo | null;
  /** Optional "Skip this version" callback. */
  onSkipVersion?: () => void;
}

type UpdateState = 'checking' | 'available' | 'up-to-date' | 'error';

export const UpdateModal = ({
  visible,
  onClose,
  initialUpdateInfo,
  onSkipVersion,
}: UpdateModalProps) => {
  const [state, setState] = useState<UpdateState>('checking');
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const runCheck = useCallback(async () => {
    setState('checking');
    setErrorMessage('');
    try {
      const result = await updateService.checkForUpdates();
      setInfo(result);
      setState(result.hasUpdate ? 'available' : 'up-to-date');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to check for updates',
      );
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (initialUpdateInfo) {
      setInfo(initialUpdateInfo);
      setState(initialUpdateInfo.hasUpdate ? 'available' : 'up-to-date');
    } else {
      void runCheck();
    }
  }, [visible, initialUpdateInfo, runCheck]);

  const openDownload = useCallback(async () => {
    if (!info) return;
    await updateService.openDownloadOrRelease(info);
  }, [info]);

  const openReleasePage = useCallback(async () => {
    if (!info?.releaseUrl) return;
    await updateService.openReleasePage(info.releaseUrl);
  }, [info]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Box className="flex-1 bg-background/90">
        <Box className="flex-1 items-center justify-center px-6">
          <Box className="w-full max-w-md rounded-2xl bg-card p-6">
            <HStack className="mb-4 items-center justify-between">
              <Heading size="lg" bold className="text-foreground">
                App Update
              </Heading>
              <Focusable
                onPress={onClose}
                className="rounded-full bg-background/40 p-2"
                focusedClassName="scale-[1.1] bg-primary"
              >
                <Icon as={X} size="lg" className="text-foreground" />
              </Focusable>
            </HStack>

            <ScrollView showsVerticalScrollIndicator={false}>
              {state === 'checking' && (
                <VStack space="md" className="items-center py-8">
                  <Spinner size="large" color="#E50914" />
                  <Text className="text-foreground">
                    Checking for updates…
                  </Text>
                  <Text size="xs" className="text-muted-foreground">
                    Current version: {updateService.getCurrentVersion()}
                  </Text>
                </VStack>
              )}

              {state === 'up-to-date' && (
                <VStack space="md" className="items-center py-8">
                  <Text size="3xl" className="text-primary">
                    ✓
                  </Text>
                  <Heading size="md" className="text-foreground">
                    You&apos;re up to date
                  </Heading>
                  <Text size="sm" className="text-center text-muted-foreground">
                    Version {info?.currentVersion} is the latest.
                  </Text>
                  <Focusable
                    onPress={runCheck}
                    className="mt-4 rounded-md border border-border px-4 py-3"
                    focusedClassName="scale-[1.02] border-primary bg-primary/10"
                  >
                    <Text className="text-foreground">Check again</Text>
                  </Focusable>
                </VStack>
              )}

              {state === 'available' && info && (
                <VStack space="md">
                  <VStack className="rounded-lg bg-background/40 p-4">
                    <HStack className="items-center justify-between">
                      <Text size="sm" className="text-muted-foreground">
                        Current
                      </Text>
                      <Text className="font-semibold text-foreground">
                        {info.currentVersion}
                      </Text>
                    </HStack>
                    <HStack className="mt-2 items-center justify-between">
                      <Text size="sm" className="text-muted-foreground">
                        New
                      </Text>
                      <Text className="font-semibold text-primary">
                        {info.latestVersion}
                      </Text>
                    </HStack>
                  </VStack>

                  {!!info.releaseDate && (
                    <Text size="xs" className="text-muted-foreground">
                      Released: {updateService.formatDate(info.releaseDate)}
                    </Text>
                  )}
                  {!!info.assetSize && (
                    <Text size="xs" className="text-muted-foreground">
                      Download size: {updateService.formatFileSize(info.assetSize)}
                    </Text>
                  )}

                  <VStack space="xs" className="rounded-lg bg-background/40 p-4">
                    <Text className="font-semibold text-foreground">
                      What&apos;s new
                    </Text>
                    <Text size="sm" className="text-muted-foreground">
                      {info.releaseNotes}
                    </Text>
                  </VStack>

                  <VStack space="sm" className="mt-2">
                    <Focusable
                      onPress={openDownload}
                      hasTVPreferredFocus
                      className="items-center rounded-md bg-primary px-4 py-3"
                      focusedClassName="scale-[1.02] border border-foreground"
                    >
                      <Text className="font-semibold text-primary-foreground">
                        {info.downloadUrl ? 'Download & install' : 'View on GitHub'}
                      </Text>
                    </Focusable>
                    <Focusable
                      onPress={openReleasePage}
                      className="items-center rounded-md border border-border px-4 py-3"
                      focusedClassName="scale-[1.02] border-primary bg-primary/10"
                    >
                      <Text className="text-foreground">Release page</Text>
                    </Focusable>
                    {onSkipVersion && (
                      <Pressable onPress={onSkipVersion}>
                        <Box className="items-center py-2">
                          <Text size="sm" className="text-muted-foreground">
                            Skip this version
                          </Text>
                        </Box>
                      </Pressable>
                    )}
                  </VStack>
                </VStack>
              )}

              {state === 'error' && (
                <VStack space="md" className="items-center py-8">
                  <Text size="3xl" className="text-primary">
                    !
                  </Text>
                  <Heading size="md" className="text-foreground">
                    Something went wrong
                  </Heading>
                  <Text size="sm" className="text-center text-muted-foreground">
                    {errorMessage || 'Please try again in a moment.'}
                  </Text>
                  <Focusable
                    onPress={runCheck}
                    className="mt-4 rounded-md bg-primary px-4 py-3"
                    focusedClassName="scale-[1.02] border border-foreground"
                  >
                    <Text className="font-semibold text-primary-foreground">
                      Try again
                    </Text>
                  </Focusable>
                </VStack>
              )}
            </ScrollView>
          </Box>
        </Box>
      </Box>
    </Modal>
  );
};
