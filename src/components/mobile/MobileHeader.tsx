/**
 * Mobile Header Component
 * Compact header optimized for mobile screens with touch interactions
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { spacing, typography } from '../../utils/responsive';

interface MobileHeaderProps {
  title?: string;
  showLogo?: boolean;
  showSearch?: boolean;
  showSettings?: boolean;
  showBack?: boolean;
  onSearchPress?: () => void;
  onSettingsPress?: () => void;
  onBackPress?: () => void;
  onLogoPress?: () => void;
  transparent?: boolean;
}

const HEADER_HEIGHT = 56;
const BRAND_COLOR = '#E50914';

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  title,
  showLogo = true,
  showSearch = true,
  showSettings = false,
  showBack = false,
  onSearchPress,
  onSettingsPress,
  onBackPress,
  onLogoPress,
  transparent = false,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top },
        transparent && styles.transparent,
      ]}
    >
      <View style={styles.content}>
        <View style={styles.leftSection}>
          {showBack && (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={onBackPress}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="arrow-left" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          )}
          {showLogo && !showBack && (
            <TouchableOpacity onPress={onLogoPress}>
            <Image
                source={require('../../assets/logo/logo.png')}
                style={{
                    width: 70,
                }}
                resizeMode="contain"
            />
            </TouchableOpacity>
          )}
          {title && !showLogo && (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          )}
        </View>

        <View style={styles.rightSection}>
          {showSearch && (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={onSearchPress}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="magnify" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          )}
          {showSettings && (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={onSettingsPress}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="cog" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  transparent: {
    backgroundColor: 'transparent',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: HEADER_HEIGHT,
    paddingHorizontal: spacing.md,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoText: {
    color: BRAND_COLOR,
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  title: {
    color: '#FFFFFF',
    fontSize: typography.h5,
    fontWeight: '600',
    flex: 1,
  },
  iconButton: {
    padding: spacing.xs,
  },
});

export default MobileHeader;
