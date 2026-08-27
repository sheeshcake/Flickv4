import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, useWindowDimensions } from 'react-native';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { UpdateModal } from '@/src/components/UpdateModal';
import {
  FlickSwoopLogo,
  TOTAL_MS,
  WORD_REVEAL_MS,
  splashLogoSize,
} from '@/src/components/splash/FlickSwoopLogo';
import loadingMessages from '@/src/constants/loadingMessages.json';
import { useServers } from '@/src/hooks/useServers';
import { useHomeData } from '@/src/hooks/useHomeData';
import { useCatalogRegion } from '@/src/hooks/useCatalogRegion';
import type { RootStackScreenProps } from '@/src/navigation/types';
import {
  updateService,
  type UpdateInfo,
} from '@/src/services/UpdateService';
import {
  clearSkippedVersion,
  isSkippedVersion,
  saveLastUpdateCheck,
  setSkippedVersion,
} from '@/src/utils/updateCheckStorage';

const MESSAGES: string[] = Array.isArray(loadingMessages)
  ? loadingMessages
  : Object.values(loadingMessages as Record<string, string>);
const MESSAGE_INTERVAL = 1000;
const LAND_MS = 200;

/** Soft-fail update check so a network blip never blocks entering Main. */
const checkUpdatesSafe = async (): Promise<UpdateInfo | null> => {
  try {
    return await updateService.checkForUpdates();
  } catch {
    return null;
  }
};

export const SplashScreen = ({ navigation }: RootStackScreenProps<'Splash'>) => {
  const { width: windowWidth } = useWindowDimensions();
  const { width: logoWidth, height: logoHeight } = splashLogoSize(windowWidth);
  const [messageIndex, setMessageIndex] = useState(() =>
    Math.floor(Math.random() * Math.max(MESSAGES.length, 1)),
  );
  const [showCopy, setShowCopy] = useState(false);
  const { refreshBuiltInServers } = useServers();
  const { prefetch } = useHomeData();
  const { loaded: regionLoaded } = useCatalogRegion();

  const [updaterOpen, setUpdaterOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const drawDoneRef = useRef(false);
  const bootDoneRef = useRef(false);
  const didStartExitRef = useRef(false);
  const didNavigateRef = useRef(false);
  const landTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootFnsRef = useRef({ refreshBuiltInServers, prefetch });
  bootFnsRef.current = { refreshBuiltInServers, prefetch };

  const goMain = useCallback(() => {
    if (didNavigateRef.current) return;
    didNavigateRef.current = true;
    navigation.replace('Main');
  }, [navigation]);

  const maybeExit = useCallback(() => {
    if (didStartExitRef.current) return;
    if (!drawDoneRef.current || !bootDoneRef.current) return;
    didStartExitRef.current = true;
    landTimerRef.current = setTimeout(goMain, LAND_MS);
  }, [goMain]);
  const maybeExitRef = useRef(maybeExit);
  maybeExitRef.current = maybeExit;

  const markDrawDone = useCallback(() => {
    drawDoneRef.current = true;
    setShowCopy(true);
    maybeExitRef.current();
  }, []);
  const markDrawDoneRef = useRef(markDrawDone);
  markDrawDoneRef.current = markDrawDone;
  const onIdentDrawEnd = useCallback(() => {
    markDrawDoneRef.current();
  }, []);

  const finishBoot = useCallback(async () => {
    await saveLastUpdateCheck();
    bootDoneRef.current = true;
    maybeExitRef.current();
  }, []);

  const handleCloseUpdater = useCallback(() => {
    setUpdaterOpen(false);
    void finishBoot();
  }, [finishBoot]);

  const handleSkipVersion = useCallback(async () => {
    if (updateInfo?.latestVersion) {
      await setSkippedVersion(updateInfo.latestVersion);
    }
    setUpdaterOpen(false);
    void finishBoot();
  }, [updateInfo, finishBoot]);

  useEffect(() => {
    const reveal = setTimeout(() => setShowCopy(true), WORD_REVEAL_MS);
    const fallback = setTimeout(() => markDrawDoneRef.current(), TOTAL_MS + 80);
    return () => {
      clearTimeout(reveal);
      clearTimeout(fallback);
    };
  }, []);

  useEffect(() => {
    if (!showCopy || MESSAGES.length < 2) return;
    const id = setInterval(() => {
      setMessageIndex((i) => (i + 1) % MESSAGES.length);
    }, MESSAGE_INTERVAL);
    return () => clearInterval(id);
  }, [showCopy]);

  useEffect(() => {
    if (!regionLoaded) return;

    let cancelled = false;
    void (async () => {
      const { refreshBuiltInServers: refreshServers, prefetch: prefetchHome } =
        bootFnsRef.current;
      const [, info] = await Promise.all([
        refreshServers(),
        checkUpdatesSafe(),
        prefetchHome(),
      ]);
      if (cancelled) return;

      if (info?.hasUpdate) {
        const skipped = await isSkippedVersion(info.latestVersion);
        if (cancelled) return;
        if (!skipped) {
          await clearSkippedVersion();
          if (cancelled) return;
          setUpdateInfo(info);
          setUpdaterOpen(true);
          return;
        }
      }

      await saveLastUpdateCheck();
      if (!cancelled) {
        bootDoneRef.current = true;
        maybeExitRef.current();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [regionLoaded]);

  useEffect(
    () => () => {
      if (landTimerRef.current) clearTimeout(landTimerRef.current);
    },
    [],
  );

  const message = MESSAGES[messageIndex] ?? MESSAGES[0] ?? '';

  return (
    <Box className="flex-1 bg-background">
      <Box
        className="absolute inset-0 items-center justify-center overflow-visible"
        pointerEvents="none"
      >
        <FlickSwoopLogo onDrawEnd={onIdentDrawEnd} />
      </Box>

      <VStack
        space="xl"
        className="flex-1 items-center justify-center"
        pointerEvents="none"
      >
        <Box style={{ width: logoWidth, height: logoHeight + 20 }} />
        <ActivityIndicator
          size="large"
          color="#E50914"
          className="mt-20"
          style={{ opacity: showCopy ? 1 : 0 }}
        />
        <Box className="min-h-10 px-8" style={{ opacity: showCopy ? 1 : 0 }}>
          <Text key={messageIndex} size="xs" className="text-center text-muted-foreground">
            {message}
          </Text>
        </Box>
      </VStack>
      <UpdateModal
        visible={updaterOpen}
        onClose={handleCloseUpdater}
        initialUpdateInfo={updateInfo}
        onSkipVersion={handleSkipVersion}
      />
    </Box>
  );
};
