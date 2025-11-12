import React, {useCallback} from 'react';
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

interface HorizontalScrollListProps {
  title: string;
  data: (Movie | TVShow)[];
  onItemPress: (item: Movie | TVShow) => void;
  loading?: boolean;
  cardSize?: 'small' | 'medium' | 'large';
  onEndReached?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
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
}) => {
  const renderItem = ({item}: {item: Movie | TVShow}) => (
    <ContentCard item={item} onPress={onItemPress} size={cardSize} />
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
          data={data}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
          getItemLayout={getItemLayout}
          initialNumToRender={3}
          maxToRenderPerBatch={5}
          windowSize={5}
          removeClippedSubviews={true}
          updateCellsBatchingPeriod={50}
          disableIntervalMomentum={true}
          ListEmptyComponent={renderEmptyComponent}
          decelerationRate="fast"
          snapToInterval={cardDimensions.width + spacing.sm}
          snapToAlignment="start"
          legacyImplementation={false}
          maintainVisibleContentPosition={{
            minIndexForVisible: 0,
            autoscrollToTopThreshold: 10,
          }}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.6}
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
