import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, useWindowDimensions } from 'react-native';
import { Image } from '@/components/ui/image';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import loadingMessages from '@/src/constants/loadingMessages.json';
import { useServers } from '@/src/hooks/useServers';
import { useHomeData } from '@/src/hooks/useHomeData';
import { useCatalogRegion } from '@/src/hooks/useCatalogRegion';
import type { RootStackScreenProps } from '@/src/navigation/types';

const MESSAGES: string[] = Array.isArray(loadingMessages)
  ? loadingMessages
  : Object.values(loadingMessages as Record<string, string>);
const MESSAGE_INTERVAL = 350;
/** Quick welcome: visible for ~1s, then a short polished fade. */
const TOTAL_MS = 1050;
const FADE_OUT_MS = 240;

// Coffee steam particles config
const STEAM_COUNT = 6;

export const SplashScreen = ({ navigation }: RootStackScreenProps<'Splash'>) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [messageIndex, setMessageIndex] = useState(() =>
    Math.floor(Math.random() * Math.max(MESSAGES.length, 1)),
  );
  const [showCopy, setShowCopy] = useState(false);
  const { refreshBuiltInServers } = useServers();
  const { prefetch } = useHomeData();
  const { loaded: regionLoaded } = useCatalogRegion();

  const drawDoneRef = useRef(false);
  const didStartExitRef = useRef(false);
  const didNavigateRef = useRef(false);
  const landTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootFnsRef = useRef({ refreshBuiltInServers, prefetch });
  bootFnsRef.current = { refreshBuiltInServers, prefetch };

  // Shared animation values. `exitOpacity` fades the whole welcome image so
  // the handoff to Main never shows a hard cut.
  const exitOpacity = useSharedValue(1);
  const logoScale = useSharedValue(0.7);
  const logoOpacity = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const titleTranslate = useSharedValue(24);
  const taglineOpacity = useSharedValue(0);
  const bgShift = useSharedValue(0);

  const goMain = useCallback(() => {
    if (didNavigateRef.current) return;
    didNavigateRef.current = true;
    navigation.replace('Main');
  }, [navigation]);

  const maybeExit = useCallback(() => {
    if (didStartExitRef.current) return;
    // Network warming is deliberately NOT a gate: a slow server list or TMDB
    // request must never keep the welcome image on screen. Boot runs in the
    // background and Home renders its own skeleton if needed.
    if (!drawDoneRef.current) return;
    didStartExitRef.current = true;
    exitOpacity.value = withTiming(0, {
      duration: FADE_OUT_MS,
      easing: Easing.inOut(Easing.quad),
    });
    landTimerRef.current = setTimeout(goMain, FADE_OUT_MS);
  }, [exitOpacity, goMain]);
  const maybeExitRef = useRef(maybeExit);
  maybeExitRef.current = maybeExit;

  const markDrawDone = useCallback(() => {
    drawDoneRef.current = true;
    setShowCopy(true);
    maybeExitRef.current();
  }, []);
  const markDrawDoneRef = useRef(markDrawDone);
  markDrawDoneRef.current = markDrawDone;

  useEffect(() => {
    // Background shimmer
    bgShift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    // Logo entrance
    logoOpacity.value = withTiming(1, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
    });
    logoScale.value = withTiming(1, {
      duration: 340,
      easing: Easing.out(Easing.back(1.4)),
    });
    // Title
    titleOpacity.value = withDelay(
      90,
      withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) }),
    );
    titleTranslate.value = withDelay(
      90,
      withTiming(0, { duration: 240, easing: Easing.out(Easing.cubic) }),
    );
    // Tagline
    taglineOpacity.value = withDelay(
      180,
      withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }),
    );

    const fallback = setTimeout(() => markDrawDoneRef.current(), TOTAL_MS);
    return () => clearTimeout(fallback);
  }, [bgShift, logoOpacity, logoScale, markDrawDoneRef, taglineOpacity, titleOpacity, titleTranslate]);

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
      // Fire-and-forget: failures are soft, and none of this blocks the
      // welcome animation. Home has its own skeleton/retry states.
      await Promise.allSettled([refreshServers(), prefetchHome()]);
      if (cancelled) return;
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

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslate.value }],
  }));
  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
  }));
  const bgStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + bgShift.value * 0.35,
  }));
  const exitStyle = useAnimatedStyle(() => ({
    opacity: exitOpacity.value,
  }));

  const logoSize = Math.min(windowWidth * 0.55, 260);

  return (
    <Animated.View style={[{ flex: 1 }, exitStyle]} pointerEvents="box-none">
      <Box className="flex-1 bg-background">
      {/* Animated coffee-toned gradient background */}
      <Animated.View
        style={[{ position: 'absolute', inset: 0 }, bgStyle]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={['#3b1a0a', '#1a0a05', '#000000', '#1a0505']}
          locations={[0, 0.35, 0.7, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={{ flex: 1 }}
        />
      </Animated.View>

      {/* Rising steam particles */}
      <Box className="absolute inset-0" pointerEvents="none">
        {Array.from({ length: STEAM_COUNT }).map((_, i) => (
          <SteamParticle key={i} index={i} height={windowHeight} />
        ))}
      </Box>

      <VStack className="flex-1 items-center justify-center" space="lg">
        <Animated.View style={logoStyle}>
          <Image
            source={require('../../assets/images/coffe-house-splash.png')}
            style={{ width: logoSize, height: logoSize }}
            resizeMode="contain"
            alt="CoFFe House"
          />
        </Animated.View>

        <Animated.View style={titleStyle}>
          <Text
            size="4xl"
            bold
            className="text-center text-foreground"
            style={{ letterSpacing: 2 }}
          >
            CoFFe House
          </Text>
        </Animated.View>

        <Animated.View style={taglineStyle}>
          <Text size="sm" className="text-center text-muted-foreground">
            Your coffee. Your cinema.
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeIn.delay(150).duration(200)}
          style={{ opacity: showCopy ? 1 : 0 }}
        >
          <ActivityIndicator size="large" color="#E50914" />
        </Animated.View>

        <Box className="min-h-10 px-8" style={{ opacity: showCopy ? 1 : 0 }}>
          <Text
            key={messageIndex}
            size="xs"
            className="text-center text-muted-foreground"
          >
            {message}
          </Text>
        </Box>
      </VStack>
      </Box>
    </Animated.View>
  );
};

const SteamParticle = ({
  index,
  height,
}: {
  index: number;
  height: number;
}) => {
  const y = useSharedValue(height * 0.55);
  const x = useSharedValue(0);
  const opacity = useSharedValue(0);
  const size = 6 + (index % 3) * 4;

  useEffect(() => {
    const delay = index * 320;
    const duration = 2600 + (index % 4) * 400;
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.55, { duration: duration * 0.3, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: duration * 0.7, easing: Easing.in(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
    y.value = withDelay(
      delay,
      withRepeat(
        withTiming(-height * 0.35, { duration, easing: Easing.out(Easing.quad) }),
        -1,
        false,
      ),
    );
    x.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(18, { duration: duration / 2, easing: Easing.inOut(Easing.sin) }),
          withTiming(-18, { duration: duration / 2, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      ),
    );
  }, [height, index, opacity, x, y]);

  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    left: '50%',
    bottom: height * 0.32,
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    opacity: opacity.value,
    transform: [{ translateX: x.value + (index - STEAM_COUNT / 2) * 22 }, { translateY: y.value }],
  }));

  return <Animated.View style={style} />;
};