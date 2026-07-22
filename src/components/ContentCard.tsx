import { Pressable } from 'react-native';
import { X } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { Image } from '@/components/ui/image';
import { Text } from '@/components/ui/text';
import { Center } from '@/components/ui/center';
import { VStack } from '@/components/ui/vstack';
import { Icon } from '@/components/ui/icon';
import { Focusable } from '@/src/components/Focusable';
import { TMDBService } from '@/src/services/TMDBService';
import { getTitle, type MediaItem } from '@/src/types';
import { POSTER_ASPECT_RATIO } from '@/src/utils/responsive';

interface ContentCardProps {
  item: MediaItem;
  width: number;
  onPress: (item: MediaItem) => void;
  onLongPress?: (item: MediaItem) => void;
  hasTVPreferredFocus?: boolean;
  showTitle?: boolean;
  /** 0..1 progress bar overlay for Continue Watching. */
  progress?: number;
  /** Optional secondary line under the title (e.g. "S1 E3"). */
  caption?: string;
  /**
   * When true, an "X" overlay is rendered in the top-right corner. Tapping it
   * calls `onRequestDelete` (typically the parent row's delete-with-confirm
   * flow). The card's regular `onPress` is suppressed while `selectable`.
   */
  selectable?: boolean;
  onRequestDelete?: (item: MediaItem) => void;
}

export const ContentCard = ({
  item,
  width,
  onPress,
  onLongPress,
  hasTVPreferredFocus,
  showTitle = true,
  progress,
  caption,
  selectable = false,
  onRequestDelete,
}: ContentCardProps) => {
  const posterUrl = TMDBService.getImageUrl(item.poster_path, 'w300');
  const height = width * POSTER_ASPECT_RATIO;

  return (
    <Focusable
      onPress={() => {
        if (selectable) {
          // In selection mode, tapping the card body does nothing so the
          // user can't accidentally play something while trying to prune the
          // row.
          return;
        }
        onPress(item);
      }}
      onLongPress={onLongPress ? () => onLongPress(item) : undefined}
      hasTVPreferredFocus={hasTVPreferredFocus}
      className="rounded-md"
      focusedClassName="scale-[1.05] border-2 border-primary"
    >
      <VStack space="xs" style={{ width }}>
        <Box
          className="overflow-hidden rounded-md bg-card"
          style={{ width, height }}
        >
          {posterUrl ? (
            <Image
              source={{ uri: posterUrl }}
              alt={getTitle(item)}
              resizeMode="cover"
              className="h-full w-full"
            />
          ) : (
            <Center className="h-full w-full p-2">
              <Text
                size="xs"
                className="text-center text-muted-foreground"
                numberOfLines={3}
              >
                {getTitle(item)}
              </Text>
            </Center>
          )}
          {caption ? (<Box
                className="absolute bottom-0 left-0 right-0 h-1 bg-muted/60 justify-center px-1"
                style={{ width, height: 20 }}
              >
              <Text size="xs" className="text-muted-foreground" numberOfLines={1}>
                {caption}
              </Text>
            </Box>
          ) : null}

          {progress != null && progress > 0 && (
            <Box className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
              <Box
                className="h-1 bg-primary"
                style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
              />
            </Box>
          )}

          {selectable && onRequestDelete ? (
            <Pressable
              onPress={() => onRequestDelete(item)}
              hitSlop={12}
              style={{ position: 'absolute', top: 4, right: 4, zIndex: 20 }}
            >
              <Box className="rounded-full bg-black/80 p-1.5">
                <Icon as={X} className="text-primary" />
              </Box>
            </Pressable>
          ) : null}
        </Box>
        {showTitle ? (
          <Text
            size="xs"
            className="text-foreground"
            numberOfLines={2}
          >
            {getTitle(item)}
          </Text>
        ) : null}
      </VStack>
    </Focusable>
  );
};
