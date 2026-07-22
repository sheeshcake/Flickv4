import { useCallback, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import YoutubePlayer, {
  type YoutubeIframeRef,
} from 'react-native-youtube-iframe';
import { Box } from '@/components/ui/box';

interface TrailerWebViewProps {
  youtubeKey: string;
  /** Hero preview mode: muted looping, no chrome (unless muted=false). */
  preview?: boolean;
  paused?: boolean;
  /** Override mute. Defaults to true in preview, false otherwise. */
  muted?: boolean;
}

/**
 * YouTube embed wrapper backed by `react-native-youtube-iframe`. Controls are
 * always hidden (per product spec) via `initialPlayerParams.controls: false`.
 * The library needs numeric width/height, so we measure the container via
 * `onLayout` and only mount the player once dimensions are known.
 */
export const TrailerWebView = ({
  youtubeKey,
  preview = false,
  paused = false,
  muted,
}: TrailerWebViewProps) => {
  // Preview autoplay is muted on all platforms so Android/iOS allow autoplay
  // without user gesture. Non-preview honors the caller (default: unmuted).
  const isMuted = preview ? true : (muted ?? false);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const playerRef = useRef<YoutubeIframeRef | null>(null);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) =>
      prev && prev.width === width && prev.height === height
        ? prev
        : { width, height },
    );
  }, []);

  // Single-video loops are unreliable via `loop` alone; on 'ended' seek back.
  const onChangeState = useCallback(
    (state: string) => {
      if (preview && state === 'ended') {
        playerRef.current?.seekTo(0, true);
      }
    },
    [preview],
  );

  if (paused) {
    return <Box className="h-full w-full bg-background" />;
  }

  return (
    <Box className="h-full w-full bg-black" onLayout={onLayout}>
      {size ? (
        <YoutubePlayer
          // Remount when the mute/preview mode flips since `initialPlayerParams`
          // are applied only at mount time.
          key={`${youtubeKey}-${isMuted ? 'm' : 'u'}-${preview ? 'p' : 'f'}`}
          ref={playerRef}
          height={size.height}
          width={size.width}
          videoId={youtubeKey}
          play={!paused}
          mute={isMuted}
          // Android's mobile WebView refuses YouTube autoplay even when muted;
          // this flag swaps the UA to desktop Chrome so `playVideo()` succeeds.
          // Safe on iOS (only affects Android userAgent).
          forceAndroidAutoplay={preview}
          onChangeState={onChangeState}
          initialPlayerParams={{
            controls: false,
            modestbranding: true,
            rel: false,
            loop: preview,
            iv_load_policy: 3,
            preventFullScreen: preview,
          }}
          webViewProps={{
            pointerEvents: preview ? 'none' : 'auto',
            allowsInlineMediaPlayback: true,
            mediaPlaybackRequiresUserAction: false,
            // Hardware layer gives smoother playback and works around Android
            // muted-autoplay flakiness inside embedded WebViews.
            androidLayerType: 'hardware',
          }}
        />
      ) : null}
    </Box>
  );
};
