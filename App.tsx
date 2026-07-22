import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { AppNavigator } from '@/src/navigation/AppNavigator';
import { SubtitleSettingsProvider } from '@/src/hooks/useSubtitleSettings';
import { ContinueWatchingProvider } from '@/src/hooks/useContinueWatching';
import { ServersProvider } from '@/src/hooks/useServers';
import { MyListProvider } from '@/src/hooks/useMyList';
import { VideoQualityProvider } from '@/src/hooks/useVideoQuality';
import { VideoAspectProvider } from '@/src/hooks/useVideoAspect';
import { DownloadsProvider } from '@/src/hooks/useDownloads';
import { DownloadResolverHost } from '@/src/components/DownloadResolverHost';
import { UpdateChecker } from '@/src/components/UpdateChecker';
import { lockPortrait } from '@/src/utils/orientation';
import { bootstrapDownloadPermissions } from '@/src/utils/downloadPermissions';
import '@/global.css';

export default function App() {
  useEffect(() => {
    lockPortrait();
    // Ask for notification permission once, on the very first launch, so
    // downloads can surface progress notifications without silently failing.
    // Subsequent launches are a no-op; the actual Download button re-asks
    // if permission was denied.
    void bootstrapDownloadPermissions();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <GluestackUIProvider mode="dark">
          <ServersProvider>
            <MyListProvider>
              <SubtitleSettingsProvider>
                <VideoQualityProvider>
                  <VideoAspectProvider>
                    <ContinueWatchingProvider>
                      <DownloadsProvider>
                        <StatusBar style="light" />
                        <AppNavigator />
                        <DownloadResolverHost />
                        <UpdateChecker />
                      </DownloadsProvider>
                    </ContinueWatchingProvider>
                  </VideoAspectProvider>
                </VideoQualityProvider>
              </SubtitleSettingsProvider>
            </MyListProvider>
          </ServersProvider>
        </GluestackUIProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
