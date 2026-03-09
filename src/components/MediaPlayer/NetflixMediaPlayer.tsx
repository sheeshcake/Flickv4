/**
 * Netflix-Style Media Player for Mobile
 * Full-screen landscape player with episode selector, subtitle support, and auto-hide controls.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Dimensions,
  FlatList,
  Image,
  Modal,
  PanResponder,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import Video, {
  BufferingStrategyType,
  SelectedTrackType,
  TextTrackType,
} from 'react-native-video';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Orientation from 'react-native-orientation-locker';
import RNFS from 'react-native-fs';
import { SubtitleTrack, DEFAULT_SUBTITLE_STYLE } from '../../types';
import { SubtitleOverlay } from './SubtitleOverlay';
import { useSubtitles } from './hooks';
import { useAppState } from '../../hooks/useAppState';
import { SubtitleSelector } from '../';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const LANDSCAPE_W = Math.max(SCREEN_W, SCREEN_H);
const LANDSCAPE_H = Math.min(SCREEN_W, SCREEN_H);
const CONTROLS_HIDE_DELAY = 5000;
const SEEK_AMOUNT = 10;

// ── helpers ────────────────────────────────────────────────────────────────────

const formatTime = (s: number): string => {
  if (!s || isNaN(s)) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

const convertSrtToVtt = (srt: string): string => {
  let vtt = 'WEBVTT\n\n';
  for (const block of srt.trim().split(/\r?\n\r?\n/)) {
    const lines = block.trim().split(/\r?\n/);
    if (lines.length < 2) continue;
    const tsIdx = lines.findIndex(l => l.includes('-->'));
    if (tsIdx === -1) continue;
    const ts = lines[tsIdx].replace(/,/g, '.');
    const text = lines.slice(tsIdx + 1);
    if (text.length > 0) vtt += `${ts}\n${text.join('\n')}\n\n`;
  }
  return vtt;
};

// ── types ──────────────────────────────────────────────────────────────────────

export interface SeasonInfo {
  season_number: number;
  name: string;
}

export interface EpisodeInfo {
  episode_number: number;
  name: string;
  overview?: string;
  still_path?: string | null;
  runtime?: number;
}

export interface NetflixMediaPlayerProps {
  videoUrl: string;
  title: string;
  contentId: number;
  contentType: 'movie' | 'tv';
  initialProgress?: number;
  season?: number;
  episode?: number;
  seasons?: SeasonInfo[];
  episodes?: EpisodeInfo[];
  selectedSeason?: number;
  selectedEpisode?: number | null;
  onSeasonChange?: (season: number) => void;
  onEpisodeChange?: (episode: number, name: string) => void;
  onEnd?: () => void;
  onBack?: () => void;
  navigation?: any;
}

// ── component ──────────────────────────────────────────────────────────────────

const VIDEO_SUBTITLE_STYLE = { fontSize: 16, paddingBottom: 20 };

const NetflixMediaPlayer: React.FC<NetflixMediaPlayerProps> = ({
  videoUrl,
  title,
  contentId,
  contentType,
  initialProgress = 0,
  season,
  episode,
  seasons = [],
  episodes = [],
  selectedSeason,
  selectedEpisode,
  onSeasonChange,
  onEpisodeChange,
  onEnd,
  onBack,
  navigation,
}) => {
  const { state, updateWatchProgress } = useAppState();

  // ── video state ────────────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(true);
  const [hasStartedFromProgress, setHasStartedFromProgress] = useState(false);
  const [subtitleContent, setSubtitleContent] = useState<string | null>(null);
  const [subtitleVttPath, setSubtitleVttPath] = useState<string | null>(null);
  const [subtitleDelay] = useState(0);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showEpisodePanel, setShowEpisodePanel] = useState(false);
  const [showSubtitleSelector, setShowSubtitleSelector] = useState(false);
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekBarWidth, setSeekBarWidth] = useState(0);

  const videoRef = useRef<any>(null);
  const seekBarRef = useRef<View>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsOpacity = useRef(new Animated.Value(1)).current;

  // ── lock landscape on mount ────────────────────────────────────────────────
  useEffect(() => {
    StatusBar.setHidden(true);
    Orientation.lockToLandscape();
    return () => {
      StatusBar.setHidden(false);
      Orientation.lockToPortrait();
    };
  }, []);

  // ── controls auto-hide ─────────────────────────────────────────────────────
  const showControls = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setControlsVisible(true);
    Animated.timing(controlsOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    if (isPlaying && !showEpisodePanel) {
      hideTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
        Animated.timing(controlsOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
      }, CONTROLS_HIDE_DELAY);
    }
  }, [isPlaying, showEpisodePanel, controlsOpacity]);

  const hideControls = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setControlsVisible(false);
    Animated.timing(controlsOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
  }, [controlsOpacity]);

  const toggleControls = useCallback(() => {
    if (controlsVisible) {
      hideControls();
    } else {
      showControls();
    }
  }, [controlsVisible, hideControls, showControls]);

  useEffect(() => {
    showControls();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // ── back handler ───────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showEpisodePanel) {
        setShowEpisodePanel(false);
        return true;
      }
      setIsPlaying(false);
      if (onBack) onBack();
      else navigation?.goBack();
      return true;
    });
    return () => handler.remove();
  }, [onBack, navigation, showEpisodePanel]);

  // ── subtitles ──────────────────────────────────────────────────────────────
  const savedSubtitle = useMemo(() => {
    const wp = state.user.continueWatching.find(
      item =>
        item.contentId === contentId &&
        item.contentType === contentType &&
        (contentType === 'movie' || (item.season === season && item.episode === episode)),
    );
    return wp?.selectedSubtitle || null;
  }, [state.user.continueWatching, contentId, contentType, season, episode]);

  const { selectedSubtitle, setSelectedSubtitle, availableSubtitles } = useSubtitles({
    contentId,
    contentType,
    season,
    episode,
    autoSelectSubtitles: state.user.preferences.autoSelectSubtitles,
    defaultSubtitleLanguage: state.user.preferences.defaultSubtitleLanguage,
    savedSubtitle,
  });

  useEffect(() => {
    if (!selectedSubtitle) {
      setSubtitleContent(null);
      setSubtitleVttPath(null);
      return;
    }
    const load = async () => {
      try {
        const dir = `${RNFS.DocumentDirectoryPath}/subtitles`;
        if (!(await RNFS.exists(dir))) await RNFS.mkdir(dir);
        const safe = selectedSubtitle.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const key = `${safe}_${contentId}${season && episode ? `_s${season}e${episode}` : ''}_${selectedSubtitle.language}`;
        const srtPath = `${dir}/${key}.srt`;
        const vttPath = `${dir}/${key}.vtt`;
        let srtContent: string;
        if (await RNFS.exists(srtPath)) {
          srtContent = await RNFS.readFile(srtPath, 'utf8');
        } else {
          const res = await fetch(selectedSubtitle.url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          srtContent = await res.text();
          await RNFS.writeFile(srtPath, srtContent, 'utf8');
        }
        setSubtitleContent(srtContent);
        if (!(await RNFS.exists(vttPath))) {
          await RNFS.writeFile(vttPath, convertSrtToVtt(srtContent), 'utf8');
        }
        setSubtitleVttPath(`file://${vttPath}`);
      } catch {
        setSubtitleContent(null);
        setSubtitleVttPath(null);
      }
    };
    load();
  }, [selectedSubtitle, contentId, season, episode]);

  // ── watch progress ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (duration > 0 && currentTime > 10 && isPlaying) {
      updateWatchProgress({
        contentId,
        contentType,
        progress: (currentTime / duration) * 100,
        duration,
        lastWatched: new Date(),
        season,
        episode,
        selectedSubtitle: selectedSubtitle || undefined,
      });
    }
  }, [currentTime, duration, contentId, contentType, season, episode, selectedSubtitle, updateWatchProgress, isPlaying]);

  // ── video event handlers ───────────────────────────────────────────────────
  const handleLoad = useCallback(({ duration: d }: { duration: number }) => {
    setDuration(d);
    setIsBuffering(false);
    setTimeout(() => setIsPlaying(true), 100);
    showControls();
  }, [showControls]);

  const handleProgress = useCallback(({ currentTime: t }: { currentTime: number }) => {
    if (!isSeeking) setCurrentTime(t);
  }, [isSeeking]);

  const handleBuffer = useCallback(({ isBuffering: b }: { isBuffering: boolean }) => {
    setIsBuffering(b);
  }, []);

  const handleEnd = useCallback(() => {
    setIsPlaying(false);
    onEnd?.();
  }, [onEnd]);

  const handleError = useCallback(() => {
    setIsBuffering(false);
  }, []);

  useEffect(() => {
    if (duration > 0 && initialProgress > 0 && !hasStartedFromProgress && videoRef.current) {
      videoRef.current.seek(initialProgress);
      setCurrentTime(initialProgress);
      setHasStartedFromProgress(true);
    }
  }, [duration, initialProgress, hasStartedFromProgress]);

  // ── seek ───────────────────────────────────────────────────────────────────
  const handleSeekOffset = useCallback((offset: number) => {
    if (!videoRef.current || duration <= 0) return;
    const next = Math.max(0, Math.min(currentTime + offset, duration));
    videoRef.current.seek(next);
    setCurrentTime(next);
    showControls();
  }, [currentTime, duration, showControls]);

  // ── seekbar pan responder ──────────────────────────────────────────────────
  const seekPanResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: evt => {
        setIsSeeking(true);
        showControls();
        seekBarRef.current?.measure((_x, _y, w, _h, px) => {
          const pct = Math.max(0, Math.min((evt.nativeEvent.pageX - px) / w, 1));
          setCurrentTime(pct * duration);
        });
      },
      onPanResponderMove: evt => {
        seekBarRef.current?.measure((_x, _y, w, _h, px) => {
          const pct = Math.max(0, Math.min((evt.nativeEvent.pageX - px) / w, 1));
          setCurrentTime(pct * duration);
        });
      },
      onPanResponderRelease: evt => {
        seekBarRef.current?.measure((_x, _y, w, _h, px) => {
          const pct = Math.max(0, Math.min((evt.nativeEvent.pageX - px) / w, 1));
          const t = pct * duration;
          videoRef.current?.seek(t);
          setCurrentTime(t);
        });
        setIsSeeking(false);
        showControls();
      },
      onPanResponderTerminate: () => setIsSeeking(false),
    }),
  [duration, showControls]);

  // ── text tracks ────────────────────────────────────────────────────────────
  const textTracks = useMemo(() => {
    if (!subtitleVttPath || !selectedSubtitle) return undefined;
    return [{ title: selectedSubtitle.title || 'Subtitles', language: (selectedSubtitle.language || 'en') as any, type: TextTrackType.VTT, uri: subtitleVttPath }];
  }, [subtitleVttPath, selectedSubtitle]);

  const selectedTextTrack = useMemo(() => {
    if (!subtitleVttPath || !selectedSubtitle) return { type: SelectedTrackType.DISABLED };
    return { type: SelectedTrackType.LANGUAGE, value: selectedSubtitle.language || 'en' };
  }, [subtitleVttPath, selectedSubtitle]);

  // ── computed ───────────────────────────────────────────────────────────────
  const progressPct = duration > 0 ? currentTime / duration : 0;
  const thumbLeft = Math.max(0, progressPct * seekBarWidth - 8);
  const hasTV = contentType === 'tv' && seasons.length > 0 && episodes.length > 0;
  const currentEpisodeInfo = episodes.find(e => e.episode_number === selectedEpisode);
  const currentSeasonInfo = seasons.find(s => s.season_number === selectedSeason);

  // ── episode panel ──────────────────────────────────────────────────────────
  const renderEpisodeItem = ({ item }: { item: EpisodeInfo }) => {
    const isActive = item.episode_number === selectedEpisode;
    return (
      <TouchableOpacity
        style={[styles.episodeCard, isActive && styles.episodeCardActive]}
        onPress={() => {
          onEpisodeChange?.(item.episode_number, item.name);
          setShowEpisodePanel(false);
          showControls();
        }}
        activeOpacity={0.8}
      >
        <View style={styles.episodeThumb}>
          {item.still_path ? (
            <Image
              source={{ uri: `https://image.tmdb.org/t/p/w300${item.still_path}` }}
              style={styles.episodeThumbImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.episodeThumbPlaceholder}>
              <Icon name="play-circle-outline" size={24} color="rgba(255,255,255,0.5)" />
            </View>
          )}
          {isActive && (
            <View style={styles.episodeThumbOverlay}>
              <Icon name="play" size={20} color="#FFFFFF" />
            </View>
          )}
          {isActive && <View style={styles.episodeActiveBadge}><Text style={styles.episodeActiveBadgeText}>▶ Playing</Text></View>}
        </View>
        <View style={styles.episodeCardInfo}>
          <Text style={styles.episodeCardNum}>E{item.episode_number}</Text>
          <Text style={styles.episodeCardTitle} numberOfLines={2}>{item.name}</Text>
          {item.runtime && <Text style={styles.episodeCardMeta}>{item.runtime} min</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* ── Video ── */}
      <Video
        ref={videoRef}
        source={{ uri: videoUrl }}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        paused={!isPlaying}
        controls={false}
        bufferingStrategy={BufferingStrategyType.DEPENDING_ON_MEMORY}
        onLoad={handleLoad}
        onProgress={handleProgress}
        onBuffer={handleBuffer}
        onEnd={handleEnd}
        onError={handleError}
        progressUpdateInterval={250}
        repeat={false}
        muted={false}
        hideShutterView
        textTracks={textTracks}
        selectedTextTrack={selectedTextTrack}
        subtitleStyle={VIDEO_SUBTITLE_STYLE}
      />

      {/* ── Buffering ── */}
      {isBuffering && (
        <View style={styles.bufferingLayer}>
          <ActivityIndicator size="large" color="#E50914" />
        </View>
      )}

      {/* ── Tap to toggle controls ── */}
      <TouchableWithoutFeedback onPress={toggleControls}>
        <View style={StyleSheet.absoluteFill} />
      </TouchableWithoutFeedback>

      {/* ── Controls overlay ── */}
      <Animated.View
        style={[styles.controlsOverlay, { opacity: controlsOpacity }]}
        pointerEvents={controlsVisible ? 'box-none' : 'none'}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.topBarBack}
            onPress={() => {
              setIsPlaying(false);
              if (onBack) onBack();
              else navigation?.goBack();
            }}
          >
            <Icon name="arrow-left" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.topBarCenter}>
            <Text style={styles.topBarTitle} numberOfLines={1}>{title}</Text>
            {hasTV && currentEpisodeInfo && (
              <Text style={styles.topBarSubtitle} numberOfLines={1}>
                {currentSeasonInfo?.name} · E{currentEpisodeInfo.episode_number} – {currentEpisodeInfo.name}
              </Text>
            )}
          </View>

          <View style={styles.topBarRight}>
            {hasTV && (
              <TouchableOpacity
                style={styles.topBarButton}
                onPress={() => { setShowEpisodePanel(true); showControls(); }}
              >
                <Icon name="view-list" size={22} color="#FFFFFF" />
                <Text style={styles.topBarButtonLabel}>Episodes</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.topBarButton}
              onPress={() => { setShowSubtitleSelector(true); showControls(); }}
            >
              <Icon name="closed-caption" size={22} color={selectedSubtitle ? '#E50914' : '#FFFFFF'} />
              <Text style={[styles.topBarButtonLabel, selectedSubtitle ? styles.ccActiveLabel : undefined]}>CC</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Center: seek & play/pause */}
        <View style={styles.centerRow} pointerEvents="box-none">
          <TouchableOpacity style={styles.seekBtn} onPress={() => handleSeekOffset(-SEEK_AMOUNT)}>
            <Icon name="rewind-10" size={36} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.playPauseBtn}
            onPress={() => { setIsPlaying(p => !p); showControls(); }}
          >
            <Icon name={isPlaying ? 'pause' : 'play'} size={44} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.seekBtn} onPress={() => handleSeekOffset(SEEK_AMOUNT)}>
            <Icon name="fast-forward-10" size={36} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Bottom: seek bar + time */}
        <View style={styles.bottomBar}>
          <Text style={styles.timeText}>{formatTime(currentTime)}</Text>

          <View
            style={styles.seekBarContainer}
            onLayout={e => setSeekBarWidth(e.nativeEvent.layout.width)}
          >
            <View
              ref={seekBarRef}
              style={styles.seekTrack}
              {...seekPanResponder.panHandlers}
            >
              <View style={styles.seekBackground} />
              <View style={[styles.seekFill, { width: progressPct * seekBarWidth }]} />
              {seekBarWidth > 0 && (
                <View
                  style={[
                    styles.seekThumb,
                    { left: thumbLeft },
                    isSeeking && styles.seekThumbActive,
                  ]}
                />
              )}
            </View>
          </View>

          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>
      </Animated.View>

      {/* ── Subtitle overlay ── */}
      <SubtitleOverlay
        subtitleContent={subtitleContent}
        currentTime={currentTime}
        isVideoFullscreen={true}
        delay={subtitleDelay}
        style={state.user.preferences.subtitleStyle || DEFAULT_SUBTITLE_STYLE}
      />

      {/* ── Episode Panel Modal ── */}
      <Modal
        visible={showEpisodePanel}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEpisodePanel(false)}
      >
        <View style={styles.episodePanelBg}>
          <TouchableWithoutFeedback onPress={() => setShowEpisodePanel(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>

          <View style={styles.episodePanel}>
            {/* Panel header */}
            <View style={styles.episodePanelHeader}>
              <Text style={styles.episodePanelTitle}>Episodes</Text>

              {/* Season dropdown */}
              {seasons.length > 1 && (
                <View style={styles.seasonDropdownWrapper}>
                  <TouchableOpacity
                    style={styles.seasonDropdownBtn}
                    onPress={() => setShowSeasonDropdown(p => !p)}
                  >
                    <Text style={styles.seasonDropdownBtnText}>
                      {currentSeasonInfo?.name ?? `Season ${selectedSeason}`}
                    </Text>
                    <Icon name={showSeasonDropdown ? 'chevron-up' : 'chevron-down'} size={16} color="#FFFFFF" />
                  </TouchableOpacity>

                  {showSeasonDropdown && (
                    <View style={styles.seasonDropdownList}>
                      <ScrollView>
                        {seasons.map(s => (
                          <TouchableOpacity
                            key={s.season_number}
                            style={[
                              styles.seasonDropdownItem,
                              selectedSeason === s.season_number && styles.seasonDropdownItemActive,
                            ]}
                            onPress={() => {
                              onSeasonChange?.(s.season_number);
                              setShowSeasonDropdown(false);
                            }}
                          >
                            <Text style={[
                              styles.seasonDropdownItemText,
                              selectedSeason === s.season_number && styles.seasonDropdownItemTextActive,
                            ]}>
                              {s.name}
                            </Text>
                            {selectedSeason === s.season_number && (
                              <Icon name="check" size={14} color="#E50914" />
                            )}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              )}

              <TouchableOpacity onPress={() => setShowEpisodePanel(false)} style={styles.episodePanelClose}>
                <Icon name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Episode carousel */}
            <FlatList
              data={episodes}
              keyExtractor={item => String(item.episode_number)}
              renderItem={renderEpisodeItem}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.episodeListContent}
            />
          </View>
        </View>
      </Modal>

      {/* ── Subtitle Selector ── */}
      <SubtitleSelector
        visible={showSubtitleSelector}
        onClose={() => setShowSubtitleSelector(false)}
        onSelectSubtitle={(sub: SubtitleTrack | null) => {
          setSelectedSubtitle(sub);
          setShowSubtitleSelector(false);
          showControls();
        }}
        selectedSubtitle={selectedSubtitle}
        contentId={contentId}
        contentType={contentType}
        season={season}
        episode={episode}
        title={title}
        prefetchedSubtitles={availableSubtitles}
      />
    </View>
  );
};

// ── styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
    width: LANDSCAPE_W,
    height: LANDSCAPE_H,
  },
  bufferingLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'space-between',
  },
  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  topBarBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarCenter: {
    flex: 1,
    marginHorizontal: 12,
  },
  topBarTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  topBarSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    marginTop: 2,
  },
  topBarRight: {
    flexDirection: 'row',
    gap: 8,
  },
  topBarButton: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginLeft: 6,
  },
  topBarButtonLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    marginTop: 2,
  },
  ccActiveLabel: {
    color: '#E50914',
    fontSize: 10,
    marginTop: 2,
  },
  // Center controls
  centerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 40,
  },
  seekBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playPauseBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(229,9,20,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#E50914',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 8,
  },
  // Bottom bar
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  timeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    minWidth: 48,
    textAlign: 'center',
  },
  seekBarContainer: {
    flex: 1,
    height: 24,
    justifyContent: 'center',
  },
  seekTrack: {
    flex: 1,
    height: 24,
    justifyContent: 'center',
  },
  seekBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  seekFill: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E50914',
  },
  seekThumb: {
    position: 'absolute',
    top: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E50914',
    elevation: 4,
  },
  seekThumbActive: {
    transform: [{ scale: 1.4 }],
    backgroundColor: '#E50914',
  },
  // Episode panel
  episodePanelBg: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  episodePanel: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 20,
    maxHeight: LANDSCAPE_H * 0.75,
  },
  episodePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    gap: 12,
  },
  episodePanelTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  episodePanelClose: {
    padding: 6,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  // Season dropdown
  seasonDropdownWrapper: {
    position: 'relative',
  },
  seasonDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  seasonDropdownBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  seasonDropdownList: {
    position: 'absolute',
    bottom: '110%',
    right: 0,
    minWidth: 180,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    maxHeight: 200,
    zIndex: 100,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  seasonDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  seasonDropdownItemActive: {
    backgroundColor: 'rgba(229,9,20,0.15)',
  },
  seasonDropdownItemText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  seasonDropdownItemTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  // Episode cards
  episodeListContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  episodeCard: {
    width: 200,
    backgroundColor: '#1e1e1e',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginRight: 10,
  },
  episodeCardActive: {
    borderColor: '#E50914',
  },
  episodeThumb: {
    width: '100%',
    height: 110,
    backgroundColor: '#2a2a2a',
  },
  episodeThumbImage: {
    width: '100%',
    height: '100%',
  },
  episodeThumbPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
  },
  episodeThumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodeActiveBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: '#E50914',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  episodeActiveBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  episodeCardInfo: {
    padding: 10,
  },
  episodeCardNum: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginBottom: 2,
  },
  episodeCardTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  episodeCardMeta: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    marginTop: 4,
  },
});

export default NetflixMediaPlayer;
