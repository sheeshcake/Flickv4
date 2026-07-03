/**
 * Netflix-Style Detail Screen
 * Conditionally shown when "Netflix Style" is enabled in Settings.
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
  Alert,
  Dimensions,
  FlatList,
  Image,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import WebView from 'react-native-webview';
import RNFS from 'react-native-fs';
import { Movie, TVShow, VideoData, AppError } from '../types';
import { TMDBService } from '../services';
import WebViewScrapper from '../components/WebViewScrapper';
import { DownloadButton } from '../components/DownloadComponents';
import { useAppState } from '../hooks/useAppState';
import { useContentWatchProgress } from '../hooks/useAppSelectors';
import type { RootStackScreenProps } from '../types/navigation';
import { getGenreNameById } from '../utils/genreMap';
import NetflixMediaPlayer from '../components/MediaPlayer/NetflixMediaPlayer';

const { width: SW, height: SH } = Dimensions.get('window');
const HERO_HEIGHT = SH * 0.3;
const TMDB_IMG = (path: string | null | undefined, size = 'w500') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : '';

type Props = RootStackScreenProps<'Detail'>;

const tmdbService = new TMDBService();

const isMovie = (item: Movie | TVShow | null): item is Movie =>
  !!item && 'title' in item;

// Injecting an HTML page instead of a bare URL gives WebView a proper page
// origin, which prevents YouTube error 153 (embed restricted).
const makeYouTubeHtml = (key: string, autoplay: boolean, muted = false, loop = false): string => {
  const muteParam = muted ? 1 : 0;
  const loopParam = loop ? 1 : 0;
  const loopExtra = loop ? `&playlist=${key}` : '';
  const src = `https://www.youtube-nocookie.com/embed/${key}?autoplay=1&mute=${muteParam}&loop=${loopParam}${loopExtra}&controls=1&rel=0&modestbranding=1&iv_load_policy=3&playsinline=1`;
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
* { margin:0; padding:0; background:#000; }
body { width:100vw; height:100vh; overflow:hidden; }
iframe { width:100%; height:100%; border:none; }
</style>
</head>
<body>
<iframe src="${src}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</body>
</html>`;
};

type TabKey = 'episodes' | 'moreLikeThis' | 'trailers';

const dividerStyles = StyleSheet.create({
  line: { height: 1, backgroundColor: '#2a2a2a', marginHorizontal: 16 },
});
const EpisodeDivider = () => <View style={dividerStyles.line} />;

const NetflixDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { content, video: localVideoPath, isLocal, autoPlay } = route.params || {};
  const validContent = content && typeof content === 'object' ? content : null;

  const { addLikedContent, removeLikedContent, isContentLiked } = useAppState();
  const contentIsMovie = useMemo(() => isMovie(validContent), [validContent]);
  const contentType = contentIsMovie ? 'movie' : ('tv' as const);

  const contentTitle = useMemo(() =>
    validContent ? (contentIsMovie ? (validContent as Movie).title : (validContent as TVShow).name) : '',
    [validContent, contentIsMovie]);
  const releaseDate = useMemo(() =>
    validContent ? (contentIsMovie ? (validContent as Movie).release_date : (validContent as TVShow).first_air_date) || '' : '',
    [validContent, contentIsMovie]);
  const releaseYear = useMemo(() => releaseDate ? new Date(releaseDate).getFullYear() : 'Unknown', [releaseDate]);

  const imageUrl = useMemo(() =>
    TMDB_IMG(validContent?.backdrop_path || validContent?.poster_path),
    [validContent]);

  const watchProgress = useContentWatchProgress(validContent?.id ?? 0, contentType);
  const isLiked = validContent ? isContentLiked(validContent.id, contentType) : false;

  useEffect(() => {
    if (!isLocal || !localVideoPath) return;

    const checkFile = async () => {
      try {
        const exists = await RNFS.exists(localVideoPath);
        setLocalFileExists(!!exists);
        if (exists) {
          setCurrentVideoUrl(localVideoPath);
          setShowFullPlayer(true);
        }
      } catch {
        setLocalFileExists(false);
      }
    };

    checkFile();
  }, [isLocal, localVideoPath]);

  // ── tabs ────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>(contentIsMovie ? 'moreLikeThis' : 'episodes');

  // ── video / scraping ────────────────────────────────────────────────────────
  const [currentVideoUrl, setCurrentVideoUrl] = useState('');
  const [showFullPlayer, setShowFullPlayer] = useState(false);
  const [initialVideoDuration, setInitialVideoDuration] = useState(0);
  const [scraping, setScraping] = useState<{ active: boolean; error: string | null; show: boolean }>({
    active: false, error: null, show: false,
  });
  const [pendingDownload, setPendingDownload] = useState(false);
  const [localFileExists, setLocalFileExists] = useState(false);
  const pendingFullscreenRef = useRef(false);
  const hasAppliedWatchProgressRef = useRef(false);

  // ── TV state ────────────────────────────────────────────────────────────────
  const [tvState, setTvState] = useState<{
    seasons: any[];
    selectedSeason: number;
    selectedEpisode: number | null;
    episodes: any[];
    loading: boolean;
    details: any;
  }>({ seasons: [], selectedSeason: 1, selectedEpisode: null, episodes: [], loading: false, details: null });

  // ── trailers ────────────────────────────────────────────────────────────────
  const [trailers, setTrailers] = useState<VideoData[]>([]);
  const [loadingTrailers, setLoadingTrailers] = useState(false);
  const [activeTrailer, setActiveTrailer] = useState<VideoData | null>(null);
  const [trailerPlaying, setTrailerPlaying] = useState(false);
  const [heroTrailer, setHeroTrailer] = useState<VideoData | null>(null);
  const [heroTrailerPlaying, setHeroTrailerPlaying] = useState(false);
  const [_heroVideoReady, setHeroVideoReady] = useState(false);
  const [heroTrailerFallbackIdx, setHeroTrailerFallbackIdx] = useState(0);

  // ── similar content ─────────────────────────────────────────────────────────
  const [similarContent, setSimilarContent] = useState<(Movie | TVShow)[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [loadingMoreSimilar, setLoadingMoreSimilar] = useState(false);
  const [similarPage, setSimilarPage] = useState(1);
  const [hasMoreSimilar, setHasMoreSimilar] = useState(true);

  // ── genre names ─────────────────────────────────────────────────────────────
  const genreNames = useMemo(() => {
    if (!validContent) return [];
    const detailed = contentIsMovie ? (validContent as any).genres : tvState.details?.genres;
    if (Array.isArray(detailed) && detailed.length > 0) return detailed.map((g: any) => g?.name).filter(Boolean);
    if (Array.isArray(validContent?.genre_ids) && validContent.genre_ids.length > 0)
      return Array.from(new Set(validContent.genre_ids.map((id: any) => getGenreNameById(id)).filter(Boolean)));
    return [];
  }, [validContent, tvState.details, contentIsMovie]);

  // ── like toggle ─────────────────────────────────────────────────────────────
  const toggleLike = useCallback(async () => {
    if (!validContent) return;
    try {
      if (isLiked) await removeLikedContent(validContent.id, contentType);
      else await addLikedContent(validContent.id, contentType);
    } catch { Alert.alert('Error', 'Failed to update liked content'); }
  }, [isLiked, validContent, contentType, addLikedContent, removeLikedContent]);

  // ── fetch trailers ──────────────────────────────────────────────────────────
  const fetchTrailers = useCallback(async (id: number) => {
    setLoadingTrailers(true);
    try {
      const res = contentIsMovie
        ? await tmdbService.getMovieVideos(id)
        : await tmdbService.getTVShowVideos(id);
      const vids = (res?.results ?? []).filter(
        (v: VideoData) => v.site === 'YouTube' && ['Trailer', 'Teaser', 'Clip', 'Featurette'].includes(v.type),
      );
      setTrailers(vids);
      setHeroTrailerFallbackIdx(0);
      const mainTrailer = vids.find((v: VideoData) => v.type === 'Trailer') ?? vids[0] ?? null;
      setHeroTrailer(mainTrailer);
      if (vids.length > 0) setActiveTrailer(vids[0]);
    } catch {
      setTrailers([]);
    } finally { setLoadingTrailers(false); }
  }, [contentIsMovie]);

  // ── fetch similar ───────────────────────────────────────────────────────────
  const fetchSimilar = useCallback(async (item: Movie | TVShow, page = 1, isMore = false) => {
    if (!item) return;
    if (isMore) setLoadingMoreSimilar(true);
    else { setLoadingSimilar(true); setSimilarContent([]); setSimilarPage(1); setHasMoreSimilar(true); }
    try {
      const res = isMovie(item)
        ? await tmdbService.getSimilarMovies(item.id, page)
        : await tmdbService.getSimilarTVShows(item.id, page);
      if (isMore) setSimilarContent(p => [...p, ...res.results]);
      else setSimilarContent(res.results);
      setSimilarPage(page);
      setHasMoreSimilar(page < res.total_pages);
    } catch (e) {
      if (!isMore) { Alert.alert('Error', (e as AppError).message || 'Failed to load similar content'); setSimilarContent([]); }
    } finally { setLoadingSimilar(false); setLoadingMoreSimilar(false); }
  }, []);

  // ── fetch TV details ────────────────────────────────────────────────────────
  const fetchSeasonEpisodes = useCallback(async (tvId: number, seasonNum: number, opts?: { autoSelectEpisode?: number }) => {
    try {
      const details = await tmdbService.getSeasonDetails(tvId, seasonNum);
      const eps: any[] = details.episodes || [];
      setTvState(prev => {
        const upd: any = { ...prev, episodes: eps };
        if (opts?.autoSelectEpisode) {
          const m = eps.find((ep: any) => ep.episode_number === opts.autoSelectEpisode);
          if (m) upd.selectedEpisode = m.episode_number;
        }
        return upd;
      });
    } catch { setTvState(prev => ({ ...prev, episodes: [] })); }
  }, []);

  const fetchTVDetails = useCallback(async (tvId: number) => {
    if (!tvId) return;
    setTvState(prev => ({ ...prev, loading: true }));
    try {
      const details = await tmdbService.getTVShowDetails(tvId);
      const seasons = details.number_of_seasons
        ? Array.from({ length: details.number_of_seasons }, (_, i) => ({ season_number: i + 1, name: `Season ${i + 1}` }))
        : [];
      setTvState(prev => ({ ...prev, details, seasons, loading: false }));
      if (details.number_of_seasons > 0) await fetchSeasonEpisodes(tvId, 1);
    } catch {
      Alert.alert('Error', 'Failed to load TV show details');
      setTvState(prev => ({ ...prev, loading: false }));
    }
  }, [fetchSeasonEpisodes]);

  // ── season / episode handlers ───────────────────────────────────────────────
  const handleSeasonChange = useCallback((seasonNum: number) => {
    hasAppliedWatchProgressRef.current = true;
    setTvState(prev => ({ ...prev, selectedSeason: seasonNum, selectedEpisode: null }));
    if (validContent && !contentIsMovie) fetchSeasonEpisodes(validContent.id, seasonNum);
  }, [validContent, fetchSeasonEpisodes, contentIsMovie]);

  const handleEpisodeChange = useCallback((epNum: number, _epName: string) => {
    hasAppliedWatchProgressRef.current = true;
    pendingFullscreenRef.current = showFullPlayer;
    setTvState(prev => ({ ...prev, selectedEpisode: epNum }));
    setInitialVideoDuration(0);
    setCurrentVideoUrl('');
    setShowFullPlayer(false);
    setScraping({ show: true, active: true, error: null });
  }, [showFullPlayer]);

  // ── scraping handlers ───────────────────────────────────────────────────────
  const handleVideoExtracted = useCallback((data: { videoUrl: string }) => {
    const { selectedSeason, selectedEpisode } = tvState;
    setCurrentVideoUrl(data.videoUrl);
    setShowFullPlayer(true);
    setScraping({ show: false, active: false, error: null });

    const isResumingProgress = !contentIsMovie && watchProgress?.season && watchProgress?.episode &&
      ((watchProgress.season === selectedSeason && watchProgress.episode === selectedEpisode) || selectedEpisode === null);
    const isManualChange = hasAppliedWatchProgressRef.current && !isResumingProgress;
    const shouldApply = !isManualChange && (watchProgress?.progress ?? 0) > 0 && (contentIsMovie || isResumingProgress);
    setInitialVideoDuration(shouldApply && watchProgress ? (watchProgress.progress / 100) * watchProgress.duration : 0);

    if (pendingDownload) {
      setPendingDownload(false);
    }
  }, [pendingDownload, contentIsMovie, tvState, watchProgress]);

  const handleScrapingError = useCallback((err: string) => {
    setPendingDownload(false);
    setScraping({ active: false, error: err, show: false });
    Alert.alert('Video Error', `Failed to load video: ${err}`, [{ text: 'OK', onPress: () => setScraping(p => ({ ...p, error: null })) }]);
  }, []);

  // ── play trigger ────────────────────────────────────────────────────────────
  const handlePressPlay = useCallback(() => {
    hasAppliedWatchProgressRef.current = true;
    if (!contentIsMovie) {
      if (tvState.selectedEpisode === null && tvState.episodes.length > 0) {
        setTvState(prev => ({ ...prev, selectedEpisode: tvState.episodes[0].episode_number }));
      }
    }
    setScraping({ show: true, active: true, error: null });
  }, [contentIsMovie, tvState]);

  // ── watch progress restoration ──────────────────────────────────────────────
  useEffect(() => {
    if (!validContent) return;
    const { seasons, selectedSeason, episodes } = tvState;
    if (contentIsMovie || hasAppliedWatchProgressRef.current || !watchProgress?.season || !watchProgress?.episode || seasons.length === 0) return;
    if (!seasons.some((s: any) => s.season_number === watchProgress.season)) { hasAppliedWatchProgressRef.current = true; return; }
    const apply = async () => {
      try {
        if (selectedSeason !== watchProgress.season) {
          setTvState(prev => ({ ...prev, selectedSeason: watchProgress.season! }));
          await fetchSeasonEpisodes(validContent.id, watchProgress.season!, { autoSelectEpisode: watchProgress.episode });
        } else {
          const m = episodes.find((ep: any) => ep.episode_number === watchProgress.episode);
          if (m) setTvState(prev => ({ ...prev, selectedEpisode: m.episode_number }));
          else await fetchSeasonEpisodes(validContent.id, selectedSeason, { autoSelectEpisode: watchProgress.episode });
        }
      } finally { hasAppliedWatchProgressRef.current = true; }
    };
    apply();
  }, [validContent, tvState, fetchSeasonEpisodes, contentIsMovie, watchProgress]);

  // ── initial fetch ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!validContent) return;
    fetchSimilar(validContent);
    fetchTrailers(validContent.id);
    if (!contentIsMovie) fetchTVDetails(validContent.id);
  }, [validContent, fetchSimilar, fetchTrailers, fetchTVDetails, contentIsMovie]);

  // ── reset on content change ─────────────────────────────────────────────────
  useEffect(() => {
    if (validContent) hasAppliedWatchProgressRef.current = false;
  }, [validContent]);

  // ── navigatin blur ──────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      setShowFullPlayer(false);
      setCurrentVideoUrl('');
      setHeroTrailerPlaying(false);
    });
    return unsub;
  }, [navigation]);

  // ── helpers ─────────────────────────────────────────────────────────────────
  const currentEpisodeInfo = tvState.episodes.find((e: any) => e.episode_number === tvState.selectedEpisode);
  const currentSeasonInfo = tvState.seasons.find((s: any) => s.season_number === tvState.selectedSeason);

  // ── Tab: Episodes ───────────────────────────────────────────────────────────
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);

  const renderEpisode = useCallback(({ item }: { item: any }) => {
    const isActive = tvState.selectedEpisode === item.episode_number;
    return (
      <TouchableOpacity
        style={[s.episodeRow, isActive && s.episodeRowActive]}
        onPress={() => handleEpisodeChange(item.episode_number, item.name)}
        activeOpacity={0.75}
      >
        <View style={s.episodeThumb}>
          {item.still_path ? (
            <Image source={{ uri: TMDB_IMG(item.still_path, 'w300') }} style={s.episodeThumbImg} resizeMode="cover" />
          ) : (
            <View style={s.episodeThumbEmpty}><Icon name="play-circle-outline" size={22} color="rgba(255,255,255,0.4)" /></View>
          )}
          {isActive && <View style={s.episodePlayingBadge}><Text style={s.episodePlayingBadgeText}>▶ Playing</Text></View>}
        </View>

        <View style={s.episodeInfo}>
          <View style={s.episodeInfoTop}>
            <Text style={s.episodeNum}>E{item.episode_number}</Text>
            {item.runtime && <Text style={s.episodeMeta}>{item.runtime} min</Text>}
          </View>
          <Text style={[s.episodeName, isActive && s.episodeNameActive]} numberOfLines={2}>{item.name}</Text>
          {item.overview ? <Text style={s.episodeOverview} numberOfLines={2}>{item.overview}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  }, [tvState.selectedEpisode, handleEpisodeChange]);

  // ── Tab: Trailers ───────────────────────────────────────────────────────────
  const renderTrailerCard = useCallback(({ item }: { item: VideoData }) => {
    const isActive = activeTrailer?.key === item.key;
    return (
      <TouchableOpacity
        style={[s.trailerCard, isActive && s.trailerCardActive]}
        onPress={() => { setActiveTrailer(item); setTrailerPlaying(true); }}
        activeOpacity={0.8}
      >
        <Image
          source={{ uri: `https://img.youtube.com/vi/${item.key}/mqdefault.jpg` }}
          style={s.trailerThumb}
          resizeMode="cover"
        />
        <View style={s.trailerPlayOverlay}>
          <Icon name={isActive && trailerPlaying ? 'pause-circle' : 'play-circle'} size={36} color="rgba(255,255,255,0.9)" />
        </View>
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={s.trailerCardGradient}>
          <Text style={s.trailerCardTitle} numberOfLines={2}>{item.name}</Text>
          <Text style={s.trailerCardType}>{item.type}</Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }, [activeTrailer, trailerPlaying]);

  if (isLocal && localVideoPath && !localFileExists) {
    return (
      <SafeAreaView style={s.root}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#fff' }}>Downloaded file not found or cannot be played.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── If full player is active ────────────────────────────────────────────────
  if (showFullPlayer && currentVideoUrl) {
    return (
      <NetflixMediaPlayer
        key={`${validContent?.id}-${tvState.selectedSeason}-${tvState.selectedEpisode}`}
        videoUrl={currentVideoUrl}
        title={contentTitle}
        contentId={validContent?.id ?? 0}
        contentType={contentType}
        initialProgress={initialVideoDuration}
        season={!contentIsMovie ? tvState.selectedSeason : undefined}
        episode={!contentIsMovie ? tvState.selectedEpisode ?? undefined : undefined}
        seasons={tvState.seasons}
        episodes={tvState.episodes}
        selectedSeason={tvState.selectedSeason}
        selectedEpisode={tvState.selectedEpisode}
        onSeasonChange={handleSeasonChange}
        onEpisodeChange={handleEpisodeChange}
        onEnd={() => setShowFullPlayer(false)}
        onBack={() => setShowFullPlayer(false)}
        navigation={navigation}
      />
    );
  }

  // ── Main detail layout ──────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        {/* ───────────── HERO ───────────── */}
        <View style={s.heroOuter}>
          {/* Backdrop / trailer image */}
          <Image
            source={{ uri: imageUrl }}
            style={s.heroImage}
            resizeMode="cover"
          />

          {/* Trailer player over the hero */}
          {heroTrailer && (
            <View style={s.heroPlayerWrapper}>
              <WebView
                source={{ html: makeYouTubeHtml(heroTrailer.key, heroTrailerPlaying, true, true), baseUrl: 'https://www.youtube-nocookie.com' }}
                style={s.webviewFlex}
                javaScriptEnabled
                originWhitelist={['*']}
                allowsInlineMediaPlayback
                allowsFullscreenVideo={false}
                mediaPlaybackRequiresUserAction={false}
                scrollEnabled={false}
                onLoad={() => setHeroVideoReady(true)}
                onHttpError={() => {
                  const nextIdx = heroTrailerFallbackIdx + 1;
                  if (nextIdx < trailers.length) {
                    setHeroTrailerFallbackIdx(nextIdx);
                    setHeroTrailer(trailers[nextIdx]);
                  } else {
                    setHeroTrailer(null);
                  }
                }}
                onError={() => {
                  const nextIdx = heroTrailerFallbackIdx + 1;
                  if (nextIdx < trailers.length) {
                    setHeroTrailerFallbackIdx(nextIdx);
                    setHeroTrailer(trailers[nextIdx]);
                  } else {
                    setHeroTrailer(null);
                  }
                }}
              />
            </View>
          )}

          {/* Trailer preview loader - removed */}

          {/* Gradient over hero */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.5)', '#000000']}
            style={s.heroGradient}
            pointerEvents="none"
          />

          {/* Absolutely positioned top bar (back + like) */}
          <View style={s.heroTopBar} pointerEvents="box-none">
            <TouchableOpacity style={s.heroTopBtn} onPress={() => navigation.goBack()}>
              <Icon name="arrow-left" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={s.heroTopRight}>
              {heroTrailer && (
                <TouchableOpacity
                  style={s.heroTopBtn}
                  onPress={() => {
                    setHeroVideoReady(false);
                    setHeroTrailerPlaying(false);
                    setTimeout(() => setHeroVideoReady(true), 200);
                  }}
                >
                  <Icon name={heroTrailerPlaying ? 'volume-high' : 'play-circle-outline'} size={22} color="#FFFFFF" />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.heroTopBtn} onPress={toggleLike}>
                <Icon
                  name={isLiked ? 'cards-heart' : 'cards-heart-outline'}
                  size={22}
                  color={isLiked ? '#E50914' : '#FFFFFF'}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ───────────── INFO ───────────── */}
        <View style={s.infoSection}>
          <Text style={s.infoTitle}>{contentTitle}</Text>

          <View style={s.metaRow}>
            <Text style={s.metaText}>{releaseYear}</Text>
            <View style={s.metaDot} />
            <Text style={s.metaText}>★ {validContent?.vote_average?.toFixed(1)}</Text>
            {genreNames.length > 0 && (<><View style={s.metaDot} /><Text style={s.metaText}>{genreNames.slice(0, 2).join(', ')}</Text></>)}
          </View>

          {validContent?.overview ? (
            <Text style={s.overview} numberOfLines={4}>{validContent.overview}</Text>
          ) : null}

          {/* Scraping error */}
          {scraping.error ? (
            <View style={s.errorBanner}>
              <Icon name="alert-circle-outline" size={16} color="#E50914" />
              <Text style={s.errorBannerText}>Failed to load: {scraping.error}</Text>
            </View>
          ) : null}


          <View style={s.actionRow}>
            {/* Action buttons */}
            <TouchableOpacity
                style={[s.playBtn, scraping.active && s.playBtnLoading]}
                onPress={handlePressPlay}
                disabled={scraping.active}
                activeOpacity={0.85}
            >
                {scraping.active ? (
                <><ActivityIndicator size="small" color="#000" style={s.mr8} /><Text style={s.playBtnText}>Loading...</Text></>
                ) : (
                <><Icon name="play" size={20} color="#000" style={s.mr6} /><Text style={s.playBtnText}>Play</Text></>
                )}
            </TouchableOpacity>
            {!isLocal && (
            <DownloadButton
              content={content}
              videoUrl={currentVideoUrl}
              season={!contentIsMovie ? tvState.selectedSeason : undefined}
              episode={!contentIsMovie ? tvState.selectedEpisode ?? undefined : undefined}
              episodeTitle={!contentIsMovie && tvState.episodes.length > 0 ? tvState.episodes.find((ep: any) => ep.episode_number === tvState.selectedEpisode)?.name : undefined}
              size="medium"
              style={s.downloadBtn}
              onVideoNeeded={() => {
                if (!contentIsMovie && tvState.selectedEpisode === null && tvState.episodes.length > 0) {
                  setTvState(prev => ({ ...prev, selectedEpisode: tvState.episodes[0].episode_number }));
                }
                setPendingDownload(true);
                setScraping({ show: true, active: true, error: null });
              }}
              isPreparingVideo={scraping.active && pendingDownload}
            />
            )}
          </View>

          {/* TV current episode info */}
          {!contentIsMovie && currentEpisodeInfo && (
            <View style={s.nowPlayingBanner}>
              <Icon name="play-circle" size={14} color="#E50914" />
              <Text style={s.nowPlayingText}>
                {currentSeasonInfo?.name} · E{currentEpisodeInfo.episode_number} – {currentEpisodeInfo.name}
              </Text>
            </View>
          )}
        </View>

        {/* ───────────── TABS ───────────── */}
        <View style={s.tabBar}>
          {!contentIsMovie && (
            <TouchableOpacity
              style={[s.tab, activeTab === 'episodes' && s.tabActive]}
              onPress={() => setActiveTab('episodes')}
            >
              <Text style={[s.tabText, activeTab === 'episodes' && s.tabTextActive]}>Episodes</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.tab, activeTab === 'moreLikeThis' && s.tabActive]}
            onPress={() => setActiveTab('moreLikeThis')}
          >
            <Text style={[s.tabText, activeTab === 'moreLikeThis' && s.tabTextActive]}>More Like This</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tab, activeTab === 'trailers' && s.tabActive]}
            onPress={() => setActiveTab('trailers')}
          >
            <Text style={[s.tabText, activeTab === 'trailers' && s.tabTextActive]}>Trailers</Text>
          </TouchableOpacity>
        </View>

        {/* ── Episodes tab ────────────────────────────────────────────────── */}
        {activeTab === 'episodes' && !contentIsMovie && (
          <View style={s.tabContent}>
            {/* Season dropdown */}
            {tvState.seasons.length > 1 && (
              <View style={s.seasonDropdownRow}>
                <TouchableOpacity
                  style={s.seasonDropdownBtn}
                  onPress={() => setShowSeasonDropdown(p => !p)}
                >
                  <Text style={s.seasonDropdownBtnText}>
                    {currentSeasonInfo?.name ?? `Season ${tvState.selectedSeason}`}
                  </Text>
                  <Icon name={showSeasonDropdown ? 'chevron-up' : 'chevron-down'} size={16} color="#FFFFFF" />
                </TouchableOpacity>

                {showSeasonDropdown && (
                  <View style={s.seasonDropdownList}>
                    {tvState.seasons.map((season: any) => (
                      <TouchableOpacity
                        key={season.season_number}
                        style={[s.seasonDropdownItem, tvState.selectedSeason === season.season_number && s.seasonDropdownItemActive]}
                        onPress={() => { handleSeasonChange(season.season_number); setShowSeasonDropdown(false); }}
                      >
                        <Text style={[s.seasonDropdownItemText, tvState.selectedSeason === season.season_number && s.seasonDropdownItemTextActive]}>
                          {season.name}
                        </Text>
                        {tvState.selectedSeason === season.season_number && <Icon name="check" size={14} color="#E50914" />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {tvState.loading ? (
              <ActivityIndicator size="small" color="#E50914" style={s.mt20} />
            ) : (
              <FlatList
                data={tvState.episodes}
                keyExtractor={(item: any) => String(item.episode_number)}
                renderItem={renderEpisode}
                scrollEnabled={false}
                ItemSeparatorComponent={EpisodeDivider}
              />
            )}
          </View>
        )}

        {/* ── More Like This tab ───────────────────────────────────────────── */}
        {activeTab === 'moreLikeThis' && (
          <View style={s.tabContent}>
            {loadingSimilar ? (
              <ActivityIndicator size="small" color="#E50914" style={s.mt20} />
            ) : similarContent.length === 0 ? (
              <Text style={s.emptyText}>No similar content found.</Text>
            ) : (
              <FlatList
                data={similarContent}
                keyExtractor={(item: any) => String(item.id)}
                numColumns={3}
                scrollEnabled={false}
                contentContainerStyle={s.gridContent}
                renderItem={({ item }: { item: Movie | TVShow }) => (
                  <TouchableOpacity
                    style={s.gridCard}
                    onPress={() => navigation.push('Detail', { content: item })}
                    activeOpacity={0.8}
                  >
                    <Image
                      source={{ uri: TMDB_IMG(item.poster_path || item.backdrop_path) }}
                      style={s.gridCardImg}
                      resizeMode="cover"
                    />
                    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={s.gridCardGradient}>
                      <Text style={s.gridCardTitle} numberOfLines={2}>
                        {isMovie(item) ? item.title : item.name}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )}
                onEndReached={() => { if (!loadingMoreSimilar && hasMoreSimilar && validContent) fetchSimilar(validContent, similarPage + 1, true); }}
                onEndReachedThreshold={0.3}
                ListFooterComponent={loadingMoreSimilar ? <ActivityIndicator size="small" color="#E50914" style={s.m16} /> : null}
              />
            )}
          </View>
        )}

        {/* ── Trailers tab ─────────────────────────────────────────────────── */}
        {activeTab === 'trailers' && (
          <View style={s.tabContent}>
          {/* Active trailer player */}
          {activeTrailer && (
            <View style={s.trailerPlayerWrapper}>
              <WebView
                source={{ html: makeYouTubeHtml(activeTrailer.key, trailerPlaying, false, false), baseUrl: 'https://www.youtube-nocookie.com' }}
                style={s.trailerWebView}
                javaScriptEnabled
                originWhitelist={['*']}
                allowsFullscreenVideo
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                scrollEnabled={false}
                onHttpError={() => {
                  const currentIdx = trailers.findIndex(t => t.key === activeTrailer.key);
                  const next = trailers.find((_, i) => i > currentIdx);
                  if (next) setActiveTrailer(next);
                }}
              />
            </View>
          )}

            {loadingTrailers ? (
              <ActivityIndicator size="small" color="#E50914" style={s.mt16} />
            ) : trailers.length === 0 ? (
              <Text style={s.emptyText}>No trailers available.</Text>
            ) : (
              <FlatList
                data={trailers}
                keyExtractor={item => item.key}
                renderItem={renderTrailerCard}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.trailerListContent}
              />
            )}
          </View>
        )}

        <View style={s.bottomPad} />
      </ScrollView>

      {/* ── WebView scraper ─────────────────────────────────────────────────── */}
      {scraping.show && (
        <WebViewScrapper
          tmdbId={content?.id}
          type={contentType}
          seasonNumber={!contentIsMovie ? tvState.selectedSeason : undefined}
          episodeNumber={!contentIsMovie ? tvState.selectedEpisode ?? undefined : undefined}
          onDataExtracted={handleVideoExtracted}
          onLoading={(loading) => setScraping(prev => ({ ...prev, active: loading }))}
          onError={handleScrapingError}
        />
      )}
    </SafeAreaView>
  );
};

// ── styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  scroll: { flex: 1 },
  // HERO
  heroOuter: { width: SW, height: HERO_HEIGHT, backgroundColor: '#141414', position: 'relative' },
  heroImage: { width: SW, height: HERO_HEIGHT, position: 'absolute' },
  heroPlayerWrapper: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  heroGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: HERO_HEIGHT * 0.6 },
  heroTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  heroTopRight: { flexDirection: 'row', gap: 8 },
  heroTopBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // INFO
  infoSection: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  infoTitle: { color: '#FFF', fontSize: 26, fontWeight: '800', marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 12, gap: 6 },
  metaText: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.4)' },
  overview: { color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 21, marginBottom: 16 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(229,9,20,0.15)', borderRadius: 8, padding: 10, marginBottom: 12, gap: 8 },
  errorBannerText: { color: '#E50914', fontSize: 13, flex: 1 },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    paddingVertical: 14,
    width: 300,
    marginBottom: 10,
  },
  playBtnLoading: { backgroundColor: 'rgba(255,255,255,0.7)' },
  playBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 12, justifyContent: 'center', alignItems: 'center' },
  downloadBtn: {},
  nowPlayingBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  nowPlayingText: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  // TABS
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    marginTop: 8,
  },
  tab: { flex: 1, paddingVertical: 13, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#E50914' },
  tabText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#FFFFFF' },
  tabContent: { paddingHorizontal: 16, paddingTop: 16 },
  // Season dropdown
  seasonDropdownRow: { marginBottom: 16 },
  seasonDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  seasonDropdownBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  seasonDropdownList: {
    backgroundColor: '#1e1e1e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginTop: 6,
    overflow: 'hidden',
  },
  seasonDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  seasonDropdownItemActive: { backgroundColor: 'rgba(229,9,20,0.12)' },
  seasonDropdownItemText: { color: 'rgba(255,255,255,0.75)', fontSize: 14 },
  seasonDropdownItemTextActive: { color: '#FFF', fontWeight: '700' },
  // Episode row
  episodeRow: {
    flexDirection: 'row',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    marginHorizontal: 16,
    marginVertical: 6,
  },
  episodeRowActive: { backgroundColor: '#1a0000', borderWidth: 1.5, borderColor: '#E50914' },
  episodeThumb: { width: 130, height: 85, backgroundColor: '#2a2a2a', position: 'relative' },
  episodeThumbImg: { width: '100%', height: '100%' },
  episodeThumbEmpty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  episodePlayingBadge: {
    position: 'absolute', bottom: 5, left: 5, backgroundColor: '#E50914',
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2,
  },
  episodePlayingBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '700' },
  episodeInfo: { flex: 1, padding: 10 },
  episodeInfoTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  episodeNum: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
  episodeMeta: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  episodeName: { color: '#FFF', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  episodeNameActive: { color: '#E50914' },
  episodeOverview: { color: 'rgba(255,255,255,0.5)', fontSize: 11, lineHeight: 16, marginTop: 4 },
  episodeDivider: { height: 8 },
  // More Like This grid
  gridContent: { paddingBottom: 8 },
  gridCard: {
    flex: 1 / 3,
    aspectRatio: 2 / 3,
    margin: 3,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  gridCardImg: { width: '100%', height: '100%' },
  gridCardGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 6, paddingBottom: 6 },
  gridCardTitle: { color: '#FFF', fontSize: 11, fontWeight: '600', lineHeight: 15 },
  // Trailers
  trailerPlayerWrapper: { borderRadius: 10, overflow: 'hidden', marginBottom: 14 },
  trailerListContent: { paddingBottom: 4, gap: 10 },
  trailerCard: {
    width: SW * 0.65,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  trailerCardActive: { borderColor: '#E50914' },
  trailerThumb: { width: '100%', height: SW * 0.65 * 0.5625 },
  trailerPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trailerCardGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 10 },
  trailerCardTitle: { color: '#FFF', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  trailerCardType: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 },
  // misc
  emptyText: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 30, fontSize: 14 },
  bottomPad: { height: 60 },
  webviewFlex: { flex: 1 },
  mr8: { marginRight: 8 },
  mr6: { marginRight: 6 },
  mt20: { marginTop: 20 },
  m16: { margin: 16 },
  trailerWebView: { height: SH * 0.2, width: '100%' },
  mt16: { marginTop: 16 },
});

export default NetflixDetailScreen;
