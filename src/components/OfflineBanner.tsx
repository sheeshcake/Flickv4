import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Animated} from 'react-native';
import {NetworkUtils, NetworkState} from '../utils/networkUtils';
import {COLORS} from '../utils/constants';

export interface OfflineBannerProps {
  onRetry?: () => void;
  showRetryButton?: boolean;
  position?: 'top' | 'bottom';
  autoHide?: boolean;
  autoHideDelay?: number;
}

/**
 * Banner component that shows when the device is offline
 */
export const OfflineBanner: React.FC<OfflineBannerProps> = ({
  onRetry,
  showRetryButton = true,
  position = 'top',
  autoHide = false,
  autoHideDelay = 5000,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [networkState, setNetworkState] = useState<NetworkState>({
    isConnected: true,
    isInternetReachable: true,
    type: 'unknown',
  });
  const [slideAnim] = useState(new Animated.Value(-100));

  useEffect(() => {
    // Initialize network monitoring
    NetworkUtils.initialize();

    // Get initial network state
    NetworkUtils.getCurrentState().then(setNetworkState);

    // Listen for network changes
    const unsubscribe = NetworkUtils.addListener(setNetworkState);

    return unsubscribe;
  }, []);

  useEffect(() => {
    const shouldShow =
      !networkState.isConnected || !networkState.isInternetReachable;

    if (shouldShow !== isVisible) {
      setIsVisible(shouldShow);

      if (shouldShow) {
        // Show banner
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start();

        // Auto hide if enabled
        if (autoHide) {
          setTimeout(() => {
            hideBanner();
          }, autoHideDelay);
        }
      } else {
        // Hide banner
        hideBanner();
      }
    }
  }, [networkState, isVisible, autoHide, autoHideDelay]);

  const hideBanner = () => {
    Animated.timing(slideAnim, {
      toValue: position === 'top' ? -100 : 100,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setIsVisible(false);
    });
  };

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    }
    // Check network state again
    NetworkUtils.getCurrentState().then(setNetworkState);
  };

  if (!isVisible) {
    return null;
  }

  const bannerStyle = [
    styles.banner,
    position === 'top' ? styles.bannerTop : styles.bannerBottom,
    {
      transform: [{translateY: slideAnim}],
    },
  ];

  const getStatusText = () => {
    if (!networkState.isConnected) {
      return 'No internet connection';
    }
    if (!networkState.isInternetReachable) {
      return 'Limited connectivity';
    }
    return 'Connection issues';
  };

  return (
    <Animated.View style={bannerStyle}>
      <View style={styles.content}>
        <View style={styles.textContainer}>
          <Text style={styles.statusText}>{getStatusText()}</Text>
          <Text style={styles.subText}>Some features may not be available</Text>
        </View>

        {showRetryButton && (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={handleRetry}
            activeOpacity={0.7}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
};

/**
 * Hook to get current network state
 */
export const useNetworkState = () => {
  const [networkState, setNetworkState] = useState<NetworkState>({
    isConnected: true,
    isInternetReachable: true,
    type: 'unknown',
  });

  useEffect(() => {
    // Initialize network monitoring
    NetworkUtils.initialize();

    // Get initial network state
    NetworkUtils.getCurrentState().then(setNetworkState);

    // Listen for network changes
    const unsubscribe = NetworkUtils.addListener(setNetworkState);

    return unsubscribe;
  }, []);

  return {
    ...networkState,
    isOnline: networkState.isConnected && networkState.isInternetReachable,
    isOffline: !networkState.isConnected || !networkState.isInternetReachable,
  };
};

/**
 * Simple offline indicator dot
 */
export const OfflineIndicator: React.FC<{
  size?: number;
  style?: any;
}> = ({size = 8, style}) => {
  const {isOffline} = useNetworkState();

  if (!isOffline) {
    return null;
  }

  return (
    <View
      style={[
        styles.offlineIndicator,
        {width: size, height: size, borderRadius: size / 2},
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: COLORS.NETFLIX_RED,
    zIndex: 1000,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  bannerTop: {
    top: 0,
    paddingTop: 50, // Account for status bar
  },
  bannerBottom: {
    bottom: 0,
    paddingBottom: 20,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  textContainer: {
    flex: 1,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.NETFLIX_WHITE,
    marginBottom: 2,
  },
  subText: {
    fontSize: 12,
    color: COLORS.NETFLIX_WHITE,
    opacity: 0.9,
  },
  retryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 12,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.NETFLIX_WHITE,
  },
  offlineIndicator: {
    backgroundColor: '#FF6B35',
  },
});
