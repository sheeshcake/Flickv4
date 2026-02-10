import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {Text, StyleSheet} from 'react-native';
import type {MainTabParamList} from '../types/navigation';
import {HomeScreen, SearchScreen, DownloadsScreen, SettingsScreen} from '../screens';
import {spacing, typography, getSafeAreaPadding} from '../utils/responsive';
import {
  accessibilityLabels,
  accessibilityHints,
  accessibilityRoles,
} from '../utils/accessibility';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const Tab = createBottomTabNavigator<MainTabParamList>();

interface TabNavigatorProps {
  initialRouteName?: keyof MainTabParamList;
}

// Tab icon components defined outside render to avoid recreation
const HomeTabIcon: React.FC<{focused: boolean}> = ({focused}) => (
  <Icon name="home" size={24} color={focused ? '#FFFFFF' : '#666666'} />
);

const SearchTabIcon: React.FC<{focused: boolean}> = ({focused}) => (
  <Icon name="magnify" size={24} color={focused ? '#FFFFFF' : '#666666'} />
);

const DownloadsTabIcon: React.FC<{focused: boolean}> = ({focused}) => (
  <Icon name="download" size={24} color={focused ? '#FFFFFF' : '#666666'} />
);

const SettingsTabIcon: React.FC<{focused: boolean}> = ({focused}) => (
  <Icon name="cog" size={24} color={focused ? '#FFFFFF' : '#666666'} />
);

// Tab label components defined outside render to avoid recreation
const HomeTabLabel: React.FC<{focused: boolean}> = ({focused}) => (
  <Text
    style={[styles.tabBarLabel, focused && styles.activeLabel]}
    accessible={true}
    accessibilityRole={accessibilityRoles.tab}
    accessibilityLabel={accessibilityLabels.homeTab}
    accessibilityHint={accessibilityHints.homeTab}>
    Home
  </Text>
);

const SearchTabLabel: React.FC<{focused: boolean}> = ({focused}) => (
  <Text
    style={[styles.tabBarLabel, focused && styles.activeLabel]}
    accessible={true}
    accessibilityRole={accessibilityRoles.tab}
    accessibilityLabel={accessibilityLabels.searchTab}
    accessibilityHint={accessibilityHints.searchTab}>
    Search
  </Text>
);

const DownloadsTabLabel: React.FC<{focused: boolean}> = ({focused}) => (
  <Text
    style={[styles.tabBarLabel, focused && styles.activeLabel]}
    accessible={true}
    accessibilityRole={accessibilityRoles.tab}
    accessibilityLabel="Downloads tab"
    accessibilityHint="View your downloaded content">
    Downloads
  </Text>
);

const SettingsTabLabel: React.FC<{focused: boolean}> = ({focused}) => (
  <Text
    style={[styles.tabBarLabel, focused && styles.activeLabel]}
    accessible={true}
    accessibilityRole={accessibilityRoles.tab}
    accessibilityLabel={accessibilityLabels.settingsTab}
    accessibilityHint={accessibilityHints.settingsTab}>
    Settings
  </Text>
);

export const TabNavigator: React.FC<TabNavigatorProps> = ({
  initialRouteName = 'Home',
}) => {
  return (
    <Tab.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: '#666666',
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
            tabBarLabel: ({focused}) => <HomeTabLabel focused={focused} />,
            tabBarIcon: ({focused}) => <HomeTabIcon focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Search"
        component={SearchScreen}
        options={{
          tabBarLabel: ({focused}) => <SearchTabLabel focused={focused} />,
          tabBarIcon: ({focused}) => <SearchTabIcon focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Downloads"
        component={DownloadsScreen}
        options={{
          tabBarLabel: ({focused}) => <DownloadsTabLabel focused={focused} />,
          tabBarIcon: ({focused}) => <DownloadsTabIcon focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: ({focused}) => <SettingsTabLabel focused={focused} />,
          tabBarIcon: ({focused}) => <SettingsTabIcon focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
};

const safeArea = getSafeAreaPadding();

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#333333',
    height: 65 + safeArea.bottom,
  },
  tabBarLabel: {
    fontSize: typography.caption,
    fontWeight: '500',
    color: '#666666',
  },
  activeLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  tabBarItem: {
    paddingVertical: spacing.xs,
  },
});
