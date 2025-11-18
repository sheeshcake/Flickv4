import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { searchSubtitles } from 'wyzie-lib';
import { colors } from '../constants/theme';
import { SubtitleTrack, WyzieSubtitleData } from '../types';

interface SubtitleSelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelectSubtitle: (subtitle: SubtitleTrack | null) => void;
  selectedSubtitle?: SubtitleTrack | null;
  contentId?: number; // TMDB ID
  contentType?: 'movie' | 'tv';
  season?: number;
  episode?: number;
  title?: string;
  prefetchedSubtitles?: SubtitleTrack[];
}

const SubtitleSelector: React.FC<SubtitleSelectorProps> = ({
  visible,
  onClose,
  onSelectSubtitle,
  selectedSubtitle,
  contentId,
  contentType,
  season,
  episode,
  title,
  prefetchedSubtitles,
}) => {
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const fetchWyzieSubtitles = useCallback(async () => {
    if (!contentId) {
      console.warn('No content ID provided for subtitle search');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('=== FETCHING WYZIE SUBTITLES ===');
      console.log('Content ID:', contentId);
      console.log('Content Type:', contentType);
      console.log('Season:', season);
      console.log('Episode:', episode);

      // Validate content ID is a number
      if (typeof contentId !== 'number' || contentId <= 0) {
        throw new Error('Invalid content ID provided');
      }

      // Create minimal params first, then add optional ones
      const params: any = {
        tmdb_id: contentId,
      };

      // Add season and episode for TV shows (only if both are valid)
      if (contentType === 'tv' && season && episode && season > 0 && episode > 0) {
        params.season = season;
        params.episode = episode;
      }

      console.log('Wyzie search params:', params);

      // Try with current params first
      let wyzieSubtitles: WyzieSubtitleData[] = [];
      
      try {
        wyzieSubtitles = await searchSubtitles(params);
      } catch (firstError) {
        console.warn('First attempt failed:', firstError);
        
        // If TV show with season/episode failed, try without them
        if (contentType === 'tv' && params.season && params.episode) {
          console.log('Retrying without season/episode...');
          const fallbackParams = { tmdb_id: contentId };
          wyzieSubtitles = await searchSubtitles(fallbackParams);
        } else {
          throw firstError; // Re-throw if not a TV show or already simplified
        }
      }
      
      console.log('Fetched subtitles count:', wyzieSubtitles.length);
      
      if (wyzieSubtitles.length === 0) {
        setError('No subtitles found for this content.');
        return;
      }

      console.log('First subtitle sample:', wyzieSubtitles[0]);

      // Convert Wyzie subtitle data to our subtitle track format
      const convertedSubtitles: SubtitleTrack[] = wyzieSubtitles.map((sub, index) => ({
        id: `wyzie_${sub.id}_${index}`,
        title: `${sub.display} (${sub.source ? 'Wyzie' : 'Unknown'})`,
        language: sub.language,
        url: sub.url,
        format: sub.format || 'srt', // Default to SRT if format not specified
        encoding: sub.encoding,
        isHearingImpaired: sub.isHearingImpaired,
        flagUrl: sub.flagUrl,
        source: 'wyzie',
        originalUrl: sub.url, // Store original URL for conversion
        isConverted: false, // Track conversion status
      }));

      console.log('Converted subtitles:', convertedSubtitles.length);
      
      setSubtitles(convertedSubtitles);
    } catch (err) {
      console.error('Error fetching subtitles:', err);
      
      // Provide more specific error messages based on error type
      let errorMessage = 'Failed to fetch subtitles. ';
      
      if (err instanceof Error) {
        if (err.message.includes('400')) {
          errorMessage += 'Invalid content ID or parameters. This content may not have subtitles available.';
        } else if (err.message.includes('404')) {
          errorMessage += 'No subtitles found for this content.';
        } else if (err.message.includes('500')) {
          errorMessage += 'Subtitle service temporarily unavailable.';
        } else if (err.message.includes('network') || err.message.includes('fetch')) {
          errorMessage += 'Network connection error. Please check your internet connection.';
        } else if (err.message.includes('Invalid content ID')) {
          errorMessage += err.message;
        } else {
          errorMessage += err.message;
        }
      } else {
        errorMessage += 'Unknown error occurred.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [contentId, contentType, season, episode]);

  // Fetch subtitles from Wyzie when modal opens (or use prefetched)
  useEffect(() => {
    if (visible) {
      if (prefetchedSubtitles && prefetchedSubtitles.length > 0) {
        // Use prefetched subtitles if available
        setSubtitles(prefetchedSubtitles);
        setLoading(false);
      } else if (contentId) {
        // Fetch subtitles if not prefetched
        fetchWyzieSubtitles();
      }
    }
  }, [visible, contentId, season, episode, fetchWyzieSubtitles, prefetchedSubtitles]);

  const handleAddCustomSubtitle = () => {
    if (!customUrl.trim()) {
      Alert.alert('Error', 'Please enter a valid subtitle URL');
      return;
    }

    // Basic URL validation
    if (!customUrl.startsWith('http://') && !customUrl.startsWith('https://')) {
      Alert.alert('Error', 'Please enter a valid HTTP/HTTPS URL');
      return;
    }

    const customSubtitle: SubtitleTrack = {
      id: `custom_${Date.now()}`,
      title: 'Custom Subtitle',
      language: 'unknown',
      url: customUrl,
      format: 'srt', // Assume SRT for custom subtitles
      source: 'custom',
      originalUrl: customUrl,
      isConverted: false,
    };

    setSubtitles(prev => [...prev, customSubtitle]);
    setCustomUrl('');
    setShowCustomInput(false);
  };

  const handleSelectSubtitle = async (subtitle: SubtitleTrack) => {
    onSelectSubtitle(subtitle);
    onClose();
  };

  const handleDisableSubtitles = () => {
    onSelectSubtitle(null);
    onClose();
  };

  const renderSubtitleItem = ({ item }: { item: SubtitleTrack }) => {
    return (
      <TouchableOpacity
        style={[
          styles.subtitleItem,
          selectedSubtitle?.id === item.id && styles.selectedItem,
        ]}
        onPress={() => handleSelectSubtitle(item)}
      >
        <View style={styles.subtitleInfo}>
          <View style={styles.titleRow}>
            <Text style={styles.subtitleTitle}>{item.title}</Text>
            {item.isConverted && (
              <View style={styles.convertedBadge}>
                <Text style={styles.convertedBadgeText}>VTT</Text>
              </View>
            )}
          </View>
          <View style={styles.subtitleMeta}>
            <Text style={styles.subtitleLanguage}>
              Language: {item.language.toUpperCase()}
            </Text>
            {item.isHearingImpaired && (
              <Text style={styles.hearingImpaired}> • HI</Text>
            )}
            <Text style={styles.subtitleSource}> • {item.source}</Text>
            <Text style={styles.subtitleFormat}> • {item.format.toUpperCase()}</Text>
          </View>
        </View>
        {selectedSubtitle?.id === item.id && (
          <Icon name="check" size={20} color={colors.red} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>
            Select Subtitles
            {title && ` - ${title}`}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Icon name="close" size={24} color={colors.white} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.red} />
            <Text style={styles.loadingText}>Fetching subtitles...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Icon name="subtitle-off" size={48} color={colors.light} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={fetchWyzieSubtitles}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
            <View style={styles.errorDivider}>
              <Text style={styles.errorDividerText}>or</Text>
            </View>
            <TouchableOpacity
              style={styles.addCustomButton}
              onPress={() => setShowCustomInput(true)}
            >
              <Icon name="plus" size={20} color={colors.red} />
              <Text style={styles.addCustomButtonText}>Add Custom Subtitle</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.content}>
            {/* Disable subtitles option */}
            <TouchableOpacity
              style={[
                styles.subtitleItem,
                !selectedSubtitle && styles.selectedItem,
              ]}
              onPress={handleDisableSubtitles}
            >
              <View style={styles.subtitleInfo}>
                <Text style={styles.subtitleTitle}>Disable Subtitles</Text>
              </View>
              {!selectedSubtitle && (
                <Icon name="check" size={20} color={colors.red} />
              )}
            </TouchableOpacity>

            {/* Subtitle list */}
            <FlatList
              data={subtitles}
              renderItem={renderSubtitleItem}
              keyExtractor={(item) => item.id}
              style={styles.subtitleList}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                subtitles.length > 0 ? (
                  <View style={styles.listHeader}>
                    <Text style={styles.listHeaderText}>
                      {subtitles.length} subtitle(s) available
                    </Text>
                  </View>
                ) : null
              }
            />

            {/* Custom subtitle input */}
            {showCustomInput ? (
              <View style={styles.customInputContainer}>
                <TextInput
                  style={styles.customInput}
                  placeholder="Enter subtitle URL (http://...)"
                  placeholderTextColor={colors.light}
                  value={customUrl}
                  onChangeText={setCustomUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.customInputButtons}>
                  <TouchableOpacity
                    style={styles.customInputButton}
                    onPress={() => setShowCustomInput(false)}
                  >
                    <Text style={styles.customInputButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.customInputButton, styles.addButton]}
                    onPress={handleAddCustomSubtitle}
                  >
                    <Text style={styles.addButtonText}>Add</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addCustomButton}
                onPress={() => setShowCustomInput(true)}
              >
                <Icon name="plus" size={20} color={colors.red} />
                <Text style={styles.addCustomButtonText}>Add Custom Subtitle</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: colors.light,
  },
  title: {
    color: colors.white,
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.white,
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: colors.white,
    textAlign: 'center',
    marginBottom: 20,
    fontSize: 16,
  },
  retryButton: {
    backgroundColor: colors.red,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: colors.white,
    fontWeight: 'bold',
  },
  errorDivider: {
    alignItems: 'center',
    marginVertical: 16,
  },
  errorDividerText: {
    color: colors.light,
    fontSize: 14,
    fontStyle: 'italic',
  },
  subtitleList: {
    flex: 1,
  },
  listHeader: {
    padding: 16,
    backgroundColor: colors.dark + '40',
    borderRadius: 8,
    marginBottom: 16,
  },
  listHeaderText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  subtitleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    marginBottom: 8,
    backgroundColor: colors.dark,
    borderRadius: 8,
  },
  selectedItem: {
    backgroundColor: colors.red + '20',
    borderWidth: 1,
    borderColor: colors.red,
  },
  subtitleInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  subtitleTitle: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
  },
  convertedBadge: {
    backgroundColor: colors.red,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  convertedBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: 'bold',
  },
  subtitleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subtitleLanguage: {
    color: colors.light,
    fontSize: 12,
  },
  hearingImpaired: {
    color: colors.red,
    fontSize: 12,
    fontWeight: 'bold',
  },
  subtitleSource: {
    color: colors.light,
    fontSize: 12,
    textTransform: 'capitalize',
  },
  subtitleFormat: {
    color: colors.red,
    fontSize: 12,
    fontWeight: 'bold',
  },
  addCustomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    marginTop: 16,
    backgroundColor: colors.dark,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.red,
    borderStyle: 'dashed',
  },
  addCustomButtonText: {
    color: colors.red,
    marginLeft: 8,
    fontSize: 16,
    fontWeight: 'bold',
  },
  customInputContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: colors.dark,
    borderRadius: 8,
  },
  customInput: {
    backgroundColor: colors.black,
    color: colors.white,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.light,
    marginBottom: 12,
  },
  customInputButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  customInputButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 4,
    backgroundColor: colors.light,
  },
  customInputButtonText: {
    color: colors.black,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: colors.red,
  },
  addButtonText: {
    color: colors.white,
    textAlign: 'center',
    fontWeight: 'bold',
  },
});

export default SubtitleSelector;