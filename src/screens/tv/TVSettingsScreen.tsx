import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Alert,
  Modal,
} from 'react-native';
import { useAppContext } from '../../context/AppContext';
import { AppActionType } from '../../types';
import { StorageService } from '../../services/StorageService';
import {
  SubtitleSettings,
  SubtitleStyleSettings,
  UpdateModal,
} from '../../components';
import { version as appVersion } from '../../../package.json';
import { COLORS } from '../../utils/constants';

// ─────────────────────────────────────────────────────────────────
// Section IDs
// ─────────────────────────────────────────────────────────────────
type SectionId = 'playback' | 'subtitles' | 'storage' | 'content' | 'about';

const SECTIONS: { id: SectionId; label: string }[] = [
  //{ id: 'playback', label: 'Playback' },
  { id: 'subtitles', label: 'Subtitles' },
  { id: 'storage', label: 'Storage' },
  { id: 'content', label: 'My Content' },
  { id: 'about', label: 'About' },
];

// ─────────────────────────────────────────────────────────────────
// Focusable sub-components
// ─────────────────────────────────────────────────────────────────
const SidebarItem: React.FC<{
  section: { id: SectionId; label: string };
  isActive: boolean;
  hasTVPreferredFocus?: boolean;
  onPress: (id: SectionId) => void;
}> = ({ section, isActive, hasTVPreferredFocus, onPress }) => {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      style={[
        styles.sidebarItem,
        isActive && styles.sidebarItemActive,
        focused && styles.sidebarItemFocused,
      ]}
      onPress={() => onPress(section.id)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      // @ts-ignore
      hasTVPreferredFocus={hasTVPreferredFocus}
      focusable={true}
      accessible={true}
      accessibilityLabel={`${section.label} section`}
    >
      {isActive && <View style={styles.sidebarActiveBar} />}
      <Text style={[styles.sidebarLabel, isActive && styles.sidebarLabelActive]}>
        {section.label}
      </Text>
    </Pressable>
  );
};

const ActionButton: React.FC<{
  label: string;
  onPress: () => void;
  style?: object;
  textStyle?: object;
  accessibilityLabel?: string;
}> = ({ label, onPress, style, textStyle, accessibilityLabel }) => {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      style={[
        styles.actionBtn,
        style,
        focused && styles.actionBtnFocused,
      ]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      focusable={true}
      accessible={true}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text style={[styles.actionBtnText, textStyle]}>{label}</Text>
    </Pressable>
  );
};

// ─────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────
interface TVSettingsScreenProps {}

