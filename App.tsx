import React from 'react';
import {StatusBar, View} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {AppProvider, VideoPlayerProvider, useVideoPlayer} from './src/context';
import {AppNavigator, PlatformNavigator} from './src/navigation';
import {VideoPlayerSheet} from './src/components/VideoPlayerSheet';
import {UpdateChecker} from './src/components';
import {isTV} from './src/utils/platform';

// Set to true to use platform-aware navigation (TV sidebar vs Mobile tabs)
const USE_PLATFORM_NAVIGATOR = true;

const AppContent: React.FC = () => {
  const {playerState} = useVideoPlayer();

  return (
    <View style={{flex: 1}}>
      {USE_PLATFORM_NAVIGATOR ? <PlatformNavigator /> : <AppNavigator />}
      {playerState.content && !isTV && <VideoPlayerSheet />}
      {/* Auto-check for updates on app startup */}
      <UpdateChecker isDarkTheme={true} checkIntervalHours={12} />
    </View>
  );
};

function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <AppProvider>
        <VideoPlayerProvider>
          <StatusBar barStyle="light-content" backgroundColor="#000000" />
          <AppContent />
        </VideoPlayerProvider>
      </AppProvider>
    </GestureHandlerRootView>
  );
}

export default App;
