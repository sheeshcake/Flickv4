import React from 'react';
import {StatusBar} from 'react-native';
import {AppProvider} from './src/context';
import {AppNavigator} from './src/navigation';

function App(): React.JSX.Element {
  return (
    <AppProvider>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <AppNavigator />
    </AppProvider>
  );
}

export default App;
