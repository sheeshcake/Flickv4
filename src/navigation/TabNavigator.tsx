import {
  BottomTabBar,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import { PartySessionBar } from '@/src/components/party/PartySessionBar';
import {
  Download as DownloadIcon,
  Home as HomeIcon,
  Radio as LiveIcon,
  Search as SearchIcon,
  Settings as SettingsIcon,
} from 'lucide-react-native';
import { HomeScreen } from '@/src/screens/HomeScreen';
import { SearchScreen } from '@/src/screens/SearchScreen';
import { SettingsScreen } from '@/src/screens/SettingsScreen';
import { DownloadsScreen } from '@/src/screens/DownloadsScreen';
import { LiveTvScreen } from '@/src/screens/LiveTvScreen';
import { FLIXQUEST_CONFIG } from '@/src/config/env';

export type MainTabParamList = {
  Home: undefined;
  Search: undefined;
  Live: undefined;
  Downloads: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export const TabNavigator = () => {
  return (
    <Tab.Navigator
      tabBar={(props) => (
        <>
          <PartySessionBar placement="tabs" />
          <BottomTabBar {...props} />
        </>
      )}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#E50914',
        tabBarInactiveTintColor: '#8c8c8c',
        tabBarStyle: {
          backgroundColor: '#000000',
          borderTopColor: '#1f1f1f',
          borderTopWidth: 1,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, size }) => <HomeIcon color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Search"
        component={SearchScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <SearchIcon color={color} size={size} />
          ),
        }}
      />
      {FLIXQUEST_CONFIG.enabled ? (
        <Tab.Screen
          name="Live"
          component={LiveTvScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <LiveIcon color={color} size={size} />
            ),
          }}
        />
      ) : null}
      <Tab.Screen
        name="Downloads"
        component={DownloadsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <DownloadIcon color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <SettingsIcon color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};
