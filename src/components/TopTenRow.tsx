import { memo } from 'react';
import { FlatList } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ContentCard } from '@/src/components/ContentCard';
import { Focusable } from '@/src/components/Focusable';
import type { MediaItem } from '@/src/types';
import type { DeviceKind } from '@/src/utils/responsive';
import {
  getHorizontalPadding,
  getTopTenCardWidth,
  POSTER_ASPECT_RATIO,
} from '@/src/utils/responsive';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

interface TopTenRowProps {
  title: string;
  data: MediaItem[];
  deviceKind: DeviceKind;
  screenWidth: number;
  onItemPress: (item: MediaItem) => void;
  onViewMore?: () => void;
}

const STROKE_OFFSETS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

interface StrokedDigitProps {
  digit: string;
  fontSize: number;
  stroke: number;
}

/** Hollow rank glyph: background fill + muted outline, matching Netflix Top 10. */
const StrokedDigit = ({ digit, fontSize, stroke }: StrokedDigitProps) => (
  <Box>
    {STROKE_OFFSETS.map(([dx, dy]) => (
      <Text
        key={`${dx}:${dy}`}
        bold
        className="absolute font-black text-muted-foreground"
        style={{
          fontSize,
          lineHeight: fontSize,
          left: dx * stroke,
          top: dy * stroke,
        }}
      >
        {digit}
      </Text>
    ))}
    <Text
      bold
      className="font-black text-background"
      style={{ fontSize, lineHeight: fontSize }}
    >
      {digit}
    </Text>
  </Box>
);

interface RankNumberProps {
  rank: number;
  fontSize: number;
  stroke: number;
}

const RankNumber = ({ rank, fontSize, stroke }: RankNumberProps) => (
  <Box
    className="h-full flex-row items-end justify-start"
    pointerEvents="none"
  >
    {rank === 10 ? (
      <>
        <Box className="z-10">
          <StrokedDigit digit="1" fontSize={fontSize} stroke={stroke} />
        </Box>
        <Box className="z-11" style={{ marginLeft: -(fontSize * 0.23) }}>
          <StrokedDigit digit="0" fontSize={fontSize} stroke={stroke} />
        </Box>
      </>
    ) : (
      <StrokedDigit
        digit={String(rank)}
        fontSize={fontSize}
        stroke={stroke}
      />
    )}
  </Box>
);

interface RankedPosterProps {
  item: MediaItem;
  rank: number;
  cardWidth: number;
  isTv: boolean;
  onPress: (item: MediaItem) => void;
}

const RankedPoster = ({
  item,
  rank,
  cardWidth,
  isTv,
  onPress,
}: RankedPosterProps) => {
  const posterHeight = cardWidth * POSTER_ASPECT_RATIO;
  const isTen = rank === 10;
  const fontSize = posterHeight * (isTv ? 1.02 : 0.98);
  const stroke = Math.max(isTv ? 3 : 2);
  // Digit is nearly poster-tall; poster covers the right ~45% like Netflix.
  const digitWidth = fontSize * 0.62;
  const rankWidth = isTen ? digitWidth * 1.55 : digitWidth;
  const overlap = digitWidth * 0.48;
  const itemWidth = rankWidth + cardWidth - overlap;

  return (
    <Box style={{ width: itemWidth, height: posterHeight }}>
      <Box
        className="absolute bottom-0 left-0 overflow-visible"
        style={{ width: rankWidth, height: posterHeight }}
      >
        <RankNumber rank={rank} fontSize={fontSize} stroke={stroke} />
      </Box>
      <Box
        className="absolute bottom-0 z-10"
        style={{ left: rankWidth - overlap, width: cardWidth }}
      >
        <ContentCard
          item={item}
          width={cardWidth}
          onPress={onPress}
          showTitle={false}
        />
      </Box>
    </Box>
  );
};

export const TopTenRow = memo(function TopTenRow({
  title,
  data,
  deviceKind,
  screenWidth,
  onItemPress,
  onViewMore,
}: TopTenRowProps) {
  if (!data.length) return null;

  const cardWidth = getTopTenCardWidth(deviceKind, screenWidth);
  const padding = getHorizontalPadding(deviceKind);
  const isTv = deviceKind === 'tv';
  const ranked = data.slice(0, 10);

  return (
    <Box className={isTv ? 'mb-10' : 'mb-6'}>
      <HStack
        className="mb-3 items-center justify-between"
        style={{ paddingHorizontal: padding }}
      >
        <HStack space="sm" className="items-center">
          <Box className="h-6 w-1 rounded-full bg-primary" />
          <Heading size={isTv ? '2xl' : 'lg'} className="text-foreground">
            {title}
          </Heading>
        </HStack>
        {onViewMore ? (
          <Focusable
            onPress={onViewMore}
            className="flex-row items-center gap-1 rounded-md"
            focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
          >
            <Text size="sm" className="text-muted-foreground">
              View More
            </Text>
            <Icon
              as={ChevronRight}
              size="sm"
              className="text-muted-foreground"
            />
          </Focusable>
        ) : null}
      </HStack>
      <FlatList
        horizontal
        data={ranked}
        keyExtractor={(item, index) =>
          `${item.media_type ?? ''}-${item.id}-${index}`
        }
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: padding, gap: 8 }}
        renderItem={({ item, index }) => (
          <RankedPoster
            item={item}
            rank={index + 1}
            cardWidth={cardWidth}
            isTv={isTv}
            onPress={onItemPress}
          />
        )}
      />
    </Box>
  );
});
