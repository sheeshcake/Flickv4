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
import { Pressable } from '@/components/ui/pressable';
import { ScrollView } from '@/components/ui/scroll-view';
import { updateService } from '@/src/services/UpdateService';

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
    name: 'Wyzie Subs',
    description:
      'Subtitles are sourced from the Wyzie Subs public API. Track availability and language coverage vary per title.',
    url: 'https://sub.wyzie.ru',
  },
  {
    name: 'Expo',
    description:
      'Built with Expo SDK 57 on top of React Native. expo-video powers playback, expo-navigation-bar keeps the player immersive, expo-keep-awake holds the wake lock during playback.',
    url: 'https://expo.dev',
  },
  {
    name: 'gluestack-ui v5',
    description:
      'UI primitives, semantic tokens, and design system baseline. Styling is driven by NativeWind v5 / Tailwind CSS v4.',
    url: 'https://gluestack.io/ui/docs',
  },
  {
    name: 'lucide-react-native',
    description: 'Icon set used throughout the app.',
    url: 'https://lucide.dev',
  },
  {
    name: 'Developer',
    description:
      'Sheeshcake (Wendale Dy) - Maintainer & Developer',
    url: 'https://github.com/sheeshcake/Flickv4',
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
        <Pressable onPress={() => navigation.goBack()} focusable hitSlop={12}>
          <Icon as={ArrowLeft} size="xl" className="text-foreground" />
        </Pressable>
        <Heading size="xl" bold className="text-foreground">
          Credits
        </Heading>
      </HStack>

      <ScrollView className="flex-1 px-4">
        <VStack space="lg" className="pb-10">
          <Text size="sm" className="text-muted-foreground">
            Flick v{updateService.getCurrentVersion()} is built on the work of
            these projects and services.
          </Text>

          <VStack space="md">
            {CREDITS.map((credit) => (
              <Pressable
                key={credit.name}
                onPress={() => open(credit.url)}
                focusable
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
              </Pressable>
            ))}
          </VStack>
        </VStack>
      </ScrollView>
    </Box>
  );
};
