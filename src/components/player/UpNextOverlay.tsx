import { StyleSheet } from 'react-native';
import { Check, Play, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Box } from '@/components/ui/box';
import { Center } from '@/components/ui/center';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Image } from '@/components/ui/image';
import { Text } from '@/components/ui/text';
import { Focusable } from '@/src/components/Focusable';
import { UP_NEXT_LEAD_SECONDS } from '@/src/hooks/useNextEpisode';
import { TMDBService } from '@/src/services/TMDBService';
import type { Episode } from '@/src/types';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

interface UpNextOverlayProps {
  season: number;
  episode: Episode;
  secondsRemaining: number;
  onPlayNow: () => void;
  onCancel: () => void;
}

/**
 * TV-only "Up Next" card, shown over the last ~10s of a TV-show episode.
 * Replaces the transport controls while active (same visual layer as
 * `PlayerControls`) so there's no clutter competing for D-pad focus.
 */
export const UpNextOverlay = ({
  season,
  episode,
  secondsRemaining,
  onPlayNow,
  onCancel,
}: UpNextOverlayProps) => {
  const still = TMDBService.getImageUrl(episode.still_path, 'w300');
  const seconds = Math.max(0, Math.ceil(secondsRemaining));
  // Fraction of the countdown elapsed (0 when the card just appeared, 1
  // right as the episode ends), used to fill the Play Now button's
  // background like a loading bar in sync with the "Next episode in Ns"
  // countdown above.
  const fillFraction = Math.min(
    1,
    Math.max(0, 1 - secondsRemaining / UP_NEXT_LEAD_SECONDS),
  );

  return (
    <Box className="absolute inset-0">
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <Box className="absolute bottom-10 right-10 w-105 rounded-lg bg-card/95 p-4">
        <Text size="xs" className="mb-2 text-muted-foreground">
          Next episode in {seconds}s
        </Text>
        <HStack space="md">
          <Box className="h-20 w-32 overflow-hidden rounded-md bg-background">
            {still ? (
              <Image
                source={{ uri: still }}
                alt={episode.name}
                resizeMode="cover"
                className="h-full w-full"
              />
            ) : (
              <Center className="h-full w-full">
                <Icon as={Play} className="text-muted-foreground" />
              </Center>
            )}
          </Box>
          <VStack className="flex-1 justify-center">
            <Text size="2xs" className="text-muted-foreground">
              S{season} E{episode.episode_number}
            </Text>
            <Heading size="sm" className="text-foreground" numberOfLines={2}>
              {episode.name}
            </Heading>
          </VStack>
        </HStack>

        <HStack space="sm" className="mt-4 justify-end">
          <Focusable
            onPress={onCancel}
            className="flex-row items-center gap-1.5 rounded-md bg-secondary px-4 py-2"
            focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
          >
            <Icon as={X} size="sm" className="text-secondary-foreground" />
            <Text size="sm" className="text-secondary-foreground">
              Cancel
            </Text>
          </Focusable>
          {/* `px-4 py-2` lives on the inner HStack, not this Focusable's own
              className: React Native positions absolute children relative
              to the PADDING edge, so a percentage-width fill placed
              directly inside a padded container only ever spans the
              (smaller) padding box, not the button's true full width —
              making the fill visibly disagree with the countdown %. */}
          <Focusable
            onPress={onPlayNow}
            hasTVPreferredFocus
            className="overflow-hidden rounded-md bg-secondary"
            focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
          >
            {/* Loading-bar-style fill: same visual language as the
                scrub `ProgressBar`'s played track (`bg-primary`), growing
                to full width exactly as the countdown reaches zero. */}
            <Box
              className="absolute inset-y-0 left-0 bg-primary"
              style={{ width: `${fillFraction * 100}%` }}
              pointerEvents="none"
            />
            <HStack space="xs" className="items-center px-4 py-2">
              <Icon as={Play} size="sm" className="text-primary-foreground" />
              <Text size="sm" className="text-primary-foreground">
                Play Now
              </Text>
            </HStack>
          </Focusable>
        </HStack>
      </Box>
    </Box>
  );
};

/**
 * TV-only series-finale state: shown briefly after the last episode of the
 * last known season finishes, before `PlayerCore` navigates back to Detail.
 */
export const SeriesEndOverlay = () => (
  <Center className="absolute inset-0 bg-black/90">
    <Icon as={Check} size="xl" className="mb-3 text-primary" />
    <Heading size="md" className="text-foreground">
      You&apos;re all caught up
    </Heading>
    <Text size="sm" className="mt-1 text-muted-foreground">
      No more episodes to play.
    </Text>
  </Center>
);
