import { StyleSheet, Dimensions } from 'react-native';
import { COLORS } from '../utils/constants';

const { height: screenHeight } = Dimensions.get('window');
export const VIDEO_HEIGHT = screenHeight * 0.33;

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.NETFLIX_BLACK,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  contentHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 28,
    fontWeight: 'bold',
    lineHeight: 34,
    flex: 1,
    marginRight: 8,
  },
  metaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  year: {
    color: COLORS.NETFLIX_GRAY,
    fontSize: 16,
    marginRight: 20,
  },
  rating: {
    color: COLORS.NETFLIX_GRAY,
    fontSize: 16,
  },
  overviewContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  sectionTitle: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  overview: {
    color: COLORS.NETFLIX_LIGHT_GRAY,
    fontSize: 16,
    lineHeight: 24,
  },
  additionalInfo: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'center',
  },
  infoLabel: {
    color: COLORS.NETFLIX_GRAY,
    fontSize: 14,
    fontWeight: '500',
    width: 80,
  },
  infoValue: {
    color: COLORS.NETFLIX_LIGHT_GRAY,
    fontSize: 14,
    flex: 1,
  },
  moreLikeThisContainer: {
    paddingTop: 12,
  },
  bottomPadding: {
    height: 40,
  },
  videoSection: {
    height: VIDEO_HEIGHT,
  },
  playButtonContainer: {
    height: VIDEO_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonIcon: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 20,
    fontWeight: 'bold',
    marginRight: 12,
  },
  playButtonText: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 18,
    fontWeight: '600',
  },
  loadingContainer: {
    height: VIDEO_HEIGHT,
    backgroundColor: COLORS.NETFLIX_DARK_GRAY,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.NETFLIX_GRAY,
  },
  loadingText: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 16,
    fontWeight: '500',
  },
  episodeSelectorContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  selectorSection: {
    marginBottom: 20,
  },
  selectorLabel: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  seasonSelector: {
    paddingVertical: 8,
  },
  seasonButton: {
    backgroundColor: COLORS.NETFLIX_DARK_GRAY,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1,
    borderColor: COLORS.NETFLIX_GRAY,
    minWidth: 50,
    alignItems: 'center',
  },
  seasonButtonActive: {
    backgroundColor: COLORS.NETFLIX_RED,
    borderColor: COLORS.NETFLIX_RED,
  },
  seasonButtonText: {
    color: COLORS.NETFLIX_LIGHT_GRAY,
    fontSize: 16,
    fontWeight: '600',
  },
  seasonButtonTextActive: {
    color: COLORS.NETFLIX_WHITE,
  },
  episodesList: {
    marginTop: 8,
  },
  episodeItem: {
    flexDirection: 'row',
    backgroundColor: COLORS.NETFLIX_DARK_GRAY,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  episodeItemActive: {
    borderColor: COLORS.NETFLIX_RED,
    backgroundColor: '#1a0000',
  },
  episodeImageContainer: {
    position: 'relative',
    width: 120,
    height: 135,
  },
  episodeImage: {
    width: '100%',
    height: '100%',
  },
  episodePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.NETFLIX_GRAY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodePlaceholderText: {
    fontSize: 24,
  },
  episodePlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodePlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodePlayIcon: {
    color: COLORS.NETFLIX_BLACK,
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 2,
  },
  selectedBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: COLORS.NETFLIX_RED,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  selectedBadgeText: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  episodeInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  episodeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 1,
  },
  episodeNumber: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 14,
    fontWeight: '600',
  },
  episodeRuntime: {
    color: COLORS.NETFLIX_GRAY,
    fontSize: 12,
  },
  episodeName: {
    color: COLORS.NETFLIX_LIGHT_GRAY,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3,
  },
  episodeNameActive: {
    color: COLORS.NETFLIX_WHITE,
  },
  episodeOverview: {
    color: COLORS.NETFLIX_GRAY,
    fontSize: 11,
  },
  errorContainer: {
    backgroundColor: COLORS.NETFLIX_RED,
    padding: 12,
    marginHorizontal: 20,
    marginVertical: 10,
    borderRadius: 8,
  },
  errorText: {
    color: COLORS.NETFLIX_WHITE,
    fontSize: 14,
    textAlign: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  downloadButton: {
    marginRight: 16,
  },
  likeButton: {
    marginRight: 10,
  },
  likeIcon: {
    margin: 0,
    padding: 0,
  },
  likeIconActive: {
    transform: [{ scale: 1.15 }],
  },
  likedIndicator: {
    color: COLORS.NETFLIX_RED,
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 20,
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    zIndex: 10,
  },
  videoOverlay: { 
    width: '100%', 
    height: VIDEO_HEIGHT, 
    justifyContent: 'center', 
    alignItems: 'center',
  },
});
