import { useSubtitleSettings } from '@/lib/subtitleSettings';

interface SubtitleOverlayProps {
  text: string | null;
  controlsVisible?: boolean;
}

export const SubtitleOverlay = ({
  text,
  controlsVisible = false,
}: SubtitleOverlayProps) => {
  const { settings } = useSubtitleSettings();
  if (!text) return null;

  const bgAlpha = Math.round(settings.backgroundOpacity * 255)
    .toString(16)
    .padStart(2, '0');
  const backgroundColor = `${settings.backgroundColor}${bgAlpha}`;

  return (
    <div
      className="pointer-events-none absolute right-0 left-0 z-10 flex justify-center px-8"
      style={{ bottom: controlsVisible ? 96 : 40 }}
    >
      <div
        className="max-w-full rounded-md px-3 py-1.5"
        style={{ backgroundColor }}
      >
        <p
          className="text-center whitespace-pre-wrap"
          style={{
            color: settings.textColor,
            fontSize: settings.fontSize,
            fontWeight: settings.bold ? 700 : 400,
            textShadow: settings.textShadow ? '0 1px 3px rgba(0,0,0,0.85)' : 'none',
          }}
        >
          {text}
        </p>
      </div>
    </div>
  );
};
