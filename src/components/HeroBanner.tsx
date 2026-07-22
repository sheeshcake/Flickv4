import { ImageBackground } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CalendarClock, Play, Plus, Check } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Image } from '@/components/ui/image';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { Focusable } from '@/src/components/Focusable';
import { TMDBService } from '@/src/services/TMDBService';
import { useTitleLogo } from '@/src/hooks/useTitleLogo';
import { getTitle, type MediaItem } from '@/src/types';
import type { DeviceKind } from '@/src/utils/responsive';

interface HeroBannerProps {
  item: MediaItem;
  deviceKind: DeviceKind;
  height: number;
  inMyList: boolean;
  onPlay: (item: MediaItem) => void;
  onToggleList: (item: MediaItem) => void;
  onPress: (item: MediaItem) => void;
  /**
   * When set, replaces the Play focusable with a non-interactive
   * "Coming {date}" stand-in. Used for unreleased titles that TMDB
   * still surfaces in Trending / Popular rows.
   */
  comingSoonLabel?: string;
}

export const HeroBanner = ({
  item,
  deviceKind,
  height,
  inMyList,
  onPlay,
  onToggleList,
  onPress,
  comingSoonLabel,
}: HeroBannerProps) => {
  const backdrop = TMDBService.getImageUrl(
    item.backdrop_path ?? item.poster_path,
    'w780',
  );
  const logoPath = useTitleLogo(item);
  const logoUrl = TMDBService.getImageUrl(logoPath, 'w780');
  const padding = deviceKind === 'phone' ? 16 : 32;
  const logoHeight = deviceKind === 'phone' ? 140 : 200;

  return (
    <Box style={{ height }} className="w-full">
      <ImageBackground
        source={{ uri: backdrop }}
        resizeMode="cover"
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,1)']}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}
        />
        <VStack space="md" style={{ padding }} className="items-center pb-15">
          {logoUrl ? (
            <Image
              source={{ uri: logoUrl }}
              alt={getTitle(item)}
              resizeMode="contain"
              className="h-30 w-80"
            />
          ) : (
            <Heading
              size={deviceKind === 'phone' ? '2xl' : '4xl'}
              bold
              className="text-center text-foreground"
              numberOfLines={2}
            >
              {getTitle(item)}
            </Heading>
          )}
          <Text
            size="sm"
            className="text-center text-muted-foreground"
            numberOfLines={2}
          >
            {item.overview}
          </Text>
          <HStack space="md" className="mt-2 items-center">
            {comingSoonLabel ? (
              // Non-interactive stand-in: nothing to play yet. Keeps the row
              // visually balanced with the Play button it replaces.
              <Box className="w-50 items-center justify-center rounded-md bg-secondary/60 px-6 py-3">
                <HStack space="sm" className="items-center justify-center">
                  <Icon
                    as={CalendarClock}
                    className="text-secondary-foreground"
                  />
                  <Text className="font-semibold text-secondary-foreground">
                    {comingSoonLabel}
                  </Text>
                </HStack>
              </Box>
            ) : (
              <Focusable
                onPress={() => onPlay(item)}
                hasTVPreferredFocus
                className="w-50 items-center justify-center rounded-md bg-foreground px-6 py-3"
                focusedClassName="scale-[1.05] border-2 border-primary"
              >
                <HStack space="sm" className="items-center justify-center">
                  <Icon as={Play} className="text-black" />
                  <Text className="font-semibold text-black">Play</Text>
                </HStack>
              </Focusable>
            )}
            <Focusable
              onPress={() => onToggleList(item)}
              className="w-15 items-center justify-center rounded-md bg-secondary px-6 py-3"
              focusedClassName="scale-[1.05] border-2 border-primary"
            >
              <Icon
                as={inMyList ? Check : Plus}
                className="text-secondary-foreground"
              />
            </Focusable>
          </HStack>
        </VStack>
      </ImageBackground>
    </Box>
  );
};
