import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Palette, Sun, Moon, Monitor } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ScrollView } from '@/components/ui/scroll-view';
import { Focusable } from '@/src/components/Focusable';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';
import { useTheme, type ThemeMode, type ThemePalette } from '@/src/hooks/useTheme';

const MODES: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
];

const PALETTES: { value: ThemePalette; label: string; description: string }[] = [
  { value: 'classic', label: 'Classic', description: 'Netflix-inspired red on black.' },
  { value: 'coffee', label: 'Coffee', description: 'Espresso & latte tones for CoFFe House.' },
];

export const ThemeSettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { mode, setMode, palette, setPalette } = useTheme();

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
          Theme
        </Heading>
      </HStack>

      <ScrollView className="flex-1 px-4">
        <VStack space="xl" className="pb-10">
          <VStack space="sm">
            <Text className="text-muted-foreground">Mode</Text>
            <HStack space="sm">
              {MODES.map((m) => {
                const active = mode === m.value;
                return (
                  <Focusable
                    key={m.value}
                    onPress={() => setMode(m.value)}
                    className={`flex-1 rounded-md px-4 py-4 ${active ? 'bg-primary/20' : 'bg-card'}`}
                    focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
                  >
                    <VStack className="items-center">
                      <Icon as={m.icon} className="text-foreground" />
                      <Text
                        size="xs"
                        className={active ? 'font-semibold text-foreground' : 'text-muted-foreground'}
                      >
                        {m.label}
                      </Text>
                    </VStack>
                  </Focusable>
                );
              })}
            </HStack>
          </VStack>

          <VStack space="sm">
            <Text className="text-muted-foreground">Palette</Text>
            {PALETTES.map((p) => {
              const active = palette === p.value;
              return (
                <Focusable
                  key={p.value}
                  onPress={() => setPalette(p.value)}
                  className={`rounded-md px-4 py-4 ${active ? 'bg-primary/20' : 'bg-card'}`}
                  focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
                >
                  <HStack className="items-center justify-between">
                    <VStack className="flex-1">
                      <Text className={active ? 'font-semibold text-foreground' : 'text-foreground'}>
                        {p.label}
                      </Text>
                      <Text size="xs" className="text-muted-foreground">
                        {p.description}
                      </Text>
                    </VStack>
                    <Icon as={Palette} className="text-muted-foreground" />
                  </HStack>
                </Focusable>
              );
            })}
          </VStack>

          <Text size="xs" className="text-muted-foreground">
            Coffee palette is a warm espresso/latte accent over the dark base.
            Light mode inverts the surfaces for daytime use.
          </Text>
        </VStack>
      </ScrollView>
    </Box>
  );
};