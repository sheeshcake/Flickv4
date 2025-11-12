import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, sizes } from '../../../constants/theme';
import { DoubleTapSeekArea } from './DoubleTapSeekArea';
import { CenterOverlayProps } from './types';
import { styles } from './styles';

export const CenterOverlay: React.FC<CenterOverlayProps> = ({
  status,
  loadingMessage,
  playing,
  hidden,
  seekIncrementSeconds,
  onPlayPause,
  onHide,
  onSeekBackward,
  onSeekForward,
}) => {
  const seekLabel = `${seekIncrementSeconds}s`;

  return (
    <View style={styles.centerOverlay}>
      <DoubleTapSeekArea
        side="left"
        style={styles.seekArea}
        onDoubleTap={onSeekBackward}
        onSingleTap={onHide}
        seekAmountLabel={seekLabel}
      />

      <View style={styles.centerPlayArea}>
        {status === 'loading' && (
          <>
            <ActivityIndicator size="large" color={colors.red} />
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>{loadingMessage}</Text>
            </View>
          </>
        )}

        {status === 'error' && (
          <Text style={styles.errorText}>No Video Available :(</Text>
        )}

        {status !== 'loading' && status !== 'error' && (
          <TouchableOpacity
            activeOpacity={hidden ? 1 : 0.7}
            onPress={onPlayPause}
            style={[
              styles.playPauseButton,
              hidden ? styles.playPauseButtonHidden : styles.playPauseButtonVisible,
            ]}
          >
            <Icon
              name={playing ? 'pause' : 'play'}
              size={sizes.width * 0.08}
              color={colors.white}
            />
          </TouchableOpacity>
        )}
      </View>

      <DoubleTapSeekArea
        side="right"
        style={styles.seekArea}
        onDoubleTap={onSeekForward}
        onSingleTap={onHide}
        seekAmountLabel={seekLabel}
      />
    </View>
  );
};
