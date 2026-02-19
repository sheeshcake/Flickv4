/**
 * TV Subtitle Selector Component
 * Full-screen subtitle picker optimized for TV with D-pad remote navigation
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { searchSubtitles } from 'wyzie-lib';
import { SubtitleTrack, WyzieSubtitleData } from '../../types';
import { TVButton } from './TVButton';

const TV_FOCUS_COLOR = '#E50914';

interface TVSubtitleSelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelectSubtitle: (subtitle: SubtitleTrack | null) => void;
  selectedSubtitle?: SubtitleTrack | null;
  contentId?: number;
  contentType?: 'movie' | 'tv';
  season?: number;
  episode?: number;
  title?: string;
  prefetchedSubtitles?: SubtitleTrack[];
}

const DISABLE_ITEM: SubtitleTrack = {
  id: '__disable__',
  title: 'Disable Subtitles',
  language: '',
  url: '',
  format: 'srt',
};

export const TVSubtitleSelector: React.FC<TVSubtitleSelectorProps> = ({
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
  const [focusedId, setFocusedId] = useState<string>('__disable__');
  const listRef = useRef<FlatList>(null);

  // Fetch subtitles
  const fetchSubtitles = useCallback(async () => {
    if (!contentId) return;

    setLoading(true);
    setError(null);

    try {
      const params: any = { tmdb_id: contentId };
      if (contentType === 'tv' && season && episode && season > 0 && episode > 0) {
        params.season = season;
        params.episode = episode;
      }

      let wyzieSubtitles: WyzieSubtitleData[] = [];
      try {
        wyzieSubtitles = await searchSubtitles(params);
      } catch {
        if (contentType === 'tv' && params.season) {
          wyzieSubtitles = await searchSubtitles({ tmdb_id: contentId });
        } else {
          throw new Error('Failed to fetch subtitles');
        }
      }

      if (wyzieSubtitles.length === 0) {
        setError('No subtitles found for this content.');
        return;
      }

      const converted: SubtitleTrack[] = wyzieSubtitles.map((sub, index) => ({
        id: `wyzie_${sub.id}_${index}`,
        title: `${sub.display}`,
        language: sub.language,
        url: sub.url,
        format: sub.format || 'srt',
        encoding: sub.encoding,
        isHearingImpaired: sub.isHearingImpaired,
        flagUrl: sub.flagUrl,
        source: 'wyzie',
        originalUrl: sub.url,
        isConverted: false,
      }));

      setSubtitles(converted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch subtitles');
    } finally {
      setLoading(false);
    }
  }, [contentId, contentType, season, episode]);

  // Load subtitles when visible
  useEffect(() => {
    if (!visible) return;

    if (prefetchedSubtitles && prefetchedSubtitles.length > 0) {
      setSubtitles(prefetchedSubtitles);
      setLoading(false);
    } else if (contentId) {
      fetchSubtitles();
    }

    // Reset focus to disable item when opened
    setFocusedId('__disable__');
  }, [visible, contentId, prefetchedSubtitles, fetchSubtitles]);

  // Handle hardware back press
  useEffect(() => {
    if (!visible) return;

    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => handler.remove();
  }, [visible, onClose]);

  const handleSelect = useCallback(
    (subtitle: SubtitleTrack | null) => {
      onSelectSubtitle(subtitle);
      onClose();
    },
    [onSelectSubtitle, onClose],
  );

  const allItems: SubtitleTrack[] = [DISABLE_ITEM, ...subtitles];

  const renderItem = ({ item, index }: { item: SubtitleTrack; index: number }) => {
    const isDisableItem = item.id === '__disable__';
    const isSelected = isDisableItem ? !selectedSubtitle : selectedSubtitle?.id === item.id;
    const isFocused = focusedId === item.id;

    return (
      <Pressable
        style={[
          styles.item,
          isSelected && styles.itemSelected,
          isFocused && styles.itemFocused,
        ]}
        onPress={() => handleSelect(isDisableItem ? null : item)}
        onFocus={() => setFocusedId(item.id)}
        // @ts-ignore - TV prop
        hasTVPreferredFocus={index === 0}
      >
        <View style={styles.itemLeft}>
          <Icon
            name={isDisableItem ? 'subtitles-outline' : 'subtitles'}
            size={28}
            color={isFocused ? '#FFFFFF' : isSelected ? TV_FOCUS_COLOR : '#AAAAAA'}
            style={styles.itemIcon}
          />
          <View style={styles.itemTextContainer}>
            <Text
              style={[
                styles.itemTitle,
                isFocused && styles.itemTitleFocused,
                isSelected && styles.itemTitleSelected,
              ]}
              numberOfLines={1}
            >
              {isDisableItem ? 'Disable Subtitles' : item.title}
            </Text>
            {!isDisableItem && (
              <View style={styles.itemMeta}>
                <Text style={styles.metaText}>{item.language.toUpperCase()}</Text>
                {item.isHearingImpaired && (
                  <View style={styles.hiBadge}>
                    <Text style={styles.hiBadgeText}>HI</Text>
                  </View>
                )}
                <Text style={styles.metaDot}>•</Text>
                <Text style={styles.metaText}>{(item.format || 'SRT').toUpperCase()}</Text>
                {item.source && (
                  <>
                    <Text style={styles.metaDot}>•</Text>
                    <Text style={styles.metaText}>{item.source}</Text>
                  </>
                )}
              </View>
            )}
            {isDisableItem && (
              <Text style={styles.itemSubtitle}>No subtitles will be shown</Text>
            )}
          </View>
        </View>
        {isSelected && (
          <Icon name="check-circle" size={28} color={TV_FOCUS_COLOR} />
        )}
      </Pressable>
    );
  };

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      {/* Side panel */}
      <View style={styles.panel}>
        {/* Header */}
        <View style={styles.header}>
          <Icon name="subtitles" size={32} color={TV_FOCUS_COLOR} />
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Subtitles</Text>
            {title && (
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {title}
              </Text>
            )}
          </View>
          <TVButton
            title="Close"
            onPress={onClose}
            variant="ghost"
            size="small"
            icon="close"
          />
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={TV_FOCUS_COLOR} />
            <Text style={styles.statusText}>Fetching subtitles...</Text>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Icon name="alert-circle-outline" size={48} color="#888888" />
            <Text style={styles.errorText}>{error}</Text>
            <TVButton
              title="Retry"
              onPress={fetchSubtitles}
              variant="outline"
              size="medium"
              hasTVPreferredFocus
              style={styles.retryButton}
            />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={allItems}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              subtitles.length > 0 ? (
                <Text style={styles.countText}>
                  {subtitles.length} subtitle{subtitles.length !== 1 ? 's' : ''} available
                </Text>
              ) : null
            }
          />
        )}

        {/* D-pad hint */}
        <View style={styles.hintsRow}>
          <Text style={styles.hintText}>▲ ▼ Navigate  |  Select: Choose  |  Back: Close</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  panel: {
    width: '42%',
    backgroundColor: '#111111',
    borderLeftWidth: 2,
    borderLeftColor: TV_FOCUS_COLOR,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#AAAAAA',
    fontSize: 14,
    marginTop: 2,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 8,
  },
  countText: {
    color: '#888888',
    fontSize: 14,
    paddingBottom: 12,
    paddingHorizontal: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2,
    borderColor: 'transparent',
    marginBottom: 6,
  },
  itemSelected: {
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
    borderColor: TV_FOCUS_COLOR,
  },
  itemFocused: {
    backgroundColor: TV_FOCUS_COLOR,
    borderColor: TV_FOCUS_COLOR,
    transform: [{ scale: 1.02 }],
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemIcon: {
    marginRight: 14,
  },
  itemTextContainer: {
    flex: 1,
  },
  itemTitle: {
    color: '#CCCCCC',
    fontSize: 18,
    fontWeight: '600',
  },
  itemTitleFocused: {
    color: '#FFFFFF',
  },
  itemTitleSelected: {
    color: '#FFFFFF',
  },
  itemSubtitle: {
    color: '#888888',
    fontSize: 13,
    marginTop: 3,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
    flexWrap: 'wrap',
  },
  metaText: {
    color: '#888888',
    fontSize: 13,
  },
  metaDot: {
    color: '#555555',
    fontSize: 13,
  },
  hiBadge: {
    backgroundColor: TV_FOCUS_COLOR,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  hiBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  statusText: {
    color: '#CCCCCC',
    fontSize: 18,
    marginTop: 8,
  },
  errorText: {
    color: '#CCCCCC',
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 8,
  },
  hintsRow: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    padding: 14,
    alignItems: 'center',
  },
  hintText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
});

export default TVSubtitleSelector;
