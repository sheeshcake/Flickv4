import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SplashScreen } from '@/src/screens/SplashScreen';
import { DetailScreen } from '@/src/screens/DetailScreen';
import { PlayerScreen } from '@/src/screens/PlayerScreen';
import { ViewMoreScreen } from '@/src/screens/ViewMoreScreen';
import { SubtitleSettingsScreen } from '@/src/screens/SubtitleSettingsScreen';
import { ServerSettingsScreen } from '@/src/screens/ServerSettingsScreen';
import { VideoQualitySettingsScreen } from '@/src/screens/VideoQualitySettingsScreen';
import { VideoAspectSettingsScreen } from '@/src/screens/VideoAspectSettingsScreen';
import { DisclaimerScreen } from '@/src/screens/DisclaimerScreen';
import { CreditsScreen } from '@/src/screens/CreditsScreen';
import { FinishedMoviesScreen } from '@/src/screens/FinishedMoviesScreen';
import { TabNavigator } from './TabNavigator';
import { TVNavigator } from './TVNavigator';
import { isTVLayout } from '@/src/utils/tv';
import { isTablet } from '@/src/utils/responsive';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Phones are locked to portrait everywhere; only the Player screen may rotate
// to landscape. Tablets, TVs, and Mac Catalyst windows are free to rotate
// (`default`) since they can be resized/oriented arbitrarily.
const flexibleDevice = isTVLayout || isTablet();
const appOrientation = flexibleDevice ? 'default' : 'portrait';
// The player is always landscape, on every form factor.
const playerOrientation = 'landscape';

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#000000',
    card: '#000000',
    primary: '#E50914',
    text: '#FFFFFF',
    border: '#1f1f1f',
  },
};

export const AppNavigator = () => {
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          orientation: appOrientation,
        }}
      >
        <Stack.Screen
          name="Splash"
          component={SplashScreen}
          options={{ animation: 'fade' }}
        />
        <Stack.Screen
          name="Main"
          component={isTVLayout ? TVNavigator : TabNavigator}
        />
        <Stack.Screen
          name="Detail"
          component={DetailScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="ViewMore" component={ViewMoreScreen} />
        <Stack.Screen
          name="SubtitleSettings"
          component={SubtitleSettingsScreen}
        />
        <Stack.Screen name="ServerSettings" component={ServerSettingsScreen} />
        <Stack.Screen
          name="VideoQualitySettings"
          component={VideoQualitySettingsScreen}
        />
        <Stack.Screen
          name="VideoAspectSettings"
          component={VideoAspectSettingsScreen}
        />
        <Stack.Screen name="Disclaimer" component={DisclaimerScreen} />
        <Stack.Screen name="Credits" component={CreditsScreen} />
        <Stack.Screen name="FinishedMovies" component={FinishedMoviesScreen} />
        <Stack.Screen
          name="Player"
          component={PlayerScreen}
          options={{ animation: 'fade', orientation: playerOrientation }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
