import { useCallback } from 'react';
import { Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ExternalLink } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ScrollView } from '@/components/ui/scroll-view';
import { Focusable } from '@/src/components/Focusable';
import { getAppVersion } from '@/src/utils/appVersion';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

interface Credit {
  name: string;
  description: string;
  url?: string;
}

const CREDITS: Credit[] = [
  {
    name: 'The Movie Database (TMDB)',
    description:
      'All movie & TV metadata, posters, and backdrops are provided by TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.',
    url: 'https://www.themoviedb.org',
  },
  {
    name: 'Developer',
    description: '3vyz — Maintainer & Developer',
    url: 'https://www.instagram.com/3vyz/',
  },
  {
    name: 'Contact me',
    description: '+97366607701 — WhatsApp',
    url: 'https://wa.me/97366607701',
  },
];

export const CreditsScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const open = useCallback(async (url?: string) => {
    if (!url) return;
    const can = await Linking.canOpenURL(url);
    if (can) await Linking.openURL(url);
  }, []);

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
          Credits
        </Heading>
      </HStack>

      <ScrollView className="flex-1 px-4">
        <VStack space="lg" className="pb-10">
          <Text size="sm" className="text-muted-foreground">
            CoFFe House v{getAppVersion()} is built on the work of
            these projects and services.
          </Text>

          <VStack space="md">
            {CREDITS.map((credit) => (
              <Focusable
                key={credit.name}
                onPress={() => open(credit.url)}
                className="rounded-lg"
                focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
              >
                <Box className="rounded-lg bg-card p-4">
                  <HStack className="items-center justify-between">
                    <Heading size="sm" className="text-foreground">
                      {credit.name}
                    </Heading>
                    {credit.url && (
                      <Icon
                        as={ExternalLink}
                        size="sm"
                        className="text-muted-foreground"
                      />
                    )}
                  </HStack>
                  <Text size="sm" className="mt-1 text-muted-foreground">
                    {credit.description}
                  </Text>
                </Box>
              </Focusable>
            ))}
          </VStack>
        </VStack>
      </ScrollView>
    </Box>
  );
};
