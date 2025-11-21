import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import {Movie, TVShow, WatchProgress} from '../types';
import {COLORS} from '../utils/constants';
import ContinueWatchingCard from './ContinueWatchingCard';

interface ContinueWatchingListProps {
  title: string;
  data: WatchProgress[];
  onItemPress: (item: Movie | TVShow, progress: WatchProgress) => void;
  loading?: boolean;
  cardSize?: 'small' | 'medium' | 'large';
}

const {width: screenWidth} = Dimensions.get('window');

const ContinueWatchingList: React.FC<ContinueWatchingListProps> = ({
  title,
  data,
  onItemPress,
  loading = false,
  cardSize = 'medium',
}) => {
  const renderItem = ({item}: {item: WatchProgress}) => (
    <ContinueWatchingCard
      watchProgress={item}
      onPress={onItemPress}
      size={cardSize}
      type={item.contentType as 'movie' | 'tv'}
    />
  );

  const renderLoadingItem = () => (
    <View style={styles.loadingItem}>
      <ActivityIndicator size="small" color={COLORS.NETFLIX_RED} />
    </View>
  );

  const renderEmptyComponent = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>
        No content to continue watching. Start watching something to see it
        here!
      </Text>
    </View>
  );

  const getItemLayout = (_: any, index: number) => {
    const cardWidth = getCardWidth();
    return {
      length: cardWidth + 8, // card width + margin
      offset: (cardWidth + 8) * index,
      index,
    };
  };

  const getCardWidth = () => {
    switch (cardSize) {
      case 'small':
        return screenWidth * 0.25;
      case 'medium':
        return screenWidth * 0.3;
      case 'large':
        return screenWidth * 0.4;
      default:
        return screenWidth * 0.3;
    }
  };

  const keyExtractor = (item: WatchProgress) =>
    `${item.contentType}-${item.contentId}`;

  // Don't render if no data and not loading
  if (!loading && data.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.title}>{title}</Text>
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
          {Array.from({length: 3}).map((_, index) => (
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
          ListEmptyComponent={renderEmptyComponent}
          decelerationRate="fast"
          snapToInterval={getCardWidth() + 8}
          snapToAlignment="start"
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  headerLoader: {
    marginLeft: 8,
  },
  listContainer: {
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  loadingItemWrapper: {
    marginRight: 8,
  },
  loadingItem: {
    width: screenWidth * 0.3,
    height: screenWidth * 0.45,
    backgroundColor: COLORS.NETFLIX_DARK_GRAY,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  emptyText: {
    color: COLORS.NETFLIX_GRAY,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default ContinueWatchingList;
