/**
 * Mobile Bottom Tab Bar Component
 * Custom animated tab bar for mobile navigation
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
// Spacing not currently used but kept for future use
// import { spacing } from '../../utils/responsive';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TAB_BAR_HEIGHT = 56;
const BRAND_COLOR = '#E50914';

interface TabItem {
  key: string;
  label: string;
  icon: string;
  iconFocused?: string;
}

interface MobileBottomTabBarProps {
  tabs: TabItem[];
  activeTab: string;
  onTabPress: (key: string) => void;
}

export const MobileBottomTabBar: React.FC<MobileBottomTabBarProps> = ({
  tabs,
  activeTab,
  onTabPress,
}) => {
  const insets = useSafeAreaInsets();
  const tabWidth = SCREEN_WIDTH / tabs.length;

  const activeIndex = tabs.findIndex(tab => tab.key === activeTab);
  const indicatorPosition = useSharedValue(activeIndex * tabWidth + tabWidth / 2);

  React.useEffect(() => {
    indicatorPosition.value = withSpring(activeIndex * tabWidth + tabWidth / 2, {
      damping: 15,
      stiffness: 150,
    });
  }, [activeIndex, tabWidth, indicatorPosition]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorPosition.value - 16 }],
  }));

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={styles.tabsContainer}>
        <Animated.View style={[styles.indicator, indicatorStyle]} />
        {tabs.map((tab) => (
          <TabBarItem
            key={tab.key}
            tab={tab}
            isActive={activeTab === tab.key}
            onPress={() => onTabPress(tab.key)}
            width={tabWidth}
          />
        ))}
      </View>
    </View>
  );
};

interface TabBarItemProps {
  tab: TabItem;
  isActive: boolean;
  onPress: () => void;
  width: number;
}

const TabBarItem: React.FC<TabBarItemProps> = ({
  tab,
  isActive,
  onPress,
  width,
}) => {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withTiming(0.9, { duration: 100 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const iconName = isActive && tab.iconFocused ? tab.iconFocused : tab.icon;

  return (
    <TouchableOpacity
      style={[styles.tabItem, { width }]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
    >
      <Animated.View style={[styles.tabContent, animatedStyle]}>
        <Icon
          name={iconName}
          size={24}
          color={isActive ? BRAND_COLOR : '#666666'}
        />
        <Text
          style={[
            styles.tabLabel,
            isActive && styles.tabLabelActive,
          ]}
        >
          {tab.label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0A0A0A',
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
  },
  tabsContainer: {
    flexDirection: 'row',
    height: TAB_BAR_HEIGHT,
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 0,
    width: 32,
    height: 3,
    backgroundColor: BRAND_COLOR,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  tabItem: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    color: '#666666',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 4,
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
});

export default MobileBottomTabBar;
