import React, {useEffect, useMemo} from 'react';
import {View, StyleSheet, Image, ActivityIndicator, Text} from 'react-native';
import type {RootStackScreenProps} from '../types/navigation';
import {useAppContext} from '../context/AppContext';
import {COLORS} from '../utils/constants';

const SplashScreen: React.FC<RootStackScreenProps<'Splash'>> = ({navigation}) => {
  const {state} = useAppContext();

  const isInitialLoading = useMemo(() => {
    const loadingFlag = state.ui.loading.initialLoad;
    return loadingFlag === undefined ? true : loadingFlag;
  }, [state.ui.loading.initialLoad]);

  useEffect(() => {
    if (!isInitialLoading) {
      const timeoutId = setTimeout(() => {
        navigation.reset({
          index: 0,
          routes: [{name: 'Main'}],
        });
      }, 300);

      return () => clearTimeout(timeoutId);
    }
  }, [isInitialLoading, navigation]);

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/logo/logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <ActivityIndicator size="large" color={COLORS.NETFLIX_RED} />
      <Text style={styles.subtitle}>Loading your experience...</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.NETFLIX_BLACK,
    paddingHorizontal: 24,
  },
  logo: {
    width: 160,
    height: 160,
    marginBottom: 32,
  },
  subtitle: {
    marginTop: 16,
    color: COLORS.NETFLIX_GRAY,
    fontSize: 14,
    textAlign: 'center',
  },
});

export default SplashScreen;
