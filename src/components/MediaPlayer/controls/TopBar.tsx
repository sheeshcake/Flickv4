import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, sizes } from '../../../constants/theme';
import { styles } from './styles';
import { TopBarProps } from './types';
import { trimText } from './utils';

export const TopBar: React.FC<TopBarProps> = ({
  fullscreen,
  hidden,
  title,
  onBackPress,
  upperRightComponent,
}) => {
  return (
    <View
      style={[
        styles.topBar,
        fullscreen ? styles.topBarFullscreen : styles.topBarRegular,
        hidden ? styles.topBarHidden : styles.topBarVisible,
      ]}
    >
      <TouchableOpacity onPress={onBackPress} style={styles.backButton}>
        <Icon name="arrow-left" size={sizes.width * 0.05} color={colors.white} />
      </TouchableOpacity>
      {(!fullscreen || !hidden) && (
        <Text style={styles.titleText}>{trimText(title) || 'Movie'}</Text>
      )}
      {upperRightComponent || <View style={styles.topBarRightPlaceholder} />}
    </View>
  );
};

