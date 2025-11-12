import { StyleSheet } from 'react-native';
import { colors, sizes } from '../../../constants/theme';

export const styles = StyleSheet.create({
  container: {
    justifyContent: 'space-between',
    width: '100%',
  },
  containerFullscreen: {
    position: 'absolute',
    zIndex: 10,
  },
  containerRegular: {
    position: 'relative',
    zIndex: 1,
  },
  topBar: {
    maxHeight: sizes.width * 0.25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.transparentBlack,
    width: '100%',
  },
  topBarFullscreen: {
    paddingTop: 0,
  },
  topBarRegular: {
    paddingTop: 20,
  },
  topBarHidden: {
    opacity: 0,
    pointerEvents: 'none',
  },
  topBarVisible: {
    opacity: 1,
  },
  topBarRightPlaceholder: {
    width: 30,
  },
  backButton: {
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    color: colors.white,
    fontSize: 20,
    fontWeight: 'bold',
  },
  centerOverlay: {
    height: sizes.height * 0.2,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    width: '100%',
  },
  seekArea: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPlayArea: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    width: '50%',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.white,
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    color: colors.white,
    fontSize: 20,
    fontWeight: 'bold',
  },
  playPauseButton: {
    borderRadius: 50,
    padding: 20,
  },
  playPauseButtonVisible: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    opacity: 1,
  },
  playPauseButtonHidden: {
    backgroundColor: 'transparent',
    opacity: 0,
  },
  bottomBar: {
    flexDirection: 'row',
    minHeight: 55,
    width: '100%',
    justifyContent: 'space-between',
    backgroundColor: colors.transparentBlack,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  bottomBarHidden: {
    opacity: 0,
  },
  bottomBarVisible: {
    opacity: 1,
  },
  bottomPlayButton: {
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitleButton: {
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resizeButton: {
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenButton: {
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: {
    color: colors.white,
    width: 60,
    fontSize: 12,
    textAlign: 'center',
  },
  nextEpisodeContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  nextEpisodeButton: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: colors.white,
    flexDirection: 'row',
    borderRadius: 5,
    alignItems: 'center',
  },
  nextEpisodeText: {
    color: colors.black,
    fontWeight: 'bold',
    paddingHorizontal: 5,
  },
  seekIndicator: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -25 }, { translateY: -25 }],
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 25,
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seekIndicatorText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: 'bold',
  },
  progressContainer: {
    height: 40,
    marginHorizontal: 5,
    justifyContent: 'center',
    paddingVertical: 8,
    flex: 1,
  },
  progressHidden: {
    opacity: 0,
  },
  progressTouchArea: {
    height: 40,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    position: 'relative',
    overflow: 'visible',
  },
  progressBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
  },
  progressBuffered: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 2,
  },
  progressForeground: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: colors.red,
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    zIndex: 999,
    top: -5,
    width: 14,
    height: 14,
    backgroundColor: colors.red,
    borderRadius: 7,
    marginLeft: -7,
    borderWidth: 2,
    borderColor: colors.white,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
});
