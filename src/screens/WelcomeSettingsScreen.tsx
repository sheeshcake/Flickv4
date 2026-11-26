import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, Image as ImageIcon, VideoOff } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { ScrollView } from '@/components/ui/scroll-view';
import { Focusable } from '@/src/components/Focusable';
import {
  useWelcomeSettings,
  WELCOME_OPTIONS,
  type WelcomeMode,
} from '@/src/hooks/useWelcomeSettings';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

const OPTION_ICONS: Record<WelcomeMode, typeof ImageIcon> = {
  quick: ImageIcon,
  off: VideoOff,
};

export const WelcomeSettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { mode, setMode } = useWelcomeSettings();

  return (
    <Box className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <HStack space="md" className="items-center px-4 py-3">
        <Focusable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          className="rounded-full"
          focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
        >
          <Icon as={ArrowLeft} size="xl" className="text-foreground" />
        </Focusable>
        <Heading size="xl" bold className="text-foreground">
          Welcome image
        </Heading>
      </HStack>

      <ScrollView className="flex-1 px-4">
        <VStack space="md" className="pb-10">
          {WELCOME_OPTIONS.map((option) => {
            const active = mode === option.value;
            const OptionIcon = OPTION_ICONS[option.value];
            return (
              <Focusable
                key={option.value}
                onPress={() => setMode(option.value)}
                className={`rounded-lg px-4 py-4 ${
                  active ? 'bg-primary/20' : 'bg-card'
                }`}
                focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
              >
                <HStack space="md" className="items-center">
                  <Icon
                    as={OptionIcon}
                    className={active ? 'text-primary' : 'text-muted-foreground'}
                  />
                  <VStack className="flex-1">
                    <Text
                      className={
                        active
                          ? 'font-semibold text-foreground'
                          : 'text-foreground'
                      }
                    >
                      {option.label}
                    </Text>
                    <Text size="xs" className="text-muted-foreground">
                      {option.hint}
                    </Text>
                  </VStack>
                  {active ? (
                    <Icon as={Check} className="text-primary" />
                  ) : null}
                </HStack>
              </Focusable>
            );
          })}

          <Text size="xs" className="text-muted-foreground">
            The quick welcome lasts about one second. Skipping it opens the
            home screen immediately on the next launch.
          </Text>
        </VStack>
      </ScrollView>
    </Box>
  );
};
