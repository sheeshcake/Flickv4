import { Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  ListVideo,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Settings2,
} from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Center } from '@/components/ui/center';
import { Focusable } from '@/src/components/Focusable';
import { ProgressBar } from '@/src/components/player/ProgressBar';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';
import { formatTime } from '@/src/components/player/useTVRemote';

interface PlayerControlsProps {
  title: string;
  subtitle?: string;
  playing: boolean;
  currentTime: number;
  duration: number;
  /** Buffered fraction 0..1 rendered behind the played fill. */
  buffered?: number;
  onOverlayPress: () => void;
  onBack: () => void;
  onTogglePlay: () => void;
  onSeekBy: (seconds: number) => void;
  onScrub: (value: number) => void;
  onScrubEnd: (value: number) => void;
  /** When provided, shows an Episodes button (TV only). */
  onOpenEpisodes?: () => void;
  /** When provided, shows the consolidated Settings button (quality,
   * aspect, speed, subtitles — see `PlayerSettingsDrawer`). */
  onOpenSettings?: () => void;
  /** Highlights the Settings button when any of its settings are non-
   * default (speed ≠ 1x, subtitles on, quality not Auto, aspect changed). */
  settingsActive?: boolean;
  /** When provided, shows a Picture-in-Picture button. */
  onEnterPip?: () => void;
}

const ControlButton = ({
  icon,
  onPress,
  size = 'xl',
  hasTVPreferredFocus,
}: {
  icon: typeof Play;
  onPress: () => void;
  size?: 'lg' | 'xl';
  hasTVPreferredFocus?: boolean;
}) => (
  <Focusable
    onPress={onPress}
    hasTVPreferredFocus={hasTVPreferredFocus}
    className="rounded-full bg-background/40 p-4"
    focusedClassName={`bg-primary/20 ${TV_FOCUS_BORDER_CLASSNAME}`}
  >
    <Icon as={icon} size={size} className="text-foreground" />
  </Focusable>
);

export const PlayerControls = ({
  title,
  subtitle,
  playing,
  currentTime,
  duration,
  buffered = 0,
  onOverlayPress,
  onBack,
  onTogglePlay,
  onSeekBy,
  onScrub,
  onScrubEnd,
  onOpenEpisodes,
  onOpenSettings,
  settingsActive,
  onEnterPip,
}: PlayerControlsProps) => {
  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <Box className="absolute inset-0">
      <Pressable style={StyleSheet.absoluteFill} onPress={onOverlayPress}>
        <LinearGradient
          colors={['rgba(0,0,0,0.7)', 'transparent', 'rgba(0,0,0,0.8)']}
          style={StyleSheet.absoluteFill}
        />
      </Pressable>

      <HStack space="md" className="items-center px-8 pt-6">
        <Focusable
          onPress={onBack}
          className="rounded-full bg-background/40 p-2"
          focusedClassName={`bg-primary/20 ${TV_FOCUS_BORDER_CLASSNAME}`}
        >
          <Icon as={ArrowLeft} size="lg" className="text-foreground" />
        </Focusable>
        <VStack className="flex-1">
          <Heading size="md" className="text-foreground" numberOfLines={1}>
            {title}
          </Heading>
          {!!subtitle && (
            <Text size="xs" className="text-muted-foreground">
              {subtitle}
            </Text>
          )}
        </VStack>
        {onOpenEpisodes && (
          <Focusable
            onPress={onOpenEpisodes}
            className="rounded-full bg-background/40 p-2"
            focusedClassName={`bg-primary/20 ${TV_FOCUS_BORDER_CLASSNAME}`}
          >
            <Icon as={ListVideo} size="lg" className="text-foreground" />
          </Focusable>
        )}
        {onOpenSettings && (
          <Focusable
            onPress={onOpenSettings}
            className={`rounded-full p-2 ${settingsActive ? 'bg-primary' : 'bg-background/40'}`}
            focusedClassName={`bg-primary/20 ${TV_FOCUS_BORDER_CLASSNAME}`}
          >
            <Icon as={Settings2} size="lg" className="text-foreground" />
          </Focusable>
        )}
        {onEnterPip && (
          <Focusable
            onPress={onEnterPip}
            className="rounded-full bg-background/40 p-2"
            focusedClassName={`bg-primary/20 ${TV_FOCUS_BORDER_CLASSNAME}`}
          >
            <Icon
              as={PictureInPicture2}
              size="lg"
              className="text-foreground"
            />
          </Focusable>
        )}
      </HStack>

      <Center className="flex-1">
        <HStack space="4xl" className="items-center">
          <ControlButton icon={RotateCcw} onPress={() => onSeekBy(-10)} />
          <ControlButton
            icon={playing ? Pause : Play}
            onPress={onTogglePlay}
            hasTVPreferredFocus
          />
          <ControlButton icon={RotateCw} onPress={() => onSeekBy(10)} />
        </HStack>
      </Center>

      <VStack className="px-10 pb-1">
        <ProgressBar
          progress={progress}
          buffered={buffered}
          onScrub={onScrub}
          onScrubEnd={onScrubEnd}
        />
        <HStack className="justify-between">
          <Text size="xs" className="text-foreground">
            {formatTime(currentTime)}
          </Text>
          <Text size="xs" className="text-muted-foreground">
            {formatTime(duration)}
          </Text>
        </HStack>
      </VStack>
    </Box>
  );
};
