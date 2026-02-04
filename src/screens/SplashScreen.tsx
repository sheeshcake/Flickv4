import React, {useEffect, useMemo, useState} from 'react';
import {View, StyleSheet, Image, ActivityIndicator, Text} from 'react-native';
import type {RootStackScreenProps} from '../types/navigation';
import {useAppContext} from '../context/AppContext';
import {COLORS} from '../utils/constants';
import {updateService, UpdateInfo} from '../services/UpdateService';
import {UpdateModal} from '../components/UpdateModal';

const SplashScreen: React.FC<RootStackScreenProps<'Splash'>> = ({navigation}) => {
  const {state} = useAppContext();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateCheckComplete, setUpdateCheckComplete] = useState(false);

  const isInitialLoading = useMemo(() => {
    const loadingFlag = state.ui.loading.initialLoad;
    return loadingFlag === undefined ? true : loadingFlag;
  }, [state.ui.loading.initialLoad]);

  // Check for updates in the background
  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        const info = await updateService.checkForUpdates();
        if (info.hasUpdate) {
          setUpdateInfo(info);
          setShowUpdateModal(true);
        } else {
          setUpdateCheckComplete(true);
        }
      } catch (_error) {
        // Silently fail - don't block the app if update check fails
        setUpdateCheckComplete(true);
      }
    };

    checkForUpdates();
  }, []);

  // Navigate to main screen when both loading is complete and no update modal is showing
  useEffect(() => {
    if (!isInitialLoading && updateCheckComplete && !showUpdateModal) {
      const timeoutId = setTimeout(() => {
        navigation.reset({
          index: 0,
          routes: [{name: 'Main'}],
        });
      }, 300);

      return () => clearTimeout(timeoutId);
    }
  }, [isInitialLoading, updateCheckComplete, showUpdateModal, navigation]);

  const handleCloseUpdateModal = () => {
    setShowUpdateModal(false);
    setUpdateCheckComplete(true);
  };

  const handleSkipVersion = () => {
    setShowUpdateModal(false);
    setUpdateCheckComplete(true);
  };

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/logo/logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <ActivityIndicator size="large" color={COLORS.NETFLIX_RED} />
      <Text style={styles.subtitle}>Loading your experience...</Text>

      <UpdateModal
        visible={showUpdateModal}
        onClose={handleCloseUpdateModal}
        isDarkTheme={true}
        initialUpdateInfo={updateInfo}
        onSkipVersion={handleSkipVersion}
      />
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
