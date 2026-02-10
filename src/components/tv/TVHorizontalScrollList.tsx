/**
 * TV Horizontal Scroll List Component
 * Optimized for TV remote navigation with keyboard/D-pad support
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Movie, TVShow } from '../../types';
import { COLORS } from '../../utils/constants';
import { TVContentCard } from './TVContentCard';
import { accessibilityRoles } from '../../utils/accessibility';

// TV-specific constants
const TV_CARD_WIDTH = 140;
const TV_CARD_HEIGHT = 200;
const TV_ITEM_SPACING = 24;

interface TVHorizontalScrollListProps {
  title: string;
  data: (Movie | TVShow)[];
  onItemPress: (item: Movie | TVShow) => void;
  loading?: boolean;
  cardSize?: 'small' | 'medium' | 'large';
  onEndReached?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  hasTVPreferredFocus?: boolean;
  sectionIndex?: number;
}

export const TVHorizontalScrollList: React.FC<TVHorizontalScrollListProps> = ({
  title,
  data,
  onItemPress,
  loading = false,
  cardSize = 'medium',
  onEndReached,
  hasMore = false,
  loadingMore = false,
  hasTVPreferredFocus = false,
  sectionIndex: _sectionIndex = 0,
}) => {
  const flatListRef = useRef<FlatList>(null);
  const [_focusedIndex, setFocusedIndex] = useState(-1);

  const handleItemFocus = useCallback((index: number) => {
    setFocusedIndex(index);
    // Auto-scroll to focused item for TV navigation
    if (flatListRef.current) {
      flatListRef.current.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.3,
      });
    }
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: Movie | TVShow; index: number }) => (
      <TVContentCard
        item={item}
        onPress={onItemPress}
        size={cardSize}
        hasTVPreferredFocus={hasTVPreferredFocus && index === 0}
        onFocus={() => handleItemFocus(index)}
      />
    ),
    [onItemPress, cardSize, hasTVPreferredFocus, handleItemFocus]
  );

  const renderLoadingItem = () => (
    <View style={styles.loadingItem}>
      <ActivityIndicator size="large" color={COLORS.NETFLIX_RED} />
    </View>
  );

  const renderEmptyComponent = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>No content available</Text>
    </View>
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => {
      const itemWidth = TV_CARD_WIDTH + TV_ITEM_SPACING;
      return {
        length: itemWidth,
        offset: itemWidth * index,
        index,
      };
    },
    []
  );

  const keyExtractor = useCallback((item: Movie | TVShow) => item.id.toString(), []);

  const handleEndReached = useCallback(() => {
    if (!hasMore || !onEndReached) return;
    onEndReached();
  }, [hasMore, onEndReached]);

  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; highestMeasuredFrameIndex: number }) => {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: info.index,
          animated: true,
        });
      }, 100);
    },
    []
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text
          style={styles.title}
          accessible={true}
          accessibilityRole={accessibilityRoles.header}
        >
          {title}
        </Text>
        {loading && (
          <ActivityIndicator
            size="small"
            color={COLORS.NETFLIX_RED}
            style={styles.headerLoader}
          />
        )}
      </View>

      {loading && data.length === 0 ? (
        <View style={styles.loadingContainer}>
          {Array.from({ length: 6 }).map((_, index) => (
            <View key={index} style={styles.loadingItemWrapper}>
              {renderLoadingItem()}
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={data}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
          getItemLayout={getItemLayout}
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews={false}
          updateCellsBatchingPeriod={50}
          ListEmptyComponent={renderEmptyComponent}
          decelerationRate="fast"
          snapToInterval={TV_CARD_WIDTH + TV_ITEM_SPACING}
          snapToAlignment="start"
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadingMoreContainer}>
                <ActivityIndicator size="large" color={COLORS.NETFLIX_RED} />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 24,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 48,
    marginBottom: 20,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
    flex: 1,
  },
  headerLoader: {
    marginLeft: 16,
  },
  listContainer: {
    paddingHorizontal: 48,
    paddingVertical: 12,
  },
  loadingContainer: {
    flexDirection: 'row',
    paddingHorizontal: 48,
  },
  loadingItemWrapper: {
    marginRight: TV_ITEM_SPACING,
  },
  loadingItem: {
    width: TV_CARD_WIDTH,
    height: TV_CARD_HEIGHT,
    backgroundColor: COLORS.NETFLIX_DARK_GRAY,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingMoreContainer: {
    width: TV_CARD_WIDTH,
    height: TV_CARD_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    color: '#666666',
    fontSize: 20,
    textAlign: 'center',
  },
});

export default TVHorizontalScrollList;
