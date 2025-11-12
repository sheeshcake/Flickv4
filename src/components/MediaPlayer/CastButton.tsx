import React, { useCallback } from 'react';
import { StyleProp, TouchableOpacity, ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import GoogleCast, { useCastDevice, useDevices } from 'react-native-google-cast';
import { colors } from '../../constants/theme';

interface CastButtonProps {
  style?: StyleProp<ViewStyle>;
}

const CastButton: React.FC<CastButtonProps> = ({ style }) => {
  const devices = useDevices();
  const castDevice = useCastDevice();
  const sessionManager = GoogleCast?.getSessionManager?.();

  const handlePress = useCallback(() => {
    if (!sessionManager) {
      return;
    }

    if (castDevice) {
      sessionManager.endCurrentSession();
      return;
    }

    if (devices.length === 1) {
      sessionManager.startSession(devices[0].deviceId);
      return;
    }

    const castApi: any = GoogleCast;
    if (typeof castApi.showCastDialog === 'function') {
      castApi.showCastDialog();
    } else if (typeof castApi.showCastPicker === 'function') {
      castApi.showCastPicker();
    }
  }, [castDevice, devices, sessionManager]);

  const iconName = castDevice ? 'cast-connected' : 'cast';
  const isDisabled = !devices.length && !castDevice;
  const iconColor = isDisabled ? 'rgba(255, 255, 255, 0.5)' : colors.white;

  return (
    <TouchableOpacity
      accessibilityLabel="Cast"
      accessibilityRole="button"
      style={style}
      onPress={handlePress}
      disabled={isDisabled}
    >
      <Icon name={iconName} size={24} color={iconColor} />
    </TouchableOpacity>
  );
};

export default CastButton;