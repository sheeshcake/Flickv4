import { StyleSheet } from 'react-native';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { useSubtitleSettings } from '@/src/hooks/useSubtitleSettings';

interface SubtitleOverlayProps {
  text: string | null;
  /** Lift cues above visible controls when they're shown. */
  controlsVisible?: boolean;
  /**
   * Reposition captions for the tiny Picture-in-Picture window.
   *
   * NOTE: On iOS, AVKit's PiP window shows only the native video surface, so
   * this React Native overlay cannot render inside the PiP mini window. On
   * Android, react-native-video enters activity-level PiP and this overlay
   * is drawn scaled down inside the mini window (readability depends on the
   * user's fontSize setting).
   */
  pipActive?: boolean;
}

export const SubtitleOverlay = ({
  text,
  controlsVisible = false,
  pipActive = false,
}: SubtitleOverlayProps) => {
  const { settings } = useSubtitleSettings();

  if (!text) return null;

  const bgAlpha = Math.round(settings.backgroundOpacity * 255)
    .toString(16)
    .padStart(2, '0');
  const backgroundColor = `${settings.backgroundColor}${bgAlpha}`;

  // In PiP the window is tiny and there are no controls to sit above, so
  // hug the bottom with a small padding. Otherwise, respect controls.
  const bottom = pipActive ? 8 : controlsVisible ? 96 : 40;
  const horizontalPadding = pipActive ? 'px-2' : 'px-8';

  return (
    <Box
      pointerEvents="none"
      className={`absolute left-0 right-0 items-center ${horizontalPadding}`}
      style={{ bottom }}
    >
      <Box
        className="max-w-full rounded-md px-3 py-1.5"
        style={{ backgroundColor }}
      >
        <Text
          className="text-center"
          style={{
            color: settings.textColor,
            fontSize: settings.fontSize,
            fontWeight: settings.bold ? '700' : '400',
            ...StyleSheet.flatten({}),
          }}
        >
          {text}
        </Text>
      </Box>
    </Box>
  );
};
