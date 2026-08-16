import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Users } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { Focusable } from '@/src/components/Focusable';
import { useWatchParty } from '@/src/hooks/useWatchParty';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

const HIDDEN_STACK_ROUTES = new Set([
  'Player',
  'Splash',
  'Home',
  'Search',
  'Downloads',
  'Settings',
]);

/**
 * Shown while the host is still in a room but not on the player — so they
 * can pick another title without losing guests.
 */
export const PartySessionBar = ({
  routeName,
  placement = 'stack',
}: {
  routeName?: string;
  placement?: 'stack' | 'tabs';
}) => {
  const insets = useSafeAreaInsets();
  const { room, role, leaveRoom, joinNotice } = useWatchParty();

  if (!room || role !== 'host') return null;
  if (placement === 'stack' && (!routeName || HIDDEN_STACK_ROUTES.has(routeName))) {
    return null;
  }

  return (
    <Box
      className={
        placement === 'tabs'
          ? 'z-40 border-t border-border bg-card/95 px-4 py-2'
          : 'absolute inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-4 pt-2'
      }
      style={
        placement === 'stack'
          ? { paddingBottom: Math.max(insets.bottom, 12) }
          : undefined
      }
    >
      <HStack className="items-center justify-between">
        <HStack space="sm" className="min-w-0 flex-1 items-center">
          <Icon as={Users} size="sm" className="text-primary" />
          <Box className="min-w-0 flex-1">
            <Text size="xs" bold className="text-foreground">
              Party {room.code}
            </Text>
            <Text size="xs" numberOfLines={1} className="text-muted-foreground">
              {joinNotice
                ? `${joinNotice} joined`
                : room.browsing
                  ? 'Pick something to watch'
                  : room.content.title}
            </Text>
          </Box>
        </HStack>
        <Focusable
          onPress={() => leaveRoom()}
          className="rounded-md border border-border px-3 py-2"
          focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
        >
          <Text size="xs" className="text-foreground">
            Leave
          </Text>
        </Focusable>
      </HStack>
    </Box>
  );
};
