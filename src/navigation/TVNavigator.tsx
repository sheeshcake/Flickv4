/**
 * TV Navigator
 * Navigation structure optimized for TV with sidebar-based navigation
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import {
  TVHomeScreen,
  TVDetailScreen,
  TVSearchScreen,
  TVSettingsScreen,
} from '../screens/tv';
import { SplashScreen } from '../screens';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const TVNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
          animation: 'fade',
        }}
      >
        <Stack.Screen
          name="Splash"
          component={SplashScreen}
          options={{ animation: 'fade' }}
        />
        <Stack.Screen 
          name="Main" 
          component={TVHomeScreen}
        />
        <Stack.Screen
          name="Detail"
          component={TVDetailScreen}
          options={{
            animation: 'fade_from_bottom',
          }}
        />
        {/* Additional TV screens as modal/overlay */}
        <Stack.Screen
          name="Search"
          component={TVSearchScreen}
          options={{
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="Settings"
          component={TVSettingsScreen}
          options={{
            animation: 'fade',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default TVNavigator;
