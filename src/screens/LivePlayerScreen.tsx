import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StatusBar, StyleSheet, useWindowDimensions } from 'react-native';
import Video, { type ReactVideoSource } from 'react-native-video';
import { useKeepAwake } from 'expo-keep-awake';
import { NavigationBar } from 'expo-navigation-bar';
import { ArrowLeft, VideoOff } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { Center } from '@/components/ui/center';
import { Icon } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { PlayerControls } from '@/src/components/player/PlayerControls';
import { LivePlayerChannelDrawer } from '@/src/components/player/LivePlayerChannelDrawer';
import { useControlsVisibility } from '@/src/components/player/useControlsVisibility';
import { useTVRemote } from '@/src/components/player/useTVRemote';
import {
  DaddyLiveService,
  friendlyLiveTvError,
  type LiveChannel,
  type LiveStream,
} from '@/src/services/DaddyLiveService';
import { forceLandscape, restoreOrientation } from '@/src/utils/orientation';
import { isTV } from '@/src/utils/tv';
import type { RootStackScreenProps } from '@/src/navigation/types';

export const LivePlayerScreen = ({
  route,
  navigation,
}: RootStackScreenProps<'LivePlayer'>) => {
  const { channel: initialChannel, channels, stream: initialStream } =
    route.params;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  useKeepAwake('flick-live-player');

  const [channel, setChannel] = useState<LiveChannel>(initialChannel);
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [volume, setVolume] = useState(1);
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const overlayOpen = channelsOpen;
  const { visible, show, toggle } = useControlsVisibility(!paused, overlayOpen);

  useEffect(() => {
    forceLandscape();
    if (Platform.OS === 'android') {
      NavigationBar.setHidden(true);
    }
    return () => {
      restoreOrientation();
      if (Platform.OS === 'android') {
        NavigationBar.setHidden(false);
      }
    };
  }, []);

  const loadStream = useCallback(async (next: LiveChannel) => {
    setLoading(true);
    setError(null);
    setStream(null);
    setResolvingId(next.id);
    try {
      const resolved = await DaddyLiveService.getStream(next.id);
      setChannel(next);
      setStream(resolved);
      void DaddyLiveService.pushRecent(next.id);
    } catch (e) {
      setError(friendlyLiveTvError(e));
    } finally {
      setLoading(false);
      setResolvingId(null);
    }
  }, []);

  useEffect(() => {
    if (initialStream?.url) {
      setChannel(initialChannel);
      setStream(initialStream);
      setLoading(false);
      void DaddyLiveService.pushRecent(initialChannel.id);
      return;
    }
    void loadStream(initialChannel);
  }, [initialChannel, initialStream, loadStream]);

  const source = useMemo<ReactVideoSource | null>(() => {
    if (!stream?.url) return null;
    return {
      uri: stream.url,
      type: /\.mpd(\?|$)/i.test(stream.url) ? 'mpd' : 'm3u8',
      headers: stream.headers,
    };
  }, [stream]);

  const handleSelectChannel = useCallback(
    (next: LiveChannel) => {
      if (next.id === channel.id) {
        setChannelsOpen(false);
        return;
      }
      setChannelsOpen(false);
      void loadStream(next);
    },
    [channel.id, loadStream],
  );

  useTVRemote({
    onPlayPause: overlayOpen ? undefined : () => setPaused((p) => !p),
    onSelect: undefined,
    onUp: overlayOpen ? undefined : show,
    onDown: overlayOpen ? undefined : show,
  });

  const handleBack = useCallback(() => navigation.goBack(), [navigation]);

  return (
    <Box className="flex-1 bg-black">
      <StatusBar hidden />
      {source && !loading ? (
        <Video
          key={channel.id}
          source={source}
          style={
            isTV
              ? StyleSheet.absoluteFill
              : { width: windowWidth, height: windowHeight }
          }
          controls={false}
          resizeMode="contain"
          pointerEvents="none"
          paused={paused}
          volume={volume}
          playInBackground={false}
          ignoreSilentSwitch="ignore"
          onError={() =>
            setError('This channel failed to play. Try another one.')
          }
        />
      ) : null}

      {loading ? (
        <Center style={StyleSheet.absoluteFill} className="bg-black">
          <Spinner size="large" color="#E50914" />
          <Text className="mt-4 text-muted-foreground">
            Tuning {channel.name}…
          </Text>
        </Center>
      ) : null}

      {error && !loading ? (
        <Center style={StyleSheet.absoluteFill} className="bg-black px-8">
          <Icon as={VideoOff} size="xl" className="mb-4 text-muted-foreground" />
          <Text size="lg" bold className="text-center text-foreground">
            Can’t play this channel
          </Text>
          <Text size="sm" className="mt-2 text-center text-muted-foreground">
            {error}
          </Text>
        </Center>
      ) : null}

      {visible && !loading ? (
        <PlayerControls
          title={channel.name}
          subtitle={channel.nowPlaying}
          playing={!paused}
          currentTime={0}
          duration={0}
          isLive
          onOverlayPress={toggle}
          onBack={handleBack}
          onTogglePlay={() => setPaused((p) => !p)}
          onSeekBy={() => {}}
          onScrub={() => {}}
          onScrubEnd={() => {}}
          onOpenEpisodes={
            channels.length
              ? () => setChannelsOpen(true)
              : undefined
          }
          volume={volume}
          onVolumeChange={setVolume}
        />
      ) : null}

      {!visible && !overlayOpen && !loading ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={show}
          focusable
          hasTVPreferredFocus
        />
      ) : null}

      {error && !loading ? (
        <Pressable
          onPress={handleBack}
          hitSlop={16}
          style={{ position: 'absolute', top: 24, left: 16, zIndex: 10 }}
        >
          <Icon as={ArrowLeft} size="xl" className="text-foreground" />
        </Pressable>
      ) : null}

      <LivePlayerChannelDrawer
        visible={channelsOpen}
        channels={channels}
        activeChannelId={channel.id}
        resolvingId={resolvingId}
        onSelect={handleSelectChannel}
        onClose={() => setChannelsOpen(false)}
      />
    </Box>
  );
};
