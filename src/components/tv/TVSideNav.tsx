import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import {
  Download as DownloadIcon,
  Home as HomeIcon,
  Search as SearchIcon,
  Settings as SettingsIcon,
} from 'lucide-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { VStack } from '@/components/ui/vstack';
import { Image } from '@/components/ui/image';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { Focusable } from '@/src/components/Focusable';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

export type TVTab = 'Home' | 'Search' | 'Downloads' | 'Settings';

interface TVSideNavProps {
  activeTab: TVTab;
  onTabChange: (tab: TVTab) => void;
}

/** Imperative handle so sibling content (e.g. the TV hero) can hand D-pad
 * focus back to the currently-active sidebar tab. */
export interface TVSideNavHandle {
  focusActiveTab: () => void;
}

const TABS: { key: TVTab; label: string; icon: typeof HomeIcon }[] = [
  { key: 'Home', label: 'Home', icon: HomeIcon },
  { key: 'Search', label: 'Search', icon: SearchIcon },
  { key: 'Downloads', label: 'Downloads', icon: DownloadIcon },
  { key: 'Settings', label: 'Settings', icon: SettingsIcon },
];

const COLLAPSED_WIDTH = 84;
const EXPANDED_WIDTH = 208;

const AnimatedVStack = Animated.createAnimatedComponent(VStack);

/**
 * TV shell rail: sits collapsed as an icon-only strip so the content pane
 * stays as wide as possible, then animates open to show labels the moment
 * D-pad focus lands on one of its tabs, and collapses again once focus
 * moves back into the content area.
 */
export const TVSideNav = forwardRef<TVSideNavHandle, TVSideNavProps>(
  function TVSideNav({ activeTab, onTabChange }, ref) {
    const [collapsed, setCollapsed] = useState(true);
    const width = useSharedValue(COLLAPSED_WIDTH);
    const activeTabRef = useRef<React.ComponentRef<typeof Focusable>>(null);

    useImperativeHandle(ref, () => ({
      // The underlying host view gains a native `.focus()` on TV platforms
      // (see `NativeMethods`); the gluestack Pressable wrapper's ref typing
      // doesn't surface it, so we reach for it via a narrow cast.
      focusActiveTab: () =>
        (activeTabRef.current as unknown as { focus?: () => void } | null)
          ?.focus?.(),
    }));

    // Only one D-pad focus target exists at a time, so "last event wins" is
    // enough — moving focus between two tabs fires blur(prev)+focus(next)
    // synchronously in the same tick, so React batches them to a single
    // "still expanded" render with no visible collapse/expand flicker.
    const handleFocusChange = (focused: boolean) => {
      setCollapsed(!focused);
      width.value = withTiming(focused ? EXPANDED_WIDTH : COLLAPSED_WIDTH, {
        duration: 220,
      });
    };

    const animatedStyle = useAnimatedStyle(() => ({ width: width.value }));

    return (
      <AnimatedVStack
        space="xl"
        className={`h-full border-r border-border bg-card py-10 ${
          collapsed ? 'items-center px-3' : 'px-6'
        }`}
        style={animatedStyle}
      >
        <Image
          source={require('@/assets/images/logo-full.png')}
          alt="Flick"
          resizeMode="contain"
          className={collapsed ? 'mb-8 h-10 w-10' : 'mb-8 h-16 w-20'}
        />
        {TABS.map(({ key, label, icon }, index) => {
          const active = key === activeTab;
          return (
            <Focusable
              key={key}
              ref={active ? activeTabRef : undefined}
              onPress={() => onTabChange(key)}
              hasTVPreferredFocus={index === 0 && active}
              onFocusChange={handleFocusChange}
              className={`rounded-md px-3 py-3 ${active ? 'bg-primary/20' : ''}`}
              focusedClassName={`bg-primary ${TV_FOCUS_BORDER_CLASSNAME}`}
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
                  {!collapsed ? (
                    <Text
                      className={
                        focused || active
                          ? 'font-semibold text-primary-foreground'
                          : 'text-muted-foreground'
                      }
                    >
                      {label}
                    </Text>
                  ) : null}
                </HStack>
              )}
            </Focusable>
          );
        })}
      </AnimatedVStack>
    );
  },
);
