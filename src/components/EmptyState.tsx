import type { LucideIcon } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Center } from '@/components/ui/center';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';

export interface EmptyStateProps {
  /** Lucide icon shown inside a soft circular badge. */
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionVariant?: 'default' | 'outline' | 'secondary' | 'ghost';
  /** Disables the action while a retry is in flight. */
  actionDisabled?: boolean;
  /** Tighter padding for inline list empties. */
  compact?: boolean;
}

/**
 * Shared empty / zero-result state.
 *
 * Before this existed every screen rendered a bare grey sentence, which made
 * genuinely different situations ("nothing matches your filters", "no
 * connection", "the catalog is empty") look identical and dead-ended the
 * user. This gives each case an icon, an explanation, and a way forward.
 */
export const EmptyState = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionVariant = 'outline',
  actionDisabled = false,
  compact = false,
}: EmptyStateProps) => {
  const badgeSize = compact ? 'h-12 w-12' : 'h-16 w-16';
  const iconSize = compact ? 'lg' : 'xl';

  return (
    <Center className={compact ? 'px-6 py-8' : 'flex-1 px-8 py-12'}>
      <VStack space="md" className="items-center" style={{ maxWidth: 420 }}>
        {icon ? (
          <Box
            className={`${badgeSize} items-center justify-center rounded-full border border-border bg-card`}
          >
            <Icon as={icon} size={iconSize} className="text-primary" />
          </Box>
        ) : null}

        <Text bold className="text-center text-lg text-foreground">
          {title}
        </Text>

        {description ? (
          <Text className="text-center text-sm text-muted-foreground">
            {description}
          </Text>
        ) : null}

        {actionLabel && onAction ? (
          <Button
            variant={actionVariant}
            size="sm"
            className="mt-2"
            onPress={onAction}
            isDisabled={actionDisabled}
          >
            <ButtonText>{actionLabel}</ButtonText>
          </Button>
        ) : null}
      </VStack>
    </Center>
  );
};
