import { useEffect, useMemo, useState } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Box } from '@/components/ui/box';
import { Image } from '@/components/ui/image';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import loadingMessages from '@/src/constants/loadingMessages.json';
import type { RootStackScreenProps } from '@/src/navigation/types';

const MESSAGES = loadingMessages as string[];
const MESSAGE_INTERVAL = 900;
const SPLASH_DURATION = 2700;

const pickMessage = () => MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

const AnimatedBox = Animated.createAnimatedComponent(Box);

export const SplashScreen = ({ navigation }: RootStackScreenProps<'Splash'>) => {
  const scale = useSharedValue(0.85);
  const opacity = useSharedValue(0);
  const [message, setMessage] = useState(pickMessage);
  const initialMessage = useMemo(() => message, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 500 });
    scale.value = withTiming(1, { duration: 700 });

    setMessage(initialMessage);
    const rotator = setInterval(() => setMessage(pickMessage()), MESSAGE_INTERVAL);
    const timer = setTimeout(() => {
      navigation.replace('Main');
    }, SPLASH_DURATION);

    return () => {
      clearInterval(rotator);
      clearTimeout(timer);
    };
  }, [navigation, opacity, scale, initialMessage]);

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
    </Box>
  );
};
