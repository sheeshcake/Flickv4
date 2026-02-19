import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';

// ─── TV-aware focusable pressable ────────────────────────────────
const FP: React.FC<{
  style?: any;
  focusedStyle?: any;
  onPress?: () => void;
  disabled?: boolean;
  hasTVPreferredFocus?: boolean;
  accessibilityLabel?: string;
  children: React.ReactNode;
}> = ({ style, focusedStyle, onPress, disabled, hasTVPreferredFocus, accessibilityLabel, children }) => {
  const [focused, setFocused] = useState(false);
  const tvProps: any = { hasTVPreferredFocus };
  return (
    <Pressable
      {...tvProps}
      style={[style, focused && focusedStyle]}
      onPress={disabled ? undefined : onPress}
      onFocus={useCallback(() => setFocused(true), [])}
      onBlur={useCallback(() => setFocused(false), [])}
      focusable={!disabled}
      accessible={true}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </Pressable>
  );
};
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../constants/theme';
import { useAppState } from '../hooks/useAppState';

const COMMON_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
  { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
  { code: 'no', name: 'Norwegian', flag: '🇳🇴' },
  { code: 'da', name: 'Danish', flag: '🇩🇰' },
  { code: 'fi', name: 'Finnish', flag: '🇫🇮' },
  { code: 'he', name: 'Hebrew', flag: '🇮🇱' },
];

interface SubtitleSettingsProps {
  onClose?: () => void;
}

