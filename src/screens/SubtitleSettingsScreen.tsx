import type { ReactNode } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Button, ButtonText } from '@/components/ui/button';
import { ScrollView } from '@/components/ui/scroll-view';
import { Focusable } from '@/src/components/Focusable';
import {
  useSubtitleSettings,
  type SubtitleRenderMode,
} from '@/src/hooks/useSubtitleSettings';
import { SUBTITLE_LANGUAGES } from '@/src/constants/languages';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

const FONT_STEPS = [14, 16, 18, 20, 24, 28, 32];
const TEXT_COLORS = ['#FFFFFF', '#FFE66D', '#00E5FF', '#FF6B6B', '#B8F2E6'];
const BG_COLORS = ['#000000', '#1A1A1A', '#003366', '#4A0000', '#1B4332'];

const RENDER_MODE_OPTIONS: {
  value: SubtitleRenderMode;
  label: string;
  hint: string;
}[] = [
  {
    value: 'component',
    label: 'App captions',
    hint: 'Fetched separately and styled below. Works the same on every server.',
  },
  {
    value: 'native',
    label: 'Native (device)',
    hint: "Uses the video's own built-in subtitle tracks, if the stream provides any — most scraped streams don't.",
  },
];

export const SubtitleSettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { settings, update, reset } = useSubtitleSettings();

  const bumpFont = (dir: -1 | 1) => {
    const idx = FONT_STEPS.indexOf(settings.fontSize);
    const next =
      FONT_STEPS[
        Math.min(FONT_STEPS.length - 1, Math.max(0, (idx < 0 ? 2 : idx) + dir))
      ];
    update({ fontSize: next });
  };

  const bumpOpacity = (dir: -1 | 1) => {
    const next = Math.min(
      1,
      Math.max(0, Math.round((settings.backgroundOpacity + dir * 0.1) * 10) / 10),
    );
    update({ backgroundOpacity: next });
  };

  const bgAlpha = Math.round(settings.backgroundOpacity * 255)
    .toString(16)
    .padStart(2, '0');

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
          Subtitles
        </Heading>
      </HStack>

      <ScrollView className="flex-1 px-4">
        {/* Live preview, only meaningful for our own overlay */}
        {settings.renderMode === 'component' && (
          <Box className="mb-6 items-center rounded-lg bg-card py-8">
            <Box
              className="rounded-md px-3 py-1.5"
              style={{
                backgroundColor: `${settings.backgroundColor}${bgAlpha}`,
              }}
            >
              <Text
                style={{
                  color: settings.textColor,
                  fontSize: settings.fontSize,
                  fontWeight: settings.bold ? '700' : '400',
                }}
              >
                Sample subtitle preview
              </Text>
            </Box>
          </Box>
        )}

        <VStack space="xl" className="pb-10">
          <SettingRow label="Subtitle rendering">
            <VStack space="sm">
              <Box className="flex-row flex-wrap" style={{ gap: 8 }}>
                {RENDER_MODE_OPTIONS.map((opt) => {
                  const active = settings.renderMode === opt.value;
                  return (
                    <Button
                      key={opt.value}
                      size="sm"
                      variant={active ? 'default' : 'outline'}
                      onPress={() => update({ renderMode: opt.value })}
                    >
                      <ButtonText
                        className={
                          active
                            ? 'text-primary-foreground'
                            : 'text-foreground'
                        }
                      >
                        {opt.label}
                      </ButtonText>
                    </Button>
                  );
                })}
              </Box>
              <Text size="xs" className="text-muted-foreground">
                {
                  RENDER_MODE_OPTIONS.find(
                    (o) => o.value === settings.renderMode,
                  )?.hint
                }
              </Text>
            </VStack>
          </SettingRow>

          <SettingRow label="Default language">
            <Box className="flex-row flex-wrap" style={{ gap: 8 }}>
              {SUBTITLE_LANGUAGES.map((lang) => {
                const active = settings.defaultLanguage === lang.code;
                return (
                  <Button
                    key={lang.code || 'none'}
                    size="sm"
                    variant={active ? 'default' : 'outline'}
                    onPress={() => update({ defaultLanguage: lang.code })}
                  >
                    <ButtonText
                      className={
                        active ? 'text-primary-foreground' : 'text-foreground'
                      }
                    >
                      {lang.label}
                    </ButtonText>
                  </Button>
                );
              })}
            </Box>
          </SettingRow>

          {settings.renderMode === 'component' ? (
            <>
              <SettingRow label="Font size">
                <HStack space="md" className="items-center">
                  <Button
                    size="sm"
                    variant="outline"
                    onPress={() => bumpFont(-1)}
                  >
                    <ButtonText>A-</ButtonText>
                  </Button>
                  <Text className="min-w-10 text-center text-foreground">
                    {settings.fontSize}
                  </Text>
                  <Button
                    size="sm"
                    variant="outline"
                    onPress={() => bumpFont(1)}
                  >
                    <ButtonText>A+</ButtonText>
                  </Button>
                </HStack>
              </SettingRow>

              <SettingRow label="Text color">
                <HStack space="sm">
                  {TEXT_COLORS.map((c) => (
                    <ColorSwatch
                      key={c}
                      color={c}
                      selected={settings.textColor === c}
                      onPress={() => update({ textColor: c })}
                    />
                  ))}
                </HStack>
              </SettingRow>

              <SettingRow label="Background">
                <HStack space="sm">
                  {BG_COLORS.map((c) => (
                    <ColorSwatch
                      key={c}
                      color={c}
                      selected={settings.backgroundColor === c}
                      onPress={() => update({ backgroundColor: c })}
                    />
                  ))}
                </HStack>
              </SettingRow>

              <SettingRow label="Background opacity">
                <HStack space="md" className="items-center">
                  <Button
                    size="sm"
                    variant="outline"
                    onPress={() => bumpOpacity(-1)}
                  >
                    <ButtonText>-</ButtonText>
                  </Button>
                  <Text className="min-w-12 text-center text-foreground">
                    {Math.round(settings.backgroundOpacity * 100)}%
                  </Text>
                  <Button
                    size="sm"
                    variant="outline"
                    onPress={() => bumpOpacity(1)}
                  >
                    <ButtonText>+</ButtonText>
                  </Button>
                </HStack>
              </SettingRow>

              <SettingRow label="Bold">
                <Button
                  size="sm"
                  variant={settings.bold ? 'default' : 'outline'}
                  className={settings.bold ? 'bg-primary' : undefined}
                  onPress={() => update({ bold: !settings.bold })}
                >
                  <ButtonText
                    className={
                      settings.bold
                        ? 'text-primary-foreground'
                        : 'text-foreground'
                    }
                  >
                    {settings.bold ? 'On' : 'Off'}
                  </ButtonText>
                </Button>
              </SettingRow>
            </>
          ) : (
            <Text size="sm" className="text-muted-foreground">
              Native captions are styled by your device, not by Flick — these
              appearance options only apply to App captions.
            </Text>
          )}

          <Button variant="outline" onPress={reset} className="mt-4">
            <ButtonText>Reset to defaults</ButtonText>
          </Button>
        </VStack>
      </ScrollView>
    </Box>
  );
};

const SettingRow = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <VStack space="sm">
    <Text className="text-muted-foreground">{label}</Text>
    {children}
  </VStack>
);

const ColorSwatch = ({
  color,
  selected,
  onPress,
}: {
  color: string;
  selected: boolean;
  onPress: () => void;
}) => (
  <Focusable
    onPress={onPress}
    className="rounded-full"
    focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
  >
    <Box
      className={`h-9 w-9 rounded-full border-2 ${selected ? 'border-primary' : 'border-border'}`}
      style={{ backgroundColor: color }}
    />
  </Focusable>
);
