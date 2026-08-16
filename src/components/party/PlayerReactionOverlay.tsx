import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import type { FloatingReaction } from '@/src/components/party/partyReactions';

const FLOAT_MS = 2200;

interface PlayerReactionOverlayProps {
  items: FloatingReaction[];
  onExpire: (id: string) => void;
}

const ReactionBubble = ({
  item,
  onExpire,
}: {
  item: FloatingReaction;
  onExpire: (id: string) => void;
}) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: FLOAT_MS }, (finished) => {
      if (finished) runOnJS(onExpire)(item.id);
    });
  }, [item.id, onExpire, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.72, 1], [1, 1, 0]),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [0, -220]) },
      { scale: interpolate(progress.value, [0, 0.14, 1], [0.6, 1.15, 1]) },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          bottom: '18%',
          left: `${item.leftPct}%`,
        },
        style,
      ]}
    >
      <VStack className="items-center">
        <Text className="text-4xl">{item.emoji}</Text>
        <Text size="xs" className="text-foreground">
          {item.from}
        </Text>
      </VStack>
    </Animated.View>
  );
};

export const PlayerReactionOverlay = ({
  items,
  onExpire,
}: PlayerReactionOverlayProps) => {
  if (items.length === 0) return null;

  return (
    <Box
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      className="z-20"
    >
      {items.map((item) => (
        <ReactionBubble key={item.id} item={item} onExpire={onExpire} />
      ))}
    </Box>
  );
};
