import React, { useCallback, useState } from 'react';
import { View, StyleSheet, BackHandler, Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Movie, TVShow } from '../types';
import { TVSideNav, TVTab } from '../components/tv/TVSideNav';
import {
  TVHomeScreen,
  TVSearchScreen,
  TVDetailScreen,
  TVSettingsScreen,
} from '../screens/tv';

export type TVStackParamList = {
  TVMain: undefined;
  TVDetail: { content: Movie | TVShow };
};

const Stack = createNativeStackNavigator<TVStackParamList>();

interface TVMainScreenProps {
  navigation: any;
}

const TVMainScreen: React.FC<TVMainScreenProps> = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState<TVTab>('Home');

  const handleNavigateToDetail = useCallback(
    (content: Movie | TVShow) => {
      navigation.navigate('TVDetail', { content });
    },
    [navigation],
  );

  const renderActiveScreen = () => {
    switch (activeTab) {
      case 'Home':
        return (
          <TVHomeScreen onNavigateToDetail={handleNavigateToDetail} />
        );
      case 'Search':
        return (
          <TVSearchScreen onNavigateToDetail={handleNavigateToDetail} />
        );
      case 'Settings':
        return <TVSettingsScreen />;
    }
  };

  return (
    <View style={styles.mainLayout}>
      {/* Sidebar navigation */}
      <TVSideNav activeTab={activeTab} onTabPress={setActiveTab} />

      {/* Active screen */}
      <View style={styles.mainContent}>
        {renderActiveScreen()}
      </View>
    </View>
  );
};


interface TVDetailWrapperProps {
  route: { params: { content: Movie | TVShow } };
  navigation: any;
}

const TVDetailWrapper: React.FC<TVDetailWrapperProps> = ({
  route,
  navigation,
}) => {
  const { content } = route.params;

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleNavigateToDetail = useCallback(
    (item: Movie | TVShow) => {
      navigation.push('TVDetail', { content: item });
    },
    [navigation],
  );

  return (
    <TVDetailScreen
      content={content}
      onBack={handleBack}
      onNavigateToDetail={handleNavigateToDetail}
    />
  );
};


export const TVNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#000000' },
      }}
    >
      <Stack.Screen name="TVMain" component={TVMainScreen} />
      <Stack.Screen
        name="TVDetail"
        component={TVDetailWrapper}
        options={{
          animation: 'slide_from_bottom',
          presentation: 'modal',
        }}
      />
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  mainLayout: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#000000',
  },
  mainContent: {
    flex: 1,
    backgroundColor: '#000000',
  },
});

export default TVNavigator;
