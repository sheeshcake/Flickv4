import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Box } from '@/components/ui/box';
import { Image } from '@/components/ui/image';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { UpdateModal } from '@/src/components/UpdateModal';
import loadingMessages from '@/src/constants/loadingMessages.json';
import { useServers } from '@/src/hooks/useServers';
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

const MESSAGES = loadingMessages as string[];
const MESSAGE_INTERVAL = 900;
const SPLASH_DURATION = 2700;

const pickMessage = () => MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Soft-fail update check so a network blip never blocks entering Main. */
const checkUpdatesSafe = async (): Promise<UpdateInfo | null> => {
  try {
    return await updateService.checkForUpdates();
  } catch {
    return null;
  }
};

const AnimatedBox = Animated.createAnimatedComponent(Box);

export const SplashScreen = ({ navigation }: RootStackScreenProps<'Splash'>) => {
  const scale = useSharedValue(0.85);
  const opacity = useSharedValue(0);
  const [message, setMessage] = useState(pickMessage);
  const initialMessage = useMemo(() => message, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { refreshBuiltInServers } = useServers();

  const [updaterOpen, setUpdaterOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const didNavigateRef = useRef(false);

  const goMain = useCallback(() => {
    if (didNavigateRef.current) return;
    didNavigateRef.current = true;
    navigation.replace('Main');
  }, [navigation]);

  const finishBoot = useCallback(async () => {
    await saveLastUpdateCheck();
    goMain();
  }, [goMain]);

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
    opacity.value = withTiming(1, { duration: 500 });
    scale.value = withTiming(1, { duration: 700 });

    setMessage(initialMessage);
    const rotator = setInterval(() => setMessage(pickMessage()), MESSAGE_INTERVAL);

    let cancelled = false;
    void (async () => {
      const [, , info] = await Promise.all([
        delay(SPLASH_DURATION),
        refreshBuiltInServers(),
        checkUpdatesSafe(),
      ]);
      if (cancelled) return;

      if (info?.hasUpdate) {
        const skipped = await isSkippedVersion(info.latestVersion);
        if (cancelled) return;
        if (!skipped) {
          // Newer than a previously skipped tag — clear the old skip.
          await clearSkippedVersion();
          if (cancelled) return;
          setUpdateInfo(info);
          setUpdaterOpen(true);
          return;
        }
      }

      await saveLastUpdateCheck();
      if (!cancelled) goMain();
    })();

    return () => {
      cancelled = true;
      clearInterval(rotator);
    };
  }, [
    navigation,
    opacity,
    scale,
    initialMessage,
    refreshBuiltInServers,
    goMain,
  ]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Box className="flex-1 items-center justify-center bg-background px-8">
      <AnimatedBox style={animatedStyle}>
        <VStack space="xl" className="items-center">
          <Image
            source={require('@/assets/images/logo-full.png')}
            alt="Flick"
            resizeMode="contain"
            className="h-30 w-30"
          />
          <Text
            size="sm"
            className="min-h-10 text-center text-muted-foreground"
          >
            {message}
          </Text>
        </VStack>
      </AnimatedBox>

      <UpdateModal
        visible={updaterOpen}
        onClose={handleCloseUpdater}
        initialUpdateInfo={updateInfo}
        onSkipVersion={handleSkipVersion}
      />
    </Box>
  );
};
