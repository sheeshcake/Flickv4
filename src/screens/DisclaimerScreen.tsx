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

export const DisclaimerScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  return (
    <Box className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <HStack space="md" className="items-center px-4 py-3">
        <Pressable onPress={() => navigation.goBack()} focusable hitSlop={12}>
          <Icon as={ArrowLeft} size="xl" className="text-foreground" />
        </Pressable>
        <Heading size="xl" bold className="text-foreground">
          Disclaimer
        </Heading>
      </HStack>

      <ScrollView className="flex-1 px-4">
        <VStack space="lg" className="pb-10">
          <Section title="No hosted content">
            <Text className="text-muted-foreground">
              Flick does not host, upload, or distribute any of the video
              content shown in the app. The app is a client that indexes public
              metadata and points at external streaming servers configured by
              the user under Settings → Playback server.
            </Text>
          </Section>

          <Section title="Third-party servers">
            <Text className="text-muted-foreground">
              Any streams played through Flick come from third-party servers
              that are not owned, operated, or endorsed by us. The availability,
              legality, and quality of those streams is the sole responsibility
              of the operators of those servers.
            </Text>
          </Section>

          <Section title="Copyright">
            <Text className="text-muted-foreground">
              If you are a rights holder and believe your content is being
              streamed unlawfully through a third-party server, please contact
              that server&apos;s operator directly. Flick does not have the
              ability to remove content from external servers.
            </Text>
          </Section>

          <Section title="Personal use">
            <Text className="text-muted-foreground">
              This app is intended for personal, non-commercial use only. You
              are responsible for ensuring that your use of the app and the
              content you stream complies with the laws of your jurisdiction.
            </Text>
          </Section>

          <Section title="No warranty">
            <Text className="text-muted-foreground">
              The app is provided &quot;as is&quot;, without warranty of any
              kind. The authors are not liable for any damages arising from the
              use of this app.
            </Text>
          </Section>
        </VStack>
      </ScrollView>
    </Box>
  );
};

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <VStack space="sm">
    <Heading size="sm" className="text-foreground">
      {title}
    </Heading>
    {children}
  </VStack>
);
