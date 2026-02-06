import React, {useCallback, useRef, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {Movie, TVShow} from '../types';
import {COLORS} from '../utils/constants';
import {ContentCard} from './ContentCard';
import {getCardDimensions, spacing, typography} from '../utils/responsive';
import {accessibilityRoles} from '../utils/accessibility';
import {isTV} from '../utils/tv';

interface HorizontalScrollListProps {
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

const HorizontalScrollList: React.FC<HorizontalScrollListProps> = ({
  title,
  data,
  onItemPress,
  loading = false,
  cardSize = 'medium',
  onEndReached,
  hasMore = false,
  loadingMore = false,
  hasTVPreferredFocus = false,
  sectionIndex = 0,
}) => {
  const flatListRef = useRef<FlatList>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const handleItemFocus = useCallback((index: number) => {
    setFocusedIndex(index);
    // Scroll to focused item on TV
    if (isTV && flatListRef.current) {
      flatListRef.current.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.3,
      });
    }
  }, []);

  const renderItem = ({item, index}: {item: Movie | TVShow; index: number}) => (
    <ContentCard
      item={item}
      onPress={onItemPress}
      size={cardSize}
      hasTVPreferredFocus={hasTVPreferredFocus && index === 0}
      onFocus={() => handleItemFocus(index)}
    />
  );

  const renderLoadingItem = () => (
    <View style={styles.loadingItem}>
      <ActivityIndicator size="small" color={COLORS.NETFLIX_RED} />
    </View>
  );

  const renderEmptyComponent = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>No content available</Text>
    </View>
  );

  const cardDimensions = getCardDimensions(cardSize);

  const getItemLayout = (_: any, index: number) => {
    const itemWidth = cardDimensions.width + spacing.sm;
    return {
      length: itemWidth,
      offset: itemWidth * index,
      index,
    };
  };

  const keyExtractor = (item: Movie | TVShow) => item.id.toString();

  const handleEndReached = useCallback(() => {
    if (!hasMore || !onEndReached) {
      return;
    }

    onEndReached();
  }, [hasMore, onEndReached]);

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text
          style={styles.title}
          accessible={true}
          accessibilityRole={accessibilityRoles.header}>
          {title}
        </Text>
        {loading && (
          <ActivityIndicator
            size="small"
            color={COLORS.NETFLIX_RED}
            style={styles.headerLoader}
            accessible={true}
            accessibilityLabel="Loading content"
          />
        )}
      </View>

      {loading && data.length === 0 ? (
        <View style={styles.loadingContainer}>
          {Array.from({length: 5}).map((_, index) => (
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
          contentContainerStyle={[
            styles.listContainer,
            isTV && styles.tvListContainer,
          ]}
          getItemLayout={getItemLayout}
          initialNumToRender={isTV ? 6 : 3}
          maxToRenderPerBatch={isTV ? 8 : 5}
          windowSize={isTV ? 7 : 5}
          removeClippedSubviews={!isTV}
          updateCellsBatchingPeriod={50}
          ListEmptyComponent={renderEmptyComponent}
          decelerationRate="normal"
          snapToInterval={cardDimensions.width + spacing.sm}
          snapToAlignment="start"
          legacyImplementation={false}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <View style={[styles.loadingItemWrapper, styles.loadingMoreContainer]}>
                <ActivityIndicator size="small" color={COLORS.NETFLIX_RED} />
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
    marginVertical: spacing.md,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm + 4,
  },
  title: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: typography.h5,
    fontWeight: 'bold',
    flex: 1,
  },
  headerLoader: {
    marginLeft: spacing.sm,
  },
  listContainer: {
    paddingHorizontal: spacing.md,
  },
  tvListContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  loadingContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
  },
  loadingItemWrapper: {
    marginRight: spacing.sm,
  },
  loadingItem: {
    width: getCardDimensions('medium').width,
    height: getCardDimensions('medium').height,
    backgroundColor: COLORS.NETFLIX_DARK_GRAY,
    borderRadius: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingMoreContainer: {
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyText: {
    color: COLORS.NETFLIX_GRAY,
    fontSize: typography.body,
    textAlign: 'center',
  },
});

export default HorizontalScrollList;
