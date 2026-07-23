import { useRef, useState } from 'react';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { TVSideNav, TVTab, type TVSideNavHandle } from '@/src/components/tv/TVSideNav';
import { HomeScreen } from '@/src/screens/HomeScreen';
import { SearchScreen } from '@/src/screens/SearchScreen';
import { SettingsScreen } from '@/src/screens/SettingsScreen';
import { DownloadsScreen } from '@/src/screens/DownloadsScreen';

/**
 * TV shell: a persistent left rail plus the active content area.
 * Detail/Player are pushed via the root native stack (see AppNavigator).
 */
export const TVNavigator = () => {
  const [activeTab, setActiveTab] = useState<TVTab>('Home');
  const sideNavRef = useRef<TVSideNavHandle>(null);

  return (
    <HStack className="h-full flex-1 bg-background">
      <TVSideNav ref={sideNavRef} activeTab={activeTab} onTabChange={setActiveTab} />
      <Box className="flex-1">
        {activeTab === 'Home' && <HomeScreen sidebarRef={sideNavRef} />}
        {activeTab === 'Search' && <SearchScreen />}
        {activeTab === 'Downloads' && <DownloadsScreen />}
        {activeTab === 'Settings' && <SettingsScreen />}
      </Box>
    </HStack>
  );
};
