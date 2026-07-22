import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  Download as DownloadIcon,
  Home as HomeIcon,
  Search as SearchIcon,
  Settings as SettingsIcon,
} from 'lucide-react-native';
import { HomeScreen } from '@/src/screens/HomeScreen';
import { SearchScreen } from '@/src/screens/SearchScreen';
import { SettingsScreen } from '@/src/screens/SettingsScreen';
import { DownloadsScreen } from '@/src/screens/DownloadsScreen';

export type MainTabParamList = {
  Home: undefined;
  Search: undefined;
  Downloads: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export const TabNavigator = () => {
  return (
    <Tab.Navigator
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
