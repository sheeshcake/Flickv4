import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import Slider from '@react-native-community/slider';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {colors} from '../constants/theme';
import {useAppState} from '../hooks/useAppState';
import {SubtitleStyle, DEFAULT_SUBTITLE_STYLE} from '../types';

const FONT_SIZES = [
  {value: 'small', label: 'Small', size: 12},
  {value: 'medium', label: 'Medium', size: 16},
  {value: 'large', label: 'Large', size: 20},
  {value: 'xlarge', label: 'X-Large', size: 24},
] as const;

const FONT_COLORS = [
  {value: '#FFFFFF', label: 'White'},
  {value: '#FFFF00', label: 'Yellow'},
  {value: '#00FF00', label: 'Green'},
  {value: '#00FFFF', label: 'Cyan'},
  {value: '#FF00FF', label: 'Magenta'},
  {value: '#FFA500', label: 'Orange'},
];

const BACKGROUND_COLORS = [
  {value: '#000000', label: 'Black'},
  {value: '#333333', label: 'Dark Gray'},
  {value: '#0000FF', label: 'Blue'},
  {value: '#800080', label: 'Purple'},
  {value: '#008000', label: 'Dark Green'},
];

interface SubtitleStyleSettingsProps {
  onClose?: () => void;
}

const SubtitleStyleSettings: React.FC<SubtitleStyleSettingsProps> = ({
  onClose,
}) => {
  const {state, setSubtitleStyle} = useAppState();
  const [localStyle, setLocalStyle] = useState<SubtitleStyle>(
    state.user.preferences.subtitleStyle || DEFAULT_SUBTITLE_STYLE,
  );
  const [hasChanges, setHasChanges] = useState(false);

  // Track changes
  useEffect(() => {
    const currentStyle = state.user.preferences.subtitleStyle || DEFAULT_SUBTITLE_STYLE;
    const changed = JSON.stringify(localStyle) !== JSON.stringify(currentStyle);
    setHasChanges(changed);
  }, [localStyle, state.user.preferences.subtitleStyle]);

  const handleSave = async () => {
    try {
      await setSubtitleStyle(localStyle);
      Alert.alert('Settings Saved', 'Your subtitle style has been saved.', [
        {text: 'OK', onPress: onClose},
      ]);
    } catch (error) {
      console.error('Failed to save subtitle style:', error);
      Alert.alert('Error', 'Failed to save subtitle style. Please try again.');
    }
  };

  const handleReset = () => {
    Alert.alert(
      'Reset to Default',
      'Are you sure you want to reset subtitle style to default?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => setLocalStyle(DEFAULT_SUBTITLE_STYLE),
        },
      ],
    );
  };

  const updateStyle = (key: keyof SubtitleStyle, value: any) => {
    setLocalStyle(prev => ({...prev, [key]: value}));
  };

  const getFontSizeValue = () => {
    const found = FONT_SIZES.find(s => s.value === localStyle.fontSize);
    return found ? found.size : 16;
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Subtitle Style</Text>
        <Text style={styles.subtitle}>Customize how subtitles appear</Text>
      </View>

      {/* Preview Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preview</Text>
        <View style={styles.previewContainer}>
          <View
            style={[
              styles.previewBox,
              localStyle.position === 'top' && styles.previewBoxTop,
            ]}>
            <View
              style={[
                styles.previewTextContainer,
                {
                  backgroundColor:
                    localStyle.backgroundOpacity > 0
                      ? `${localStyle.backgroundColor}${Math.round(
                          localStyle.backgroundOpacity * 255,
                        )
                          .toString(16)
                          .padStart(2, '0')}`
                      : 'transparent',
                },
              ]}>
              <Text
                style={[
                  styles.previewText,
                  {
                    color: localStyle.fontColor,
                    fontSize: getFontSizeValue(),
                    fontWeight: localStyle.fontWeight,
                    textShadowColor: localStyle.textShadow
                      ? 'rgba(0, 0, 0, 1)'
                      : 'transparent',
                    textShadowOffset: localStyle.textShadow
                      ? {width: 1, height: 1}
                      : {width: 0, height: 0},
                    textShadowRadius: localStyle.textShadow ? 2 : 0,
                  },
                ]}>
                Sample Subtitle Text
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Font Size */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Font Size</Text>
        <View style={styles.optionsRow}>
          {FONT_SIZES.map(size => (
            <TouchableOpacity
              key={size.value}
              style={[
                styles.optionButton,
                localStyle.fontSize === size.value && styles.optionButtonSelected,
              ]}
              onPress={() => updateStyle('fontSize', size.value)}>
              <Text
                style={[
                  styles.optionText,
                  localStyle.fontSize === size.value && styles.optionTextSelected,
                ]}>
                {size.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Font Color */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Font Color</Text>
        <View style={styles.colorRow}>
          {FONT_COLORS.map(color => (
            <TouchableOpacity
              key={color.value}
              style={[
                styles.colorButton,
                {backgroundColor: color.value},
                localStyle.fontColor === color.value && styles.colorButtonSelected,
              ]}
              onPress={() => updateStyle('fontColor', color.value)}>
              {localStyle.fontColor === color.value && (
                <Icon
                  name="check"
                  size={20}
                  color={color.value === '#FFFFFF' ? '#000' : '#FFF'}
                />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Font Weight */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Font Weight</Text>
        <View style={styles.optionsRow}>
          <TouchableOpacity
            style={[
              styles.optionButton,
              styles.optionButtonWide,
              localStyle.fontWeight === 'normal' && styles.optionButtonSelected,
            ]}
            onPress={() => updateStyle('fontWeight', 'normal')}>
            <Text
              style={[
                styles.optionText,
                localStyle.fontWeight === 'normal' && styles.optionTextSelected,
              ]}>
              Normal
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.optionButton,
              styles.optionButtonWide,
              localStyle.fontWeight === 'bold' && styles.optionButtonSelected,
            ]}
            onPress={() => updateStyle('fontWeight', 'bold')}>
            <Text
              style={[
                styles.optionText,
                {fontWeight: 'bold'},
                localStyle.fontWeight === 'bold' && styles.optionTextSelected,
              ]}>
              Bold
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Text Shadow */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Text Shadow</Text>
        <View style={styles.optionsRow}>
          <TouchableOpacity
            style={[
              styles.optionButton,
              styles.optionButtonWide,
              localStyle.textShadow && styles.optionButtonSelected,
            ]}
            onPress={() => updateStyle('textShadow', true)}>
            <Text
              style={[
                styles.optionText,
                localStyle.textShadow && styles.optionTextSelected,
              ]}>
              On
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.optionButton,
              styles.optionButtonWide,
              !localStyle.textShadow && styles.optionButtonSelected,
            ]}
            onPress={() => updateStyle('textShadow', false)}>
            <Text
              style={[
                styles.optionText,
                !localStyle.textShadow && styles.optionTextSelected,
              ]}>
              Off
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Background Color */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Background Color</Text>
        <View style={styles.colorRow}>
          {BACKGROUND_COLORS.map(color => (
            <TouchableOpacity
              key={color.value}
              style={[
                styles.colorButton,
                {backgroundColor: color.value},
                localStyle.backgroundColor === color.value &&
                  styles.colorButtonSelected,
              ]}
              onPress={() => updateStyle('backgroundColor', color.value)}>
              {localStyle.backgroundColor === color.value && (
                <Icon name="check" size={20} color="#FFF" />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Background Opacity */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Background Opacity: {Math.round(localStyle.backgroundOpacity * 100)}%
        </Text>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={1}
          step={0.1}
          value={localStyle.backgroundOpacity}
          onValueChange={value => updateStyle('backgroundOpacity', value)}
          minimumTrackTintColor={colors.red}
          maximumTrackTintColor={colors.dark}
          thumbTintColor={colors.red}
        />
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabel}>Transparent</Text>
          <Text style={styles.sliderLabel}>Solid</Text>
        </View>
      </View>

      {/* Position */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Position</Text>
        <View style={styles.optionsRow}>
          <TouchableOpacity
            style={[
              styles.optionButton,
              styles.optionButtonWide,
              localStyle.position === 'bottom' && styles.optionButtonSelected,
            ]}
            onPress={() => updateStyle('position', 'bottom')}>
            <Icon
              name="arrow-collapse-down"
              size={18}
              color={localStyle.position === 'bottom' ? colors.white : colors.light}
              style={styles.optionIcon}
            />
            <Text
              style={[
                styles.optionText,
                localStyle.position === 'bottom' && styles.optionTextSelected,
              ]}>
              Bottom
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.optionButton,
              styles.optionButtonWide,
              localStyle.position === 'top' && styles.optionButtonSelected,
            ]}
            onPress={() => updateStyle('position', 'top')}>
            <Icon
              name="arrow-collapse-up"
              size={18}
              color={localStyle.position === 'top' ? colors.white : colors.light}
              style={styles.optionIcon}
            />
            <Text
              style={[
                styles.optionText,
                localStyle.position === 'top' && styles.optionTextSelected,
              ]}>
              Top
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
          <Text style={styles.resetButtonText}>Reset to Default</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveButton, !hasChanges && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!hasChanges}>
          <Text
            style={[
              styles.saveButtonText,
              !hasChanges && styles.saveButtonTextDisabled,
            ]}>
            Save Changes
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
  },
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.light,
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 12,
  },
  previewContainer: {
    backgroundColor: '#222',
    borderRadius: 8,
    height: 120,
    overflow: 'hidden',
  },
  previewBox: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: 10,
  },
  previewBoxTop: {
    justifyContent: 'flex-start',
  },
  previewTextContainer: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  previewText: {
    textAlign: 'center',
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    flex: 1,
    minWidth: 70,
    backgroundColor: colors.dark,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    flexDirection: 'row',
  },
  optionButtonWide: {
    flex: 1,
    minWidth: 120,
  },
  optionButtonSelected: {
    backgroundColor: colors.red + '30',
    borderColor: colors.red,
  },
  optionText: {
    color: colors.light,
    fontSize: 14,
    fontWeight: '500',
  },
  optionTextSelected: {
    color: colors.white,
    fontWeight: 'bold',
  },
  optionIcon: {
    marginRight: 6,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorButtonSelected: {
    borderColor: colors.red,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -8,
  },
  sliderLabel: {
    color: colors.light,
    fontSize: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 12,
  },
  resetButton: {
    flex: 1,
    backgroundColor: colors.dark,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.light,
  },
  resetButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    flex: 1,
    backgroundColor: colors.red,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: colors.dark,
  },
  saveButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButtonTextDisabled: {
    color: colors.light,
  },
});

export default SubtitleStyleSettings;
