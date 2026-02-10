/**
 * TV Search Screen
 * Voice search and keyboard navigation optimized for TV
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { TVContentCard, TVSidebar, TVButton } from '../../components/tv';
import { TMDBService } from '../../services/TMDBService';
import { Movie, TVShow, Content } from '../../types';
import { COLORS } from '../../utils/constants';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface TVSearchScreenProps {
  navigation: any;
}

const NUM_COLUMNS = 5;

export const TVSearchScreen: React.FC<TVSearchScreenProps> = ({ navigation }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Content[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const scale = useSharedValue(1);

  const tmdbService = useMemo(() => new TMDBService(), []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const response = await tmdbService.searchMulti(searchQuery.trim());
      const filtered = response.results.filter(
        (item: any) =>
          item.media_type !== 'person' &&
          item.poster_path &&
          (item.title || item.name)
      );
      setSearchResults(filtered);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, tmdbService]);

  const handleItemPress = useCallback(
    (item: Movie | TVShow) => {
      navigation.navigate('Detail', { content: item });
    },
    [navigation]
  );

  const handleInputFocus = useCallback(() => {
    setInputFocused(true);
    scale.value = withSpring(1.02, { damping: 15, stiffness: 150 });
  }, [scale]);

  const handleInputBlur = useCallback(() => {
    setInputFocused(false);
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
  }, [scale]);

  const animatedInputStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleClear = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    inputRef.current?.focus();
  }, []);

  const navItems = [
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'search', label: 'Search', icon: 'magnify' },
    { key: 'downloads', label: 'Downloads', icon: 'download' },
    { key: 'settings', label: 'Settings', icon: 'cog' },
  ];

  const handleNavPress = (key: string) => {
    switch (key) {
      case 'home':
        navigation.navigate('Main');
        break;
      case 'downloads':
        navigation.navigate('Downloads');
        break;
      case 'settings':
        navigation.navigate('Settings');
        break;
    }
  };

  const renderItem = useCallback(
    ({ item, index }: { item: Content; index: number }) => (
      <View style={styles.gridItem}>
        <TVContentCard
          item={item as Movie | TVShow}
          onPress={handleItemPress}
          size="medium"
          hasTVPreferredFocus={index === 0 && searchResults.length > 0}
        />
      </View>
    ),
    [handleItemPress, searchResults.length]
  );

  const keyExtractor = useCallback((item: Content) => item.id.toString(), []);

  return (
    <View style={styles.container}>
      {/* Sidebar */}
      <TVSidebar
        items={navItems}
        activeKey="search"
        onItemPress={handleNavPress}
      />

      {/* Main Content */}
      <View style={styles.mainContent}>
        {/* Search Header */}
        <View style={styles.searchHeader}>
          <Text style={styles.title}>Search</Text>

          {/* Search Input */}
          <AnimatedPressable
            style={[
              styles.searchInputContainer,
              inputFocused && styles.searchInputFocused,
              animatedInputStyle,
            ]}
            onPress={() => inputRef.current?.focus()}
          >
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search movies, TV shows..."
              placeholderTextColor="#666666"
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              autoCorrect={false}
            />
          </AnimatedPressable>

          {/* Search Buttons */}
          <View style={styles.searchButtons}>
            <TVButton
              title="Search"
              icon="magnify"
              variant="primary"
              size="medium"
              onPress={handleSearch}
            />
            {searchQuery.length > 0 && (
              <TVButton
                title="Clear"
                icon="close"
                variant="secondary"
                size="medium"
                onPress={handleClear}
                style={styles.buttonSpacing}
              />
            )}
          </View>
        </View>

        {/* Results */}
        <View style={styles.resultsContainer}>
          {isSearching ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.NETFLIX_RED} />
              <Text style={styles.loadingText}>Searching...</Text>
            </View>
          ) : searchResults.length > 0 ? (
            <FlatList
              data={searchResults}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              numColumns={NUM_COLUMNS}
              contentContainerStyle={styles.gridContainer}
              showsVerticalScrollIndicator={false}
            />
          ) : searchQuery.length > 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No results found</Text>
              <Text style={styles.emptySubtext}>
                Try searching for something else
              </Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Start searching</Text>
              <Text style={styles.emptySubtext}>
                Type a movie or TV show name above
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#000000',
  },
  mainContent: {
    flex: 1,
    padding: 48,
  },
  searchHeader: {
    marginBottom: 32,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  searchInputContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    borderWidth: 3,
    borderColor: 'transparent',
    marginBottom: 24,
  },
  searchInputFocused: {
    borderColor: '#E50914',
    backgroundColor: '#252525',
  },
  searchInput: {
    color: '#FFFFFF',
    fontSize: 24,
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  searchButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonSpacing: {
    marginLeft: 16,
  },
  resultsContainer: {
    flex: 1,
  },
  gridContainer: {
    paddingBottom: 48,
  },
  gridItem: {
    flex: 1,
    alignItems: 'center',
    marginBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 20,
    marginTop: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#666666',
    fontSize: 20,
  },
});

export default TVSearchScreen;
