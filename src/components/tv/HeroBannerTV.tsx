import { useState, type RefObject } from 'react';
import { ImageBackground } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CalendarClock, Check, Play, Plus } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Image } from '@/components/ui/image';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { Focusable } from '@/src/components/Focusable';
import { useTVRemote } from '@/src/components/player/useTVRemote';
import { TMDBService } from '@/src/services/TMDBService';
import { useTitleLogo } from '@/src/hooks/useTitleLogo';
import { getTitle, type MediaItem } from '@/src/types';
import type { TVSideNavHandle } from '@/src/components/tv/TVSideNav';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

interface HeroBannerTVProps {
  item: MediaItem;
  height: number;
  inMyList: boolean;
  onPlay: (item: MediaItem) => void;
  onToggleList: (item: MediaItem) => void;
  comingSoonLabel?: string;
  /** Sidebar handle, so a dead-end D-pad "Left" can hand focus back to it. */
  sidebarRef?: RefObject<TVSideNavHandle | null>;
}

/**
 * TV-only hero banner: left-aligned (Netflix/Apple TV convention) so its
 * button row sits close to the sidebar rail, with an explicit focus
 * hand-off so D-pad "Left" out of Play reliably reaches the sidebar instead
 * of depending on the platform's spatial-nav heuristic to find it.
 */
export const HeroBannerTV = ({
  item,
  height,
  inMyList,
  onPlay,
  onToggleList,
  comingSoonLabel,
  sidebarRef,
}: HeroBannerTVProps) => {
  const backdrop = TMDBService.getImageUrl(
    item.backdrop_path ?? item.poster_path,
    'w780',
  );
  const logoPath = useTitleLogo(item);
  const logoUrl = TMDBService.getImageUrl(logoPath, 'w780');

  // Tracks whether either of this hero's own buttons currently holds D-pad
  // focus, so we only ever hand off to the sidebar when Left is pressed
  // from *this* row (not, say, from a content row further down the page).
  const [heroFocused, setHeroFocused] = useState(false);

  useTVRemote({
    // `useTVRemote`'s directional callbacks only fire when the native focus
    // engine found nothing to move to, so this is a no-op everywhere Left
    // has a real neighbor — it only kicks in exactly when Left would
    // otherwise be a dead end.
    onLeft: () => {
      if (heroFocused) sidebarRef?.current?.focusActiveTab();
    },
  });

  return (
    <Box style={{ height }} className="w-full">
      <ImageBackground
        source={{ uri: backdrop ?? undefined }}
        resizeMode="cover"
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,1)']}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.6, y: 0 }}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}
        />
        <VStack
          space="md"
          style={{ paddingHorizontal: 48, paddingBottom: 56, maxWidth: 720 }}
        >
          {logoUrl ? (
            <Image
              source={{ uri: logoUrl }}
              alt={getTitle(item)}
              resizeMode="contain"
              className="h-28 w-full"
              style={{ alignSelf: 'flex-start' }}
            />
          ) : (
            <Heading
              size="4xl"
              bold
              className="text-foreground"
              numberOfLines={2}
            >
              {getTitle(item)}
            </Heading>
          )}
          <Text
            size="md"
            className="text-muted-foreground"
            numberOfLines={3}
          >
            {item.overview}
          </Text>
          <HStack space="md" className="mt-2 items-center">
            {comingSoonLabel ? (
              <Box className="w-56 items-center justify-center rounded-md bg-secondary/60 px-6 py-3">
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
                onFocusChange={setHeroFocused}
                className="w-56 items-center justify-center rounded-md bg-foreground px-6 py-3"
                focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
              >
                <HStack space="sm" className="items-center justify-center">
                  <Icon as={Play} className="text-black" />
                  <Text className="font-semibold text-black">Play</Text>
                </HStack>
              </Focusable>
            )}
            <Focusable
              onPress={() => onToggleList(item)}
              onFocusChange={setHeroFocused}
              className="w-16 items-center justify-center rounded-md bg-secondary px-6 py-3"
              focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
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
