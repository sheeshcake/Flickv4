import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronRight,
  Captions,
  Download,
  Info,
  Heart,
  MonitorPlay,
  Ratio,
  Server as ServerIcon,
} from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Focusable } from '@/src/components/Focusable';
import { useServers } from '@/src/hooks/useServers';
import { useSubtitleSettings } from '@/src/hooks/useSubtitleSettings';
import {
  getQualityLabel,
  useVideoQuality,
} from '@/src/hooks/useVideoQuality';
import {
  getAspectLabel,
  useVideoAspect,
} from '@/src/hooks/useVideoAspect';
import { getLanguageLabel } from '@/src/constants/languages';
import { UpdateModal } from '@/src/components/UpdateModal';
import { updateService } from '@/src/services/UpdateService';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';
import type { RootStackParamList } from '@/src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export const SettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { activeServer } = useServers();
  const { settings: subtitleSettings } = useSubtitleSettings();
  const { preference: videoQuality } = useVideoQuality();
  const { aspect: videoAspect } = useVideoAspect();
  const subtitleLangLabel = getLanguageLabel(subtitleSettings.defaultLanguage);
  const videoQualityLabel = getQualityLabel(videoQuality);
  const videoAspectLabel = getAspectLabel(videoAspect);
  const [updaterOpen, setUpdaterOpen] = useState(false);

  return (
    <Box className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <Heading size="2xl" bold className="mb-6 mt-4 px-4 text-foreground">
        Settings
      </Heading>

      <VStack space="sm" className="px-4">
        <MenuRow
          icon={ServerIcon}
          label="Playback server"
          value={activeServer.name}
          onPress={() => navigation.navigate('ServerSettings')}
        />
        <MenuRow
          icon={MonitorPlay}
          label="Video quality"
          value={`Preferred: ${videoQualityLabel}`}
          onPress={() => navigation.navigate('VideoQualitySettings')}
        />
        <MenuRow
          icon={Ratio}
          label="Video aspect"
          value={videoAspectLabel}
          onPress={() => navigation.navigate('VideoAspectSettings')}
        />
        <MenuRow
          icon={Captions}
          label="Subtitles"
          value={`Default: ${subtitleLangLabel}`}
          onPress={() => navigation.navigate('SubtitleSettings')}
        />
        <MenuRow
          icon={Download}
          label="Check for updates"
          value={`Current version: v${updateService.getCurrentVersion()}`}
          onPress={() => setUpdaterOpen(true)}
        />
        <MenuRow
          icon={Info}
          label="Disclaimer"
          value="About content sources & third-party servers"
          onPress={() => navigation.navigate('Disclaimer')}
        />
        <MenuRow
          icon={Heart}
          label="Credits"
          value="Attributions for TMDB, Wyzie & more"
          onPress={() => navigation.navigate('Credits')}
        />
      </VStack>

      <UpdateModal
        visible={updaterOpen}
        onClose={() => setUpdaterOpen(false)}
      />
    </Box>
  );
};

const MenuRow = ({
  icon,
  label,
  value,
  onPress,
}: {
  icon: typeof ServerIcon;
  label: string;
  value?: string;
  onPress: () => void;
}) => (
  <Focusable
    onPress={onPress}
    className="rounded-lg"
    focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
  >
    <HStack className="items-center rounded-lg bg-card px-4 py-4">
      <Icon as={icon} className="text-foreground" />
      <VStack className="ml-3 flex-1">
        <Text className="text-foreground">{label}</Text>
        {value ? (
          <Text size="xs" className="text-muted-foreground">
            {value}
          </Text>
        ) : null}
      </VStack>
      <Icon as={ChevronRight} className="text-muted-foreground" />
    </HStack>
  </Focusable>
);
