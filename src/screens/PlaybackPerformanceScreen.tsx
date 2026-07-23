import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Cpu, RotateCcw } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Button, ButtonIcon, ButtonText } from '@/components/ui/button';
import { ScrollView } from '@/components/ui/scroll-view';
import { Focusable } from '@/src/components/Focusable';
import { usePlaybackSettings } from '@/src/hooks/usePlaybackSettings';
import {
  FORWARD_BUFFER_STEP_SECONDS,
  MAX_FORWARD_BUFFER_SECONDS,
  MIN_FORWARD_BUFFER_SECONDS,
  formatMemoryGb,
} from '@/src/utils/deviceRecommendations';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

const formatSeconds = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const minutes = seconds / 60;
  return Number.isInteger(minutes)
    ? `${minutes}m`
    : `${minutes.toFixed(1)}m`;
};

export const PlaybackPerformanceScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const {
    deviceTotalMemory,
    recommendedForwardBufferSeconds,
    forwardBufferSeconds,
    effectiveForwardBufferSeconds,
    setForwardBufferSeconds,
  } = usePlaybackSettings();

  const isAuto = forwardBufferSeconds == null;

  const bump = (dir: -1 | 1) => {
    const base = forwardBufferSeconds ?? recommendedForwardBufferSeconds;
    setForwardBufferSeconds(base + dir * FORWARD_BUFFER_STEP_SECONDS);
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
          Buffering
        </Heading>
      </HStack>

      <ScrollView className="flex-1 px-4">
        <VStack space="xl" className="pb-10">
          <HStack space="sm" className="items-center rounded-lg bg-card p-4">
            <Icon as={Cpu} className="text-muted-foreground" />
            <VStack className="flex-1">
              <Text size="sm" className="text-foreground">
                This device has {formatMemoryGb(deviceTotalMemory)} of RAM.
              </Text>
              <Text size="xs" className="text-muted-foreground">
                Recommended forward buffer:{' '}
                {formatSeconds(recommendedForwardBufferSeconds)}
              </Text>
            </VStack>
          </HStack>

          <VStack space="sm">
            <Text className="text-muted-foreground">Forward buffer</Text>
            <Text size="sm" className="text-muted-foreground">
              How much upcoming video the player reads ahead of the playhead.
              A larger window means fewer stalls on spotty connections, but
              uses more memory — the recommendation above is tuned for this
              device&apos;s RAM so it shouldn&apos;t need changing on most
              devices.
            </Text>

            <HStack space="sm" className="mt-2">
              <Button
                size="sm"
                variant={isAuto ? 'default' : 'outline'}
                onPress={() => setForwardBufferSeconds(null)}
              >
                <ButtonText
                  className={
                    isAuto ? 'text-primary-foreground' : 'text-foreground'
                  }
                >
                  Auto (recommended)
                </ButtonText>
              </Button>
              <Button
                size="sm"
                variant={!isAuto ? 'default' : 'outline'}
                onPress={() =>
                  setForwardBufferSeconds(
                    forwardBufferSeconds ?? recommendedForwardBufferSeconds,
                  )
                }
              >
                <ButtonText
                  className={
                    !isAuto ? 'text-primary-foreground' : 'text-foreground'
                  }
                >
                  Custom
                </ButtonText>
              </Button>
            </HStack>

            {!isAuto && (
              <HStack space="md" className="mt-2 items-center">
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() => bump(-1)}
                  isDisabled={
                    effectiveForwardBufferSeconds <= MIN_FORWARD_BUFFER_SECONDS
                  }
                >
                  <ButtonText>-{FORWARD_BUFFER_STEP_SECONDS}s</ButtonText>
                </Button>
                <Text className="min-w-16 text-center text-foreground">
                  {formatSeconds(effectiveForwardBufferSeconds)}
                </Text>
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() => bump(1)}
                  isDisabled={
                    effectiveForwardBufferSeconds >= MAX_FORWARD_BUFFER_SECONDS
                  }
                >
                  <ButtonText>+{FORWARD_BUFFER_STEP_SECONDS}s</ButtonText>
                </Button>
              </HStack>
            )}
          </VStack>

          <Button
            variant="outline"
            className="mt-4"
            onPress={() => setForwardBufferSeconds(null)}
          >
            <ButtonIcon as={RotateCcw} />
            <ButtonText>Reset to recommended</ButtonText>
          </Button>
        </VStack>
      </ScrollView>
    </Box>
  );
};
