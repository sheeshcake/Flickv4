# YouTube-Style Video Player Implementation

## Overview
Successfully implemented a YouTube-style draggable video player with mini player functionality, exactly matching the gesture behavior from the reference repository (https://github.com/guneyural/youtube-clone).

## Key Features

### 1. Pan Gesture Video Player
- **Drag Down**: Minimizes video to mini player at bottom-right
- **Drag Up**: Expands mini player back to full screen
- **Swipe Down Further**: Closes player completely
- **Tap Mini Player**: Expands to full screen

### 2. Smooth Animations
All animations use spring physics for natural feel:
- Video height: 33% screen → 150px → 60px (mini)
- Video width: 100% → 30%
- Mini player slides in from right
- Content opacity fades during drag
- Position interpolates smoothly

### 3. Mini Player Features
- Muted video thumbnail continues playing
- Shows content title (truncated if long)
- Displays episode info for TV shows (S1 E1)
- Play/pause button
- Close button
- Tap anywhere to expand

### 4. Gesture Thresholds
- Drag > 100px: Minimizes to mini player
- Drag < 100px: Snaps back to full screen
- Drag > screen height - 80px: Closes completely

### 5. Detail Screen Content
- Full video player with controls
- Content title and like button
- Overview/description
- Episodes list (for TV shows)
- Similar content recommendations
- Video scraping integration

### 6. Back Button Handling
- When expanded: Minimizes to mini player
- When minimized: Handled by navigation

## Architecture

### New Files Created

#### 1. `src/context/VideoPlayerContext.tsx`
Global state management for video player:
```typescript
interface VideoPlayerState {
  content: Movie | TVShow | null;
  videoUrl: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  selectedSeason?: number;
  selectedEpisode?: number;
}
```

**Methods:**
- `openDetailSheet(content)` - Opens player with content
- `closeDetailSheet()` - Closes player and clears state
- `setVideoUrl(url)` - Updates video URL
- `setPlaybackState(isPlaying, currentTime, duration)` - Syncs playback
- `setEpisodeInfo(season, episode)` - Sets episode info

#### 2. `src/components/VideoPlayerSheet/VideoPlayerSheet.tsx`
Main video player component with gestures:
- Pan gesture handler for drag interactions
- Animated interpolations for smooth transitions
- Video player integration
- Content details display
- Episode selection
- Similar content recommendations

#### 3. `src/components/VideoPlayerSheet/index.tsx`
Export file for the component

### Modified Files

#### 1. `App.tsx`
- Added `VideoPlayerProvider` wrapper
- Added `AppContent` component to access video player context
- Conditionally renders `VideoPlayerSheet` when content is selected

#### 2. `src/context/index.ts`
- Exported `VideoPlayerProvider` and `useVideoPlayer`

#### 3. `src/screens/HomeScreen.tsx`
- Uses `openDetailSheet()` instead of `navigation.navigate('Detail')`
- Removed Detail screen navigation

#### 4. `src/screens/SearchScreen.tsx`
- Uses `openDetailSheet()` instead of `navigation.navigate('Detail')`
- Removed Detail screen navigation

#### 5. `src/navigation/AppNavigator.tsx`
- Removed Detail screen from navigation stack
- Detail content now opens via overlay instead of navigation

#### 6. `src/types/navigation.ts`
- Removed `Detail` route from `RootStackParamList`

## Technical Implementation

### Gesture Handling
Uses `react-native-gesture-handler` Gesture API:
```typescript
const panGesture = Gesture.Pan()
  .onStart(() => {
    context.value = {y: translationY.value};
  })
  .onUpdate(event => {
    translationY.value = event.translationY + context.value.y;
    translationY.value = Math.max(0, translationY.value);
  })
  .onEnd(() => {
    // Snap to positions based on threshold
  });
```

### Animation Interpolations
Uses `react-native-reanimated` for 60fps animations:

**Video Height:**
```typescript
interpolate(
  translationY,
  [0, SCREEN_HEIGHT - 300, SCREEN_HEIGHT - 80],
  [VIDEO_HEIGHT, 150, MINI_PLAYER_HEIGHT],
  Extrapolation.CLAMP
)
```

**Video Width:**
```typescript
interpolate(
  translationY,
  [0, 500, SCREEN_HEIGHT - 80],
  [100, 100, 30], // percentages
  Extrapolation.CLAMP
)
```

**Mini Player Position:**
```typescript
interpolate(
  translationY,
  [0, 500, SCREEN_HEIGHT - 80],
  [500, 500, 125], // translateX values
  Extrapolation.CLAMP
)
```

**Opacity:**
```typescript
interpolate(
  translationY,
  [0, 350, 600],
  [1, 0.5, 0],
  Extrapolation.CLAMP
)
```

### State Synchronization
- Video playback state syncs between full player and mini player
- Episode info persists during minimize/maximize
- Video URL maintained across transitions
- Playback continues seamlessly

## Usage

### Opening Content
```typescript
const {openDetailSheet} = useVideoPlayer();

// On content card press
openDetailSheet(movieOrTVShow);
```

### User Interactions
1. **View Content**: Tap any movie/TV show card
2. **Minimize**: Drag video player down
3. **Expand**: Drag mini player up or tap it
4. **Close**: Swipe mini player down or press close button
5. **Browse**: Continue browsing with mini player visible
6. **Select Episode**: Tap episode to play (TV shows)

## Benefits

1. **Better UX**: Browse while video plays
2. **Familiar Pattern**: YouTube-like interaction
3. **Smooth Performance**: 60fps animations
4. **Gesture-Based**: Intuitive swipe controls
5. **Seamless Playback**: Video continues during transitions
6. **Episode Support**: Easy episode switching for TV shows
7. **Content Discovery**: Similar content recommendations

## Dependencies Used

- `react-native-gesture-handler`: Gesture recognition
- `react-native-reanimated`: High-performance animations
- `react-native-video`: Video playback
- `@react-native-vector-icons/material-icons`: Icons

## Testing

To test the implementation:
1. Run the app
2. Tap any content card from home or search
3. Video player sheet slides up
4. Drag down to minimize
5. Drag up or tap to expand
6. Swipe down far to close
7. Try with TV shows to test episode selection

## Notes

- Mini player shows muted video thumbnail
- Full player has audio and controls
- Back button minimizes when expanded
- Video scraping happens automatically
- Similar content loads in background
- Episode list shows first 5 episodes

## Future Enhancements

Possible improvements:
- Full episode list with seasons selector
- Picture-in-picture mode
- Playlist/queue functionality
- Swipe between episodes
- Download progress in mini player
- Cast button integration
- Subtitle selector in mini player
