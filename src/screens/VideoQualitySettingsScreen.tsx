import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { ScrollView } from '@/components/ui/scroll-view';
import { Focusable } from '@/src/components/Focusable';
import {
  QUALITY_PREFERENCES,
  useVideoQuality,
} from '@/src/hooks/useVideoQuality';

export const VideoQualitySettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { preference, setPreference } = useVideoQuality();

  return (
    <Box className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <HStack space="md" className="items-center px-4 py-3">
        <Pressable onPress={() => navigation.goBack()} focusable hitSlop={12}>
          <Icon as={ArrowLeft} size="xl" className="text-foreground" />
        </Pressable>
        <Heading size="xl" bold className="text-foreground">
          Video quality
        </Heading>
      </HStack>

      <ScrollView className="flex-1 px-4">
        <VStack space="md" className="pb-10">
          <Text className="text-muted-foreground">
            Preferred quality for new streams. Auto lets the player adapt to
            your connection. Fixed tiers map to the closest available variant;
            they only affect HLS streams that expose multiple resolutions.
          </Text>

          <VStack space="sm">
            {QUALITY_PREFERENCES.map((option) => {
              const active = preference === option.value;
              return (
                <Focusable
                  key={option.value}
                  onPress={() => setPreference(option.value)}
                  className={`rounded-md px-4 py-4 ${active ? 'bg-primary/20' : 'bg-card'}`}
                  focusedClassName="scale-[1.02] border border-primary"
                >
                  <HStack className="items-center justify-between">
                    <Text
                      className={
                        active
                          ? 'font-semibold text-foreground'
                          : 'text-foreground'
                      }
                    >
                      {option.label}
                    </Text>
                    {active && (
                      <Text size="xs" className="text-primary">
                        Active
                      </Text>
                    )}
                  </HStack>
                </Focusable>
              );
            })}
          </VStack>
        </VStack>
      </ScrollView>
    </Box>
  );
};
