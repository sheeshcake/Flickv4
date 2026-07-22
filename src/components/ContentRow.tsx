import { useState } from 'react';
import { FlatList } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { ContentCard } from '@/src/components/ContentCard';
import { ConfirmDialog } from '@/src/components/ConfirmDialog';
import { getTitle, type MediaItem } from '@/src/types';
import type { DeviceKind } from '@/src/utils/responsive';
import { getCardWidth, getHorizontalPadding } from '@/src/utils/responsive';

interface ContentRowProps {
  title: string;
  data: MediaItem[];
  deviceKind: DeviceKind;
  screenWidth: number;
  onItemPress: (item: MediaItem) => void;
  onItemLongPress?: (item: MediaItem) => void;
  /** Optional progress lookup for Continue Watching cards. */
  getProgress?: (item: MediaItem) => number | undefined;
  /** Optional caption lookup (e.g. "S1 E3" for TV Continue Watching). */
  getCaption?: (item: MediaItem) => string | undefined;
  /** When provided, renders a "View More" affordance in the header. */
  onViewMore?: () => void;

  // ---- Row-scoped selection mode ------------------------------------------
  /** When true, every card shows a top-right X and taps are suppressed. */
  selectionEnabled?: boolean;
  /** Fired when the user long-presses a card while selection is off. */
  onEnterSelection?: () => void;
  /** Fired when the user hits the row's "Done" chip. */
  onExitSelection?: () => void;
  /** Called after confirmation with the item the user chose to delete. */
  onConfirmDelete?: (item: MediaItem) => void;
  /** Header for the confirm dialog (e.g. "Remove from Continue Watching?"). */
  confirmTitle?: string;
}

export const ContentRow = ({
  title,
  data,
  deviceKind,
  screenWidth,
  onItemPress,
  onItemLongPress,
  getProgress,
  getCaption,
  onViewMore,
  selectionEnabled = false,
  onEnterSelection,
  onExitSelection,
  onConfirmDelete,
  confirmTitle = 'Remove from list?',
}: ContentRowProps) => {
  const [pendingDelete, setPendingDelete] = useState<MediaItem | null>(null);
  if (!data.length) return null;

  const cardWidth = getCardWidth(deviceKind, screenWidth);
  const padding = getHorizontalPadding(deviceKind);

  return (
    <Box className="mb-6">
      {title ? (
        <HStack
          className="mb-3 items-center justify-between"
          style={{ paddingHorizontal: padding }}
        >
          <Heading size="lg" className="text-foreground">
            {title}
          </Heading>
          <HStack space="sm" className="items-center">
            {selectionEnabled ? (
              <Pressable
                onPress={onExitSelection}
                className="rounded-full bg-primary/20 px-3 py-1"
              >
                <Text size="sm" className="font-semibold text-primary">
                  Done
                </Text>
              </Pressable>
            ) : null}
            {onViewMore && !selectionEnabled ? (
              <Pressable
                onPress={onViewMore}
                focusable
                className="flex-row items-center gap-1"
              >
                <Text size="sm" className="text-muted-foreground">
                  View More
                </Text>
                <Icon
                  as={ChevronRight}
                  size="sm"
                  className="text-muted-foreground"
                />
              </Pressable>
            ) : null}
          </HStack>
        </HStack>
      ) : null}
      <FlatList
        horizontal
        data={data}
        keyExtractor={(item) => `${item.media_type ?? ''}-${item.id}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: padding, gap: 12 }}
        renderItem={({ item }) => (
          <ContentCard
            item={item}
            width={cardWidth}
            onPress={onItemPress}
            onLongPress={
              onEnterSelection
                ? () => {
                    if (!selectionEnabled) onEnterSelection();
                  }
                : onItemLongPress
            }
            progress={getProgress?.(item)}
            caption={getCaption?.(item)}
            selectable={selectionEnabled}
            onRequestDelete={
              onConfirmDelete ? (it) => setPendingDelete(it) : undefined
            }
          />
        )}
      />

      <ConfirmDialog
        visible={pendingDelete != null}
        title={confirmTitle}
        message={
          pendingDelete
            ? `Remove "${getTitle(pendingDelete)}"?`
            : ''
        }
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (pendingDelete && onConfirmDelete) onConfirmDelete(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </Box>
  );
};
