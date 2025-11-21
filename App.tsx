import React from 'react';
import {StatusBar} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {AppProvider} from './src/context';
import {AppNavigator} from './src/navigation';

function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <AppProvider>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <AppNavigator />
      </AppProvider>
    </GestureHandlerRootView>
  );
}

export default App;
