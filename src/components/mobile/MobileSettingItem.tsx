/**
 * Mobile Setting Item Component
 * Touch-optimized setting row with toggle and navigation support
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { spacing, typography } from '../../utils/responsive';

const BRAND_COLOR = '#E50914';

interface MobileSettingItemProps {
  title: string;
  description?: string;
  icon?: string;
  type?: 'toggle' | 'button' | 'navigation';
  value?: boolean;
  onPress?: () => void;
  onToggle?: (value: boolean) => void;
  disabled?: boolean;
}

export const MobileSettingItem: React.FC<MobileSettingItemProps> = ({
  title,
  description,
  icon,
  type = 'button',
  value,
  onPress,
  onToggle,
  disabled = false,
}) => {
  const handlePress = () => {
    if (type === 'toggle' && onToggle !== undefined) {
      onToggle(!value);
    } else if (onPress) {
      onPress();
    }
  };

  return (
    <TouchableOpacity
      style={[styles.container, disabled && styles.disabled]}
      onPress={handlePress}
      disabled={disabled && type !== 'toggle'}
      activeOpacity={0.7}
    >
      <View style={styles.leftContent}>
        {icon && (
          <View style={styles.iconContainer}>
            <Icon name={icon} size={22} color={disabled ? '#666666' : '#FFFFFF'} />
          </View>
        )}
        <View style={styles.textContainer}>
          <Text style={[styles.title, disabled && styles.disabledText]}>
            {title}
          </Text>
          {description && (
            <Text style={styles.description}>{description}</Text>
          )}
        </View>
      </View>

      <View style={styles.rightContent}>
        {type === 'toggle' && (
          <Switch
            value={value}
            onValueChange={onToggle}
            trackColor={{ false: '#333333', true: BRAND_COLOR }}
            thumbColor={value ? '#FFFFFF' : '#888888'}
            disabled={disabled}
          />
        )}
        {type === 'navigation' && (
          <Icon name="chevron-right" size={24} color="#666666" />
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A1A1A',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    borderRadius: 12,
  },
  disabled: {
    opacity: 0.5,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: typography.body,
    fontWeight: '500',
  },
  disabledText: {
    color: '#666666',
  },
  description: {
    color: '#888888',
    fontSize: typography.caption,
    marginTop: 2,
  },
  rightContent: {
    marginLeft: spacing.sm,
  },
});

export default MobileSettingItem;
