import { memo } from 'react';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Heading } from '@/components/ui/heading';
import { Image } from '@/components/ui/image';
import { Text } from '@/components/ui/text';
import { Focusable } from '@/src/components/Focusable';
import { TMDBService } from '@/src/services/TMDBService';
import { formatComingLabel } from '@/src/utils/comingSoon';
import { getReleaseDate, getTitle, type MediaItem } from '@/src/types';
import { getGenreName } from '@/src/utils/genres';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

interface UpcomingCardProps {
  item: MediaItem;
  width: number;
  onPress: (item: MediaItem) => void;
}

const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

const dateParts = (iso?: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!match) return { month: 'SOON', day: '', year: '' };
  const [, year, month, day] = match;
  return {
    month: MONTHS[Number(month) - 1] ?? 'SOON',
    day: String(Number(day)),
    year,
  };
};

const genreTags = (ids: number[] | undefined): string =>
  (ids ?? [])
    .slice(0, 3)
    .map(getGenreName)
    .filter(Boolean)
    .join('  •  ');

const UpcomingCardBase = ({ item, width, onPress }: UpcomingCardProps) => {
  const iso = getReleaseDate(item);
  const date = dateParts(iso);
  const imagePath = item.backdrop_path ?? item.poster_path;
  const imageUrl = TMDBService.getImageUrl(imagePath, 'w780');
  const tags = genreTags(item.genre_ids);
  const artWidth = width - 66;

  return (
    <Focusable
      onPress={() => onPress(item)}
      className="rounded-lg"
      focusedClassName={`rounded-lg ${TV_FOCUS_BORDER_CLASSNAME}`}
    >
      <HStack space="sm" className="items-start">
        <VStack className="w-12 items-center" space="xs">
          <Text size="xs" className="font-bold text-muted-foreground">
            {date.month}
          </Text>
          <Text size="xl" className="font-bold text-foreground">
            {date.day}
          </Text>
          {date.year ? (
            <Text size="xs" className="text-muted-foreground">
              {date.year}
            </Text>
          ) : null}
        </VStack>

        <VStack className="flex-1" space="sm" style={{ width: artWidth }}>
          <Box
            className="overflow-hidden rounded-lg bg-card"
            style={{ width: artWidth, height: artWidth * 0.5625 }}
          >
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                alt={getTitle(item)}
                resizeMode="cover"
                className="h-full w-full"
              />
            ) : null}
          </Box>
          <Heading size="sm" className="text-foreground" numberOfLines={1}>
            {getTitle(item)}
          </Heading>
          <Text size="xs" className="font-bold text-primary">
            {formatComingLabel(iso)}
          </Text>
          <Text size="xs" className="text-muted-foreground" numberOfLines={3}>
            {item.overview}
          </Text>
          {tags ? (
            <Text size="xs" className="font-bold text-foreground" numberOfLines={1}>
              {tags}
            </Text>
          ) : null}
        </VStack>
      </HStack>
    </Focusable>
  );
};

export const UpcomingCard = memo(UpcomingCardBase);
