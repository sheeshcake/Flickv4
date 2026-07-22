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
  VIDEO_ASPECT_OPTIONS,
  useVideoAspect,
} from '@/src/hooks/useVideoAspect';

export const VideoAspectSettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { aspect, setAspect } = useVideoAspect();

  return (
    <Box className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <HStack space="md" className="items-center px-4 py-3">
        <Pressable onPress={() => navigation.goBack()} focusable hitSlop={12}>
          <Icon as={ArrowLeft} size="xl" className="text-foreground" />
        </Pressable>
        <Heading size="xl" bold className="text-foreground">
          Video aspect
        </Heading>
      </HStack>

      <ScrollView className="flex-1 px-4">
        <VStack space="md" className="pb-10">
          <Text className="text-muted-foreground">
            How the video is scaled inside the player. You can also change this
            per-video from the player controls.
          </Text>

          <VStack space="sm">
            {VIDEO_ASPECT_OPTIONS.map((opt) => {
              const active = aspect === opt.value;
              return (
                <Focusable
                  key={opt.value}
                  onPress={() => setAspect(opt.value)}
                  className={`rounded-md px-4 py-4 ${active ? 'bg-primary/20' : 'bg-card'}`}
                  focusedClassName="scale-[1.02] border border-primary"
                >
                  <HStack className="items-center justify-between">
                    <VStack>
                      <Text
                        className={
                          active
                            ? 'font-semibold text-foreground'
                            : 'text-foreground'
                        }
                      >
                        {opt.label}
                      </Text>
                      <Text size="xs" className="text-muted-foreground">
                        {opt.hint}
                      </Text>
                    </VStack>
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