export const TVSettingsScreen: React.FC<TVSettingsScreenProps> = () => {
  const { state, dispatch } = useAppContext();
  const [activeSection, setActiveSection] = useState<SectionId>('subtitles');
  const [storageInfo, setStorageInfo] = useState<{
    keys: string[];
    totalSize: number;
  }>({ keys: [], totalSize: 0 });
  const [showSubtitleSettings, setShowSubtitleSettings] = useState(false);
  const [showSubtitleStyleSettings, setShowSubtitleStyleSettings] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showLikedContent, setShowLikedContent] = useState(false);

  useEffect(() => {
    loadStorageInfo();
  }, []);

  const loadStorageInfo = async () => {
    try {
      const info = await StorageService.getStorageInfo();
      setStorageInfo(info);
    } catch {
      /* ignore */
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // ── Preference handlers ──────────────────────────────────────────────────
  const handleAutoplayToggle = async (value: boolean) => {
    try {
      dispatch({
        type: AppActionType.SET_USER_PREFERENCES,
        payload: { ...state.user.preferences, autoplay: value },
      });
    } catch {
      Alert.alert('Error', 'Failed to update autoplay preference');
    }
  };

  const handlePiPToggle = async (value: boolean) => {
    try {
      dispatch({
        type: AppActionType.SET_USER_PREFERENCES,
        payload: { ...state.user.preferences, pictureInPicture: value },
      });
    } catch {
      Alert.alert('Error', 'Failed to update Picture-in-Picture preference');
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'This will clear all cached data including liked content and watch progress. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await StorageService.clearAllData();
              dispatch({
                type: AppActionType.SET_USER_PREFERENCES,
                payload: {
                  likedMovies: [],
                  likedTVShows: [],
                  continueWatching: [],
                  theme: 'dark',
                  autoplay: true,
                  pictureInPicture: true,
                },
              });
              await loadStorageInfo();
              Alert.alert('Success', 'Cache cleared successfully');
            } catch {
              Alert.alert('Error', 'Failed to clear cache');
            }
          },
        },
      ],
    );
  };

  const handleResetPreferences = () => {
    Alert.alert(
      'Reset Preferences',
      'This will reset all preferences to their default values. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              dispatch({
                type: AppActionType.SET_USER_PREFERENCES,
                payload: {
                  likedMovies: [],
                  likedTVShows: [],
                  continueWatching: [],
                  theme: 'dark' as const,
                  autoplay: true,
                  pictureInPicture: true,
                },
              });
              Alert.alert('Success', 'Preferences reset successfully');
            } catch {
              Alert.alert('Error', 'Failed to reset preferences');
            }
          },
        },
      ],
    );
  };

  const handleRemoveLiked = (id: number, type: 'movie' | 'tv') => {
    Alert.alert(
      'Remove from Liked',
      `Remove this ${type === 'movie' ? 'movie' : 'TV show'} from your liked list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            dispatch({
              type: AppActionType.REMOVE_LIKED_CONTENT,
              payload: { id, contentType: type },
            }),
        },
      ],
    );
  };

  // ── Section renderers ────────────────────────────────────────────────────
  const renderPlayback = () => (
    <View style={styles.sectionContent}>
      <Text style={styles.sectionTitle}>Playback Preferences</Text>
      <SettingRow
        label="Autoplay"
        description="Automatically play videos when selected"
        onPress={() => handleAutoplayToggle(!state.user.preferences.autoplay)}
      >
        <Switch
          value={state.user.preferences.autoplay}
          onValueChange={handleAutoplayToggle}
          trackColor={{ false: '#555555', true: COLORS.NETFLIX_RED }}
          thumbColor="#FFFFFF"
          focusable={false}
        />
      </SettingRow>
      <SettingRow
        label="Picture-in-Picture"
        description="Continue playing in a small window when you leave the app"
        onPress={() => handlePiPToggle(!state.user.preferences.pictureInPicture)}
      >
        <Switch
          value={state.user.preferences.pictureInPicture}
          onValueChange={handlePiPToggle}
          trackColor={{ false: '#555555', true: COLORS.NETFLIX_RED }}
          thumbColor="#FFFFFF"
          focusable={false}
        />
      </SettingRow>
    </View>
  );

  const renderSubtitles = () => (
    <View style={styles.sectionContent}>
      <Text style={styles.sectionTitle}>Subtitle Settings</Text>
      <SettingRow
        label="Subtitle Preferences"
        description={
          state.user.preferences.autoSelectSubtitles
            ? `Auto-select: ${state.user.preferences.defaultSubtitleLanguage?.toUpperCase() || 'Not set'}`
            : 'Auto-select disabled'
        }
        onPress={() => setShowSubtitleSettings(true)}
        showChevron
      />
      {/* <SettingRow
        label="Subtitle Appearance"
        description="Customize font size, colour, background and position"
        onPress={() => setShowSubtitleStyleSettings(true)}
        showChevron
      /> */}
    </View>
  );

  const renderStorage = () => (
    <View style={styles.sectionContent}>
      <Text style={styles.sectionTitle}>Storage</Text>
      <InfoRow
        label="App Cache Size"
        value={formatBytes(storageInfo.totalSize)}
      />
      <ActionButton
        label="Clear Cache"
        onPress={handleClearCache}
        accessibilityLabel="Clear cache"
      />
      <ActionButton
        label="Reset Preferences"
        onPress={handleResetPreferences}
        style={styles.secondaryBtn}
        textStyle={styles.secondaryBtnText}
        accessibilityLabel="Reset preferences"
      />
    </View>
  );

  const renderContent = () => (
    <View style={styles.sectionContent}>
      <Text style={styles.sectionTitle}>My Content</Text>
      <InfoRow
        label="Liked Movies"
        value={String(state.user.preferences.likedMovies.length)}
      />
      <InfoRow
        label="Liked TV Shows"
        value={String(state.user.preferences.likedTVShows.length)}
      />
      <InfoRow
        label="Continue Watching"
        value={String(state.user.continueWatching.length)}
      />
      <ActionButton
        label={showLikedContent ? 'Hide Liked Content' : 'Manage Liked Content'}
        onPress={() => setShowLikedContent(v => !v)}
        style={styles.secondaryBtn}
        textStyle={styles.secondaryBtnText}
        accessibilityLabel="Manage liked content"
      />
      {showLikedContent && (
        <View style={styles.likedList}>
          {state.user.preferences.likedMovies.length === 0 &&
          state.user.preferences.likedTVShows.length === 0 ? (
            <Text style={styles.emptyText}>
              No liked content yet. Explore and like some movies or TV shows!
            </Text>
          ) : (
            <>
              {state.user.preferences.likedMovies.map(id => (
                <View key={`m-${id}`} style={styles.likedRow}>
                  <Text style={styles.likedId}>Movie #{id}</Text>
                  <RemoveButton onPress={() => handleRemoveLiked(id, 'movie')} />
                </View>
              ))}
              {state.user.preferences.likedTVShows.map(id => (
                <View key={`t-${id}`} style={styles.likedRow}>
                  <Text style={styles.likedId}>TV Show #{id}</Text>
                  <RemoveButton onPress={() => handleRemoveLiked(id, 'tv')} />
                </View>
              ))}
            </>
          )}
        </View>
      )}
    </View>
  );

  const renderAbout = () => (
    <View style={styles.sectionContent}>
      <Text style={styles.sectionTitle}>App Information</Text>
      <InfoRow label="Version" value={appVersion} />
      <InfoRow label="Data Source" value="The Movie Database (TMDB)" />
      <ActionButton
        label="Check for Updates"
        onPress={() => setShowUpdateModal(true)}
        style={styles.updateBtn}
        accessibilityLabel="Check for updates"
      />
    </View>
  );

  const renderActiveSection = () => {
    switch (activeSection) {
      //case 'playback': return renderPlayback();
      case 'subtitles': return renderSubtitles();
      case 'storage': return renderStorage();
      case 'content': return renderContent();
      case 'about': return renderAbout();
    }
  };

  return (
    <View style={styles.container}>
      {/* Left: Section list */}
      <View style={styles.sidebarLeft}>
        <Text style={styles.pageTitle}>Settings</Text>
        {SECTIONS.map((s, idx) => (
          <SidebarItem
            key={s.id}
            section={s}
            isActive={activeSection === s.id}
            hasTVPreferredFocus={idx === 0}
            onPress={setActiveSection}
          />
        ))}
      </View>

      {/* Right: Section content */}
      <ScrollView
        style={styles.body}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.bodyContent}
      >
        {renderActiveSection()}
      </ScrollView>

      {/* Modals */}
      <Modal
        visible={showSubtitleSettings}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSubtitleSettings(false)}
      >
        <SubtitleSettings onClose={() => setShowSubtitleSettings(false)} />
      </Modal>
      <Modal
        visible={showSubtitleStyleSettings}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSubtitleStyleSettings(false)}
      >
        <SubtitleStyleSettings
          onClose={() => setShowSubtitleStyleSettings(false)}
        />
      </Modal>
      <UpdateModal
        visible={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        isDarkTheme={true}
      />
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────
// Helper sub-components
// ─────────────────────────────────────────────────────────────────
interface SettingRowProps {
  label: string;
  description?: string;
  children?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
}

const SettingRow: React.FC<SettingRowProps> = ({
  label,
  description,
  children,
  onPress,
  showChevron,
}) => {
  const [focused, setFocused] = useState(false);
  const isInteractive = !!(onPress || children);
  return (
    <Pressable
      style={[
        styles.settingRow,
        focused && styles.settingRowFocused,
      ]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={!isInteractive}
      focusable={isInteractive}
      accessible={true}
      accessibilityLabel={label}
    >
      <View style={styles.settingRowInfo}>
        <Text style={styles.settingLabel}>{label}</Text>
        {description ? (
          <Text style={styles.settingDesc}>{description}</Text>
        ) : null}
      </View>
      {children ?? (showChevron ? <Text style={styles.chevron}>›</Text> : null)}
    </Pressable>
  );
};

const InfoRow: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const RemoveButton: React.FC<{ onPress: () => void }> = ({ onPress }) => {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      style={[styles.removeBtn, focused && styles.removeBtnFocused]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      focusable={true}
      accessible={true}
    >
      <Text style={styles.removeBtnText}>✕</Text>
    </Pressable>
  );
};

// ─────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.NETFLIX_BLACK,
    flexDirection: 'row',
  },
  sidebarLeft: {
    width: 260,
    backgroundColor: '#0D0D0D',
    borderRightWidth: 1,
    borderRightColor: '#1E1E1E',
    paddingTop: 40,
    paddingHorizontal: 20,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.NETFLIX_WHITE,
    marginBottom: 28,
    paddingLeft: 8,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
    position: 'relative',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  sidebarItemActive: {
    backgroundColor: 'rgba(229,9,20,0.1)',
  },
  sidebarItemFocused: {
    borderColor: '#E50914',
    backgroundColor: 'rgba(229,9,20,0.18)',
  },
  sidebarActiveBar: {
    position: 'absolute',
    left: -4,
    top: '20%',
    bottom: '20%',
    width: 3,
    backgroundColor: COLORS.NETFLIX_RED,
    borderRadius: 2,
  },
  sidebarLabel: {
    fontSize: 17,
    color: '#888888',
    fontWeight: '500',
    marginLeft: 8,
  },
  sidebarLabelActive: {
    color: COLORS.NETFLIX_RED,
    fontWeight: '700',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 48,
    paddingTop: 40,
    paddingBottom: 60,
  },
  sectionContent: {},
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.NETFLIX_WHITE,
    marginBottom: 24,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    marginVertical: 2,
  },
  settingRowFocused: {
    borderColor: '#E50914',
    backgroundColor: 'rgba(229,9,20,0.10)',
  },
  settingRowInfo: {
    flex: 1,
    marginRight: 20,
  },
  settingLabel: {
    fontSize: 18,
    fontWeight: '500',
    color: COLORS.NETFLIX_WHITE,
    marginBottom: 4,
  },
  settingDesc: {
    fontSize: 14,
    color: COLORS.NETFLIX_LIGHT_GRAY,
    lineHeight: 20,
  },
  chevron: {
    fontSize: 26,
    color: COLORS.NETFLIX_LIGHT_GRAY,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  infoLabel: {
    fontSize: 17,
    color: COLORS.NETFLIX_WHITE,
  },
  infoValue: {
    fontSize: 17,
    color: COLORS.NETFLIX_LIGHT_GRAY,
    fontWeight: '500',
  },
  actionBtn: {
    backgroundColor: COLORS.NETFLIX_RED,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  actionBtnFocused: {
    borderColor: '#FFFFFF',
    backgroundColor: '#FF1A1A',
  },
  actionBtnText: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryBtn: {
    backgroundColor: 'transparent',
    borderColor: '#444444',
  },
  secondaryBtnText: {
    color: COLORS.NETFLIX_WHITE,
  },
  updateBtn: {
    backgroundColor: '#2E7D32',
  },
  likedList: {
    marginTop: 16,
    backgroundColor: '#0D0D0D',
    borderRadius: 8,
    padding: 16,
  },
  likedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  likedId: {
    fontSize: 16,
    color: COLORS.NETFLIX_LIGHT_GRAY,
  },
  removeBtn: {
    backgroundColor: COLORS.NETFLIX_RED,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  removeBtnFocused: {
    borderColor: '#FFFFFF',
    backgroundColor: '#FF1A1A',
  },
  removeBtnText: {
    color: COLORS.NETFLIX_WHITE,
    fontWeight: 'bold',
    fontSize: 14,
  },
  emptyText: {
    color: COLORS.NETFLIX_LIGHT_GRAY,
    fontSize: 15,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
});

export default TVSettingsScreen;
