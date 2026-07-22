import {
  Download as DownloadIcon,
  Home as HomeIcon,
  Search as SearchIcon,
  Settings as SettingsIcon,
} from 'lucide-react-native';
import { VStack } from '@/components/ui/vstack';
import { Image } from '@/components/ui/image';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { Focusable } from '@/src/components/Focusable';

export type TVTab = 'Home' | 'Search' | 'Downloads' | 'Settings';

interface TVSideNavProps {
  activeTab: TVTab;
  onTabChange: (tab: TVTab) => void;
}

const TABS: { key: TVTab; label: string; icon: typeof HomeIcon }[] = [
  { key: 'Home', label: 'Home', icon: HomeIcon },
  { key: 'Search', label: 'Search', icon: SearchIcon },
  { key: 'Downloads', label: 'Downloads', icon: DownloadIcon },
  { key: 'Settings', label: 'Settings', icon: SettingsIcon },
];

export const TVSideNav = ({ activeTab, onTabChange }: TVSideNavProps) => {
  return (
    <VStack
      space="xl"
      className="h-full w-52 border-r border-border bg-card px-6 py-10"
    >
      <Image
        source={require('@/assets/images/logo-full.png')}
        alt="Flick"
        resizeMode="contain"
        className="mb-8 h-16 w-20"
      />
      {TABS.map(({ key, label, icon }, index) => {
        const active = key === activeTab;
        return (
          <Focusable
            key={key}
            onPress={() => onTabChange(key)}
            hasTVPreferredFocus={index === 0 && active}
            className={`rounded-md px-3 py-3 ${active ? 'bg-primary/20' : ''}`}
            focusedClassName="scale-[1.05] bg-primary"
          >
            {(focused) => (
              <HStack space="md" className="items-center">
                <Icon
                  as={icon}
                  className={
                    focused || active
                      ? 'text-primary-foreground'
                      : 'text-muted-foreground'
                  }
                />
                <Text
                  className={
                    focused || active
                      ? 'font-semibold text-primary-foreground'
                      : 'text-muted-foreground'
                  }
                >
                  {label}
                </Text>
              </HStack>
            )}
          </Focusable>
        );
      })}
    </VStack>
  );
};
