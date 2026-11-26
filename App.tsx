import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { AppNavigator } from '@/src/navigation/AppNavigator';
import { SubtitleSettingsProvider } from '@/src/hooks/useSubtitleSettings';
import { ContinueWatchingProvider } from '@/src/hooks/useContinueWatching';
import { FinishedMoviesProvider } from '@/src/hooks/useFinishedMovies';
import { ServersProvider } from '@/src/hooks/useServers';
import { MyListProvider } from '@/src/hooks/useMyList';
import { CatalogRegionProvider } from '@/src/hooks/useCatalogRegion';
import { DnsSettingsProvider } from '@/src/hooks/useDnsSettings';
import { ThemeProvider, useTheme } from '@/src/hooks/useTheme';
import { HomeDataProvider } from '@/src/hooks/useHomeData';
import { VideoQualityProvider } from '@/src/hooks/useVideoQuality';
import { VideoAspectProvider } from '@/src/hooks/useVideoAspect';
import { PlayerDebugSettingsProvider } from '@/src/hooks/usePlayerDebugSettings';
import { PlaybackSettingsProvider } from '@/src/hooks/usePlaybackSettings';
import { PlayerPreferencesProvider } from '@/src/hooks/usePlayerPreferences';
import { DownloadsProvider } from '@/src/hooks/useDownloads';
import { DownloadResolverHost } from '@/src/components/DownloadResolverHost';
import { lockPortrait } from '@/src/utils/orientation';
import { bootstrapDownloadPermissions } from '@/src/utils/downloadPermissions';
import '@/global.css';

// Inner component so it can read the theme context provided above.
function AppInner() {
  const { mode, palette } = useTheme();
  const gluestackMode = mode === 'system' ? 'system' : mode;
  useEffect(() => {
    lockPortrait();
    void bootstrapDownloadPermissions();
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <GluestackUIProvider mode={gluestackMode} palette={palette}>
          <ServersProvider>
            <MyListProvider>
              <CatalogRegionProvider>
                <DnsSettingsProvider>
                  <HomeDataProvider>
                    <SubtitleSettingsProvider>
                      <PlayerPreferencesProvider>
                        <VideoQualityProvider>
                          <VideoAspectProvider>
                            <PlayerDebugSettingsProvider>
                              <PlaybackSettingsProvider>
                                <FinishedMoviesProvider>
                                  <ContinueWatchingProvider>
                                    <DownloadsProvider>
                                      <StatusBar style="light" />
                                      <AppNavigator />
                                      <DownloadResolverHost />
                                    </DownloadsProvider>
                                  </ContinueWatchingProvider>
                                </FinishedMoviesProvider>
                              </PlaybackSettingsProvider>
                            </PlayerDebugSettingsProvider>
                          </VideoAspectProvider>
                        </VideoQualityProvider>
                      </PlayerPreferencesProvider>
                    </SubtitleSettingsProvider>
                  </HomeDataProvider>
                </DnsSettingsProvider>
              </CatalogRegionProvider>
            </MyListProvider>
          </ServersProvider>
        </GluestackUIProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
