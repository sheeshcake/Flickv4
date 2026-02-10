/**
 * TV Sidebar Component
 * Left-side navigation bar optimized for TV focus navigation
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const TV_FOCUS_COLOR = '#E50914';
const SIDEBAR_WIDTH_COLLAPSED = 56;
const SIDEBAR_WIDTH_EXPANDED = 220;

interface NavItem {
  key: string;
  label: string;
  icon: string;
}

interface TVSidebarProps {
  items: NavItem[];
  activeKey: string;
  onItemPress: (key: string) => void;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

export const TVSidebar: React.FC<TVSidebarProps> = ({
  items,
  activeKey,
  onItemPress,
  expanded = false,
  onExpandedChange,
}) => {
  const sidebarWidth = useSharedValue(expanded ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    width: withTiming(sidebarWidth.value, { duration: 200 }),
  }));

  const handleExpand = useCallback((shouldExpand: boolean) => {
    sidebarWidth.value = shouldExpand ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED;
    onExpandedChange?.(shouldExpand);
  }, [sidebarWidth, onExpandedChange]);

  return (
    <Animated.View style={[styles.container, animatedContainerStyle]}>
      <View style={styles.logoContainer}>
        {!expanded ? <Image source={require('../../assets/logo/logo-letter.png')} style={{width: 32, height: 32}} resizeMode="contain" /> : <Image source={require('../../assets/logo/logo.png')} style={{width: 80, height: 32}} resizeMode="contain" />}
      </View>

      <View style={styles.navItems}>
        {items.map((item, index) => (
          <TVSidebarItem
            key={item.key}
            item={item}
            isActive={activeKey === item.key}
            expanded={expanded}
            onPress={() => onItemPress(item.key)}
            onFocus={() => handleExpand(true)}
            onBlur={() => handleExpand(false)}
            hasTVPreferredFocus={index === 0}
          />
        ))}
      </View>
    </Animated.View>
  );
};

interface TVSidebarItemProps {
  item: NavItem;
  isActive: boolean;
  expanded: boolean;
  onPress: () => void;
  onFocus: () => void;
  onBlur: () => void;
  hasTVPreferredFocus?: boolean;
}

const TVSidebarItem: React.FC<TVSidebarItemProps> = ({
  item,
  isActive,
  expanded,
  onPress,
  onFocus,
  onBlur,
  hasTVPreferredFocus = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const scale = useSharedValue(1);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    scale.value = withSpring(1.05, { damping: 15, stiffness: 150 });
    onFocus();
  }, [scale, onFocus]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
    onBlur();
  }, [scale, onBlur]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      style={[
        styles.navItem,
        !expanded && styles.navItemCollapsed,
        isActive && styles.navItemActive,
        isFocused && styles.navItemFocused,
        animatedStyle,
      ]}
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      // @ts-ignore - TV-specific prop
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Icon
        name={item.icon}
        size={22}
        color={isFocused || isActive ? TV_FOCUS_COLOR : '#FFFFFF'}
      />
      {expanded && (
        <Text
          style={[
            styles.navLabel,
            (isFocused || isActive) && styles.navLabelActive,
          ]}
        >
          {item.label}
        </Text>
      )}
      {isActive && <View style={styles.activeIndicator} />}
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0D0D0D',
    height: '100%',
    paddingVertical: 12,
    borderRightWidth: 1,
    borderRightColor: '#1A1A1A',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 12,
  },
  logo: {
    color: TV_FOCUS_COLOR,
    fontSize: 36,
    fontWeight: 'bold',
  },
  logoFull: {
    color: TV_FOCUS_COLOR,
    fontSize: 36,
    fontWeight: 'bold',
    letterSpacing: 4,
  },
  navItems: {
    flex: 1,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 4,
    marginVertical: 2,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  navItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  navItemActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.1)',
  },
  navItemFocused: {
    borderColor: TV_FOCUS_COLOR,
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
  },
  navLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 12,
  },
  navLabelActive: {
    color: TV_FOCUS_COLOR,
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    top: '25%',
    bottom: '25%',
    width: 4,
    backgroundColor: TV_FOCUS_COLOR,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
});

export default TVSidebar;
