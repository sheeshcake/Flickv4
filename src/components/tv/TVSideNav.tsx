import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const LOGO_LETTER = require('../../assets/logo/logo-letter.png');
const LOGO_FULL = require('../../assets/logo/logo.png');

const TV_FOCUS_COLOR = '#E50914';
const SIDEBAR_COLLAPSED_WIDTH = 72;
const SIDEBAR_EXPANDED_WIDTH = 208;

export type TVTab = 'Home' | 'Search' | 'Settings';

interface NavItemDef {
  id: TVTab;
  label: string;
  icon: string;
  iconFocused: string;
}

const NAV_ITEMS: NavItemDef[] = [
  { id: 'Home',     label: 'Home',     icon: 'home-outline', iconFocused: 'home' },
  { id: 'Search',   label: 'Search',   icon: 'magnify',      iconFocused: 'magnify' },
  { id: 'Settings', label: 'Settings', icon: 'cog-outline',  iconFocused: 'cog' },
];

// ── Per-item button (own hooks for spring scale) ───────────────────────────
interface NavItemButtonProps {
  item: NavItemDef;
  isActive: boolean;
  expanded: boolean;
  hasTVPreferredFocus: boolean;
  onPress: () => void;
  onFocus: () => void;
  onBlur: () => void;
}

const NavItemButton: React.FC<NavItemButtonProps> = ({
  item,
  isActive,
  expanded,
  hasTVPreferredFocus,
  onPress,
  onFocus,
  onBlur,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const scale = useSharedValue(1);

  // Snapshot hasTVPreferredFocus at mount only – prevents the sidebar
  // re-render (caused by setExpanded on every focus/blur) from re-asserting
  // focus and yanking the cursor back to this item.
  const mountPreferFocus = useRef(hasTVPreferredFocus).current;

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    scale.value = withSpring(1.06, { damping: 15, stiffness: 150 });
    onFocus();
  }, [onFocus, scale]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
    onBlur();
  }, [onBlur, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const iconColor = isFocused ? TV_FOCUS_COLOR : isActive ? TV_FOCUS_COLOR : '#888888';

  return (
    <AnimatedPressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      // @ts-ignore – TV-specific prop
      hasTVPreferredFocus={mountPreferFocus}
      accessible
      accessibilityLabel={`${item.label} tab`}
      accessibilityRole="tab"
      style={[
        styles.navItem,
        isActive && styles.navItemActive,
        isFocused && styles.navItemFocused,
        animatedStyle,
      ]}
    >
      <Icon
        name={isFocused || isActive ? item.iconFocused : item.icon}
        size={28}
        color={iconColor}
      />
      {expanded && (
        <Text
          style={[
            styles.navLabel,
            isActive && styles.navLabelActive,
            isFocused && styles.navLabelFocused,
          ]}
        >
          {item.label}
        </Text>
      )}
      {isActive && !isFocused && <View style={styles.activeIndicator} />}
    </AnimatedPressable>
  );
};

// ── Main sidebar ───────────────────────────────────────────────────────────
interface TVSideNavProps {
  activeTab: TVTab;
  onTabPress: (tab: TVTab) => void;
}

export const TVSideNav: React.FC<TVSideNavProps> = ({ activeTab, onTabPress }) => {
  const [expanded, setExpanded] = useState(false);

  const handleFocus = useCallback(() => setExpanded(true), []);
  const handleBlur = useCallback(() => setExpanded(false), []);

  return (
    <View style={[styles.sidebar, expanded && styles.sidebarExpanded]}>
      {/* Logo */}
      <View style={styles.brand}>
        {expanded ? (
          <Image source={LOGO_FULL} style={styles.logoFull} resizeMode="contain" />
        ) : (
          <Image source={LOGO_LETTER} style={styles.logoLetter} resizeMode="contain" />
        )}
      </View>

      {/* Nav items */}
      <View style={styles.navItems}>
        {NAV_ITEMS.map(item => (
          <NavItemButton
            key={item.id}
            item={item}
            isActive={activeTab === item.id}
            expanded={expanded}
            // ↓ KEY FIX: always points at the current active tab so D-pad left
            //   can always re-enter the sidebar regardless of which tab is open
            hasTVPreferredFocus={item.id === activeTab}
            onPress={() => onTabPress(item.id)}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_COLLAPSED_WIDTH,
    backgroundColor: '#0D0D0D',
    borderRightWidth: 1,
    borderRightColor: '#1E1E1E',
    paddingVertical: 24,
    alignItems: 'center',
    zIndex: 100,
  },
  sidebarExpanded: {
    width: SIDEBAR_EXPANDED_WIDTH,
    alignItems: 'flex-start',
  },
  brand: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginBottom: 32,
    width: '100%',
  },
  logoLetter: {
    width: 36,
    height: 36,
  },
  logoFull: {
    width: 120,
    height: 36,
  },
  navItems: {
    width: '100%',
    flex: 1,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginVertical: 4,
    borderRadius: 8,
    borderWidth: 2.5,
    borderColor: 'transparent',
    position: 'relative',
  },
  navItemActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.1)',
  },
  navItemFocused: {
    borderColor: TV_FOCUS_COLOR,
    backgroundColor: 'rgba(229, 9, 20, 0.18)',
    shadowColor: TV_FOCUS_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 10,
    elevation: 10,
  },
  navLabel: {
    fontSize: 16,
    color: '#888888',
    marginLeft: 16,
    fontWeight: '500',
  },
  navLabelActive: {
    color: TV_FOCUS_COLOR,
    fontWeight: '700',
  },
  navLabelFocused: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    top: '20%',
    bottom: '20%',
    width: 3,
    backgroundColor: TV_FOCUS_COLOR,
    borderRadius: 2,
  },
});

export default TVSideNav;