const SubtitleSettings: React.FC<SubtitleSettingsProps> = ({ onClose }) => {
  const { state, setDefaultSubtitleLanguage, setAutoSelectSubtitles } = useAppState();
  const [selectedLanguage, setSelectedLanguage] = useState<string | undefined>(
    state.user.preferences.defaultSubtitleLanguage
  );
  const [autoSelect, setAutoSelect] = useState<boolean>(
    state.user.preferences.autoSelectSubtitles
  );
  const [hasChanges, setHasChanges] = useState(false);

  // Track changes
  useEffect(() => {
    const languageChanged = selectedLanguage !== state.user.preferences.defaultSubtitleLanguage;
    const autoSelectChanged = autoSelect !== state.user.preferences.autoSelectSubtitles;
    setHasChanges(languageChanged || autoSelectChanged);
  }, [selectedLanguage, autoSelect, state.user.preferences]);

  const handleLanguageSelect = (languageCode: string) => {
    if (selectedLanguage === languageCode) {
      // Deselect if already selected
      setSelectedLanguage(undefined);
    } else {
      setSelectedLanguage(languageCode);
    }
  };

  const handleAutoSelectToggle = (value: boolean) => {
    setAutoSelect(value);
    if (!value) {
      // If auto-select is disabled, also clear the default language
      setSelectedLanguage(undefined);
    }
  };

  const handleSave = async () => {
    try {
      await setDefaultSubtitleLanguage(selectedLanguage);
      await setAutoSelectSubtitles(autoSelect);
      
      Alert.alert(
        'Settings Saved',
        'Your subtitle preferences have been saved successfully.',
        [{ text: 'OK', onPress: onClose }]
      );
    } catch (error) {
      console.error('Failed to save subtitle settings:', error);
      Alert.alert(
        'Error',
        'Failed to save subtitle settings. Please try again.'
      );
    }
  };

  const handleReset = () => {
    Alert.alert(
      'Reset Settings',
      'Are you sure you want to reset subtitle settings to default?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            setSelectedLanguage(undefined);
            setAutoSelect(false);
          },
        },
      ]
    );
  };

  const getSelectedLanguageInfo = () => {
    if (!selectedLanguage) return null;
    return COMMON_LANGUAGES.find(lang => lang.code === selectedLanguage);
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Subtitle Settings</Text>
        <Text style={styles.subtitle}>
          Configure your default subtitle preferences
        </Text>
      </View>

      {/* Auto-select subtitles toggle */}
      <View style={styles.section}>
        <FP
          style={styles.settingRow}
          focusedStyle={styles.settingRowFocused}
          onPress={() => handleAutoSelectToggle(!autoSelect)}
          hasTVPreferredFocus={true}
          accessibilityLabel="Auto-select subtitles"
        >
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Auto-select Subtitles</Text>
            <Text style={styles.settingDescription}>
              Automatically select subtitles when playing videos based on your preferred language
            </Text>
          </View>
          <Switch
            value={autoSelect}
            onValueChange={handleAutoSelectToggle}
            trackColor={{ false: colors.light, true: colors.red + '80' }}
            thumbColor={autoSelect ? colors.red : colors.white}
            focusable={false}
          />
        </FP>
      </View>

      {/* Default language selection */}
      {autoSelect && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default Subtitle Language</Text>
          <Text style={styles.sectionDescription}>
            Choose your preferred subtitle language. This will be automatically selected when available.
          </Text>

          {selectedLanguage && (
            <View style={styles.selectedLanguageContainer}>
              <Text style={styles.selectedLanguageLabel}>Selected Language:</Text>
              <View style={styles.selectedLanguageInfo}>
                <Text style={styles.selectedLanguageFlag}>
                  {getSelectedLanguageInfo()?.flag}
                </Text>
                <Text style={styles.selectedLanguageName}>
                  {getSelectedLanguageInfo()?.name}
                </Text>
                <FP
                  onPress={() => setSelectedLanguage(undefined)}
                  style={styles.clearButton}
                  focusedStyle={styles.clearButtonFocused}
                  accessibilityLabel="Clear selected language"
                >
                  <Icon name="close" size={16} color={colors.white} />
                </FP>
              </View>
            </View>
          )}

          <View style={styles.languageGrid}>
            {COMMON_LANGUAGES.map((language) => (
              <FP
                key={language.code}
                style={[
                  styles.languageItem,
                  selectedLanguage === language.code && styles.selectedLanguageItem,
                ]}
                focusedStyle={styles.languageItemFocused}
                onPress={() => handleLanguageSelect(language.code)}
                accessibilityLabel={`${language.name} subtitle language`}
              >
                <Text style={styles.languageFlag}>{language.flag}</Text>
                <Text style={[
                  styles.languageName,
                  selectedLanguage === language.code && styles.selectedLanguageName,
                ]}>
                  {language.name}
                </Text>
                <Text style={styles.languageCode}>({language.code})</Text>
              </FP>
            ))}
          </View>
        </View>
      )}

      {/* Info section */}
      <View style={styles.section}>
        <View style={styles.infoContainer}>
          <Icon name="information" size={20} color={colors.red} />
          <Text style={styles.infoText}>
            These settings will automatically select subtitles when you play videos. 
            You can always change subtitles manually using the CC button in the video player.
          </Text>
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actionButtons}>
        <FP
          style={styles.resetButton}
          focusedStyle={styles.resetButtonFocused}
          onPress={handleReset}
          accessibilityLabel="Reset subtitle settings to default"
        >
          <Text style={styles.resetButtonText}>Reset to Default</Text>
        </FP>

        <FP
          style={[
            styles.saveButton,
            !hasChanges && styles.saveButtonDisabled,
          ]}
          focusedStyle={styles.saveButtonFocused}
          onPress={handleSave}
          disabled={!hasChanges}
          accessibilityLabel="Save subtitle changes"
        >
          <Text style={[
            styles.saveButtonText,
            !hasChanges && styles.saveButtonTextDisabled,
          ]}>
            Save Changes
          </Text>
        </FP>
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
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: colors.light,
    marginBottom: 16,
    lineHeight: 20,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: colors.dark,
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  settingRowFocused: {
    borderColor: '#E50914',
    backgroundColor: 'rgba(229,9,20,0.12)',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 12,
    color: colors.light,
    lineHeight: 16,
  },
  selectedLanguageContainer: {
    marginBottom: 16,
  },
  selectedLanguageLabel: {
    fontSize: 14,
    color: colors.light,
    marginBottom: 8,
  },
  selectedLanguageInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.red + '20',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.red,
  },
  selectedLanguageFlag: {
    fontSize: 20,
    marginRight: 8,
  },
  selectedLanguageName: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
  },
  clearButton: {
    backgroundColor: colors.red,
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  clearButtonFocused: {
    borderColor: '#FFFFFF',
    backgroundColor: '#FF1A1A',
  },
  languageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  languageItem: {
    width: '48%',
    backgroundColor: colors.dark,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  languageItemFocused: {
    borderColor: '#E50914',
    backgroundColor: 'rgba(229,9,20,0.18)',
  },
  selectedLanguageItem: {
    backgroundColor: colors.red + '20',
    borderColor: colors.red,
  },
  languageFlag: {
    fontSize: 24,
    marginBottom: 4,
  },
  languageName: {
    color: colors.white,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  languageCode: {
    color: colors.light,
    fontSize: 10,
    marginTop: 2,
  },
  infoContainer: {
    flexDirection: 'row',
    backgroundColor: colors.dark,
    padding: 16,
    borderRadius: 8,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    color: colors.light,
    fontSize: 12,
    lineHeight: 16,
    marginLeft: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  resetButton: {
    flex: 0.45,
    backgroundColor: colors.dark,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.light,
  },
  resetButtonFocused: {
    borderColor: '#E50914',
    backgroundColor: 'rgba(229,9,20,0.12)',
  },
  resetButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    flex: 0.45,
    backgroundColor: colors.red,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  saveButtonFocused: {
    borderColor: '#FFFFFF',
    backgroundColor: '#FF1A1A',
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

export default SubtitleSettings;