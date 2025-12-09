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
    <View
      style={[
        styles.centerOverlay,
        hidden && styles.centerOverlayHidden,
      ]}
    >
      <DoubleTapSeekArea
        side="left"
        style={styles.seekArea}
        onDoubleTap={onSeekBackward}
        onSingleTap={onHide}
        seekAmountLabel={seekLabel}
      />

      <TouchableOpacity
        style={styles.centerPlayArea}
        activeOpacity={1}
        onPress={onHide}
      >
        {status === 'loading' && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.red} />
            <Text style={styles.loadingText}>{loadingMessage}</Text>
          </View>
        )}

        {status === 'error' && (
          <Text style={styles.errorText}>No Video Available :(</Text>
        )}

        {status !== 'loading' && status !== 'error' && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              onPlayPause();
              if (hidden) {
                onHide();
              }
            }}
            style={[
              styles.playPauseButton,
              hidden && styles.playPauseButtonHidden,
              !hidden && styles.playPauseButtonVisible,
            ]}
          >
            <Icon
              name={playing ? 'pause' : 'play'}
              size={sizes.width * 0.08}
              color={colors.white}
            />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

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
