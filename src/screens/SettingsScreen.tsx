import { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bug,
  ChevronRight,
  Captions,
  CheckCircle2,
  Download,
  Gauge,
  Info,
  Heart,
  MonitorPlay,
  Ratio,
  Server as ServerIcon,
  User,
  Users,
} from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Input, InputField } from '@/components/ui/input';
import { ScrollView } from '@/components/ui/scroll-view';
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
import { useFinishedMovies } from '@/src/hooks/useFinishedMovies';
import { usePlayerDebugSettings } from '@/src/hooks/usePlayerDebugSettings';
import { usePlaybackSettings } from '@/src/hooks/usePlaybackSettings';
import { useWatchParty } from '@/src/hooks/useWatchParty';
import { PARTY_DISPLAY_NAME_MAX } from '@/src/party/displayName';
import { formatMemoryGb } from '@/src/utils/deviceRecommendations';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';
import type { RootStackParamList } from '@/src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export const SettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { activeServer } = useServers();
  const { entries: finishedMovies } = useFinishedMovies();
  const { scraperDebugEnabled, setScraperDebugEnabled } =
    usePlayerDebugSettings();
  const { forwardBufferSeconds, effectiveForwardBufferSeconds, deviceTotalMemory } =
    usePlaybackSettings();
  const { settings: subtitleSettings } = useSubtitleSettings();
  const { preference: videoQuality } = useVideoQuality();
  const { aspect: videoAspect } = useVideoAspect();
  const subtitleLangLabel = getLanguageLabel(subtitleSettings.defaultLanguage);
  const videoQualityLabel = getQualityLabel(videoQuality);
  const videoAspectLabel = getAspectLabel(videoAspect);
  const [updaterOpen, setUpdaterOpen] = useState(false);
  const { displayName, setDisplayName } = useWatchParty();
  const [nameDraft, setNameDraft] = useState(displayName);

  useEffect(() => {
    setNameDraft(displayName);
  }, [displayName]);

  return (
    <Box className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <Heading size="2xl" bold className="mb-6 mt-4 px-4 text-foreground">
        Settings
      </Heading>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <VStack space="sm" className="px-4">
          <MenuRow
            icon={Users}
            label="Join watch party"
            value="Enter a room code"
            onPress={() => navigation.navigate('JoinParty', {})}
          />
          <HStack className="items-center rounded-lg bg-card px-4 py-4">
            <Icon as={User} className="text-foreground" />
            <VStack className="ml-3 flex-1">
              <Text className="text-foreground">Watch party name</Text>
              <Input className="mt-2">
                <InputField
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  placeholder="Shown in chat and reactions"
                  maxLength={PARTY_DISPLAY_NAME_MAX}
                  autoCorrect={false}
                  onBlur={() => {
                    void setDisplayName(nameDraft).then(setNameDraft);
                  }}
                  onSubmitEditing={() => {
                    void setDisplayName(nameDraft).then(setNameDraft);
                  }}
                />
              </Input>
            </VStack>
          </HStack>
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
            icon={Gauge}
            label="Buffering"
            value={`${effectiveForwardBufferSeconds}s${forwardBufferSeconds == null ? ' · Auto' : ''} · ${formatMemoryGb(deviceTotalMemory)} RAM`}
            onPress={() => navigation.navigate('PlaybackPerformance')}
          />
          <MenuRow
            icon={CheckCircle2}
            label="Finished movies"
            value={`${finishedMovies.length} completed`}
            onPress={() => navigation.navigate('FinishedMovies')}
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
          <SwitchRow
            icon={Bug}
            label="Debug video player"
            hint="Show the stream-finder webpage, never time out, and play video directly in it instead of handing off to the built-in player, 3rd party players may have ads"
            value={scraperDebugEnabled}
            onToggle={setScraperDebugEnabled}
          />
        </VStack>
      </ScrollView>

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

const SwitchRow = ({
  icon,
  label,
  hint,
  value,
  onToggle,
}: {
  icon: typeof ServerIcon;
  label: string;
  hint?: string;
  value: boolean;
  onToggle: (next: boolean) => void;
}) => (
  <Focusable
    onPress={() => onToggle(!value)}
    className="rounded-lg"
    focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
  >
    <HStack className="items-center rounded-lg bg-card px-4 py-4">
      <Icon as={icon} className="text-foreground" />
      <VStack className="ml-3 flex-1">
        <Text className="text-foreground">{label}</Text>
        {hint ? (
          <Text size="xs" className="text-muted-foreground">
            {hint}
          </Text>
        ) : null}
      </VStack>
      <Box
        className={`h-7 w-12 justify-center rounded-full p-0.5 ${
          value ? 'bg-primary' : 'bg-background'
        }`}
      >
        <Box
          className={`h-6 w-6 rounded-full bg-foreground ${
            value ? 'ml-5' : 'ml-0'
          }`}
        />
      </Box>
    </HStack>
  </Focusable>
);
