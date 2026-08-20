import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { SUBTITLE_LANGUAGES } from '@/lib/languages';
import {
  useSubtitleSettings,
  type SubtitleSettings,
} from '@/lib/subtitleSettings';
import { cn } from '@/lib/utils';
import type { StreamflixWebSource } from '@/lib/streamflix';

export type { StreamflixWebSource };

export interface AudioOption {
  id: number;
  label: string;
}

export interface SubtitleOption {
  id: string;
  label: string;
  url?: string;
  language?: string;
}

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  container?: HTMLElement | null;
  sources: StreamflixWebSource[];
  activeSourceId: string | null;
  onSelectSource: (id: string) => void;
  audioTracks: AudioOption[];
  selectedAudioId: number | null;
  onSelectAudio: (id: number) => void;
  subtitles: SubtitleOption[];
  selectedSubtitleId: string | null;
  onSelectSubtitle: (id: string | null) => void;
  subtitlesLoading?: boolean;
  subtitlesError?: string | null;
  subtitleOffset: number;
  onChangeOffset: (next: number) => void;
}

const FONT_STEPS = [14, 16, 18, 20, 24, 28, 32];
const TEXT_COLORS = ['#FFFFFF', '#FFE66D', '#00E5FF', '#FF6B6B', '#B8F2E6'];
const BG_COLORS = ['#000000', '#1A1A1A', '#003366', '#4A0000', '#1B4332'];

const OptionButton = ({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm',
      active ? 'bg-primary/20 font-semibold' : 'text-muted-foreground hover:bg-primary/10',
    )}
  >
    {label}
  </button>
);

const formatOffset = (seconds: number): string => {
  if (seconds === 0) return 'In sync';
  const sign = seconds > 0 ? '+' : '';
  return `${sign}${seconds}s`;
};

const ColorSwatch = ({
  color,
  selected,
  onClick,
}: {
  color: string;
  selected: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-label={color}
    onClick={onClick}
    className={cn(
      'size-7 rounded-full border',
      selected ? 'border-primary ring-2 ring-primary' : 'border-border',
    )}
    style={{ backgroundColor: color }}
  />
);

const AppearanceControls = ({
  settings,
  update,
  reset,
}: {
  settings: SubtitleSettings;
  update: (patch: Partial<SubtitleSettings>) => void;
  reset: () => void;
}) => {
  const bumpFont = (dir: -1 | 1) => {
    const idx = FONT_STEPS.indexOf(settings.fontSize);
    const next =
      FONT_STEPS[Math.min(FONT_STEPS.length - 1, Math.max(0, (idx < 0 ? 2 : idx) + dir))];
    update({ fontSize: next });
  };
  const bumpOpacity = (dir: -1 | 1) => {
    const next = Math.min(
      1,
      Math.max(0, Math.round((settings.backgroundOpacity + dir * 0.1) * 10) / 10),
    );
    update({ backgroundOpacity: next });
  };
  const bgAlpha = Math.round(settings.backgroundOpacity * 255)
    .toString(16)
    .padStart(2, '0');

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold">Caption style</h3>
      <div
        className="flex justify-center rounded-lg bg-muted/40 py-6"
      >
        <div
          className="rounded-md px-3 py-1.5"
          style={{ backgroundColor: `${settings.backgroundColor}${bgAlpha}` }}
        >
          <p
            className="text-center"
            style={{
              color: settings.textColor,
              fontSize: settings.fontSize,
              fontWeight: settings.bold ? 700 : 400,
              textShadow: settings.textShadow ? '0 1px 3px rgba(0,0,0,0.85)' : 'none',
            }}
          >
            Sample subtitle preview
          </p>
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Default language</p>
        <div className="flex flex-wrap gap-1.5">
          {SUBTITLE_LANGUAGES.map((lang) => (
            <Button
              key={lang.code || 'none'}
              type="button"
              size="chip"
              variant={settings.defaultLanguage === lang.code ? 'default' : 'outline'}
              className="h-8"
              onClick={() => update({ defaultLanguage: lang.code })}
            >
              {lang.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Font size</span>
        <div className="flex items-center gap-2">
          <Button type="button" size="chip" variant="outline" onClick={() => bumpFont(-1)}>
            A-
          </Button>
          <span className="w-8 text-center text-sm">{settings.fontSize}</span>
          <Button type="button" size="chip" variant="outline" onClick={() => bumpFont(1)}>
            A+
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Text color</p>
        <div className="flex gap-2">
          {TEXT_COLORS.map((color) => (
            <ColorSwatch
              key={color}
              color={color}
              selected={settings.textColor === color}
              onClick={() => update({ textColor: color })}
            />
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Background</p>
        <div className="flex gap-2">
          {BG_COLORS.map((color) => (
            <ColorSwatch
              key={color}
              color={color}
              selected={settings.backgroundColor === color}
              onClick={() => update({ backgroundColor: color })}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Background opacity</span>
        <div className="flex items-center gap-2">
          <Button type="button" size="chip" variant="outline" onClick={() => bumpOpacity(-1)}>
            −
          </Button>
          <span className="w-10 text-center text-sm">
            {Math.round(settings.backgroundOpacity * 100)}%
          </span>
          <Button type="button" size="chip" variant="outline" onClick={() => bumpOpacity(1)}>
            +
          </Button>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="chip"
          variant={settings.bold ? 'default' : 'outline'}
          onClick={() => update({ bold: !settings.bold })}
        >
          Bold
        </Button>
        <Button
          type="button"
          size="chip"
          variant={settings.textShadow ? 'default' : 'outline'}
          onClick={() => update({ textShadow: !settings.textShadow })}
        >
          Shadow
        </Button>
        <Button type="button" size="chip" variant="ghost" onClick={reset}>
          Reset style
        </Button>
      </div>
    </section>
  );
};

export const SettingsSheet = ({
  open,
  onOpenChange,
  container,
  sources,
  activeSourceId,
  onSelectSource,
  audioTracks,
  selectedAudioId,
  onSelectAudio,
  subtitles,
  selectedSubtitleId,
  onSelectSubtitle,
  subtitlesLoading,
  subtitlesError,
  subtitleOffset,
  onChangeOffset,
}: SettingsSheetProps) => {
  const { settings, update, reset } = useSubtitleSettings();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent container={container}>
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Source, audio, and subtitles stay on this device. Playback still follows the host.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="mt-4 min-h-0 flex-1">
          <div className="flex flex-col gap-5 pr-2">
            {sources.length > 1 ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold">Source</h3>
                <div className="space-y-1">
                  {sources.map((source) => (
                    <OptionButton
                      key={source.id}
                      label={source.name}
                      active={source.id === activeSourceId}
                      onClick={() => onSelectSource(source.id)}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {audioTracks.length > 1 ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold">Audio</h3>
                <div className="space-y-1">
                  {audioTracks.map((track, idx) => (
                    <OptionButton
                      key={track.id}
                      label={track.label}
                      active={
                        selectedAudioId == null ? idx === 0 : track.id === selectedAudioId
                      }
                      onClick={() => onSelectAudio(track.id)}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <h3 className="mb-2 text-sm font-semibold">Subtitles</h3>
              {selectedSubtitleId != null ? (
                <div className="mb-3 rounded-lg border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Subtitle sync</span>
                    {subtitleOffset !== 0 ? (
                      <button
                        type="button"
                        className="text-xs font-semibold text-primary"
                        onClick={() => onChangeOffset(0)}
                      >
                        Reset
                      </button>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="chip"
                      className="h-9 px-3"
                      disabled={subtitleOffset <= -10}
                      onClick={() =>
                        onChangeOffset(
                          Math.max(-10, Math.round((subtitleOffset - 0.25) * 100) / 100),
                        )
                      }
                    >
                      −0.25s
                    </Button>
                    <span className="min-w-16 text-center text-sm">
                      {formatOffset(subtitleOffset)}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="chip"
                      className="h-9 px-3"
                      disabled={subtitleOffset >= 10}
                      onClick={() =>
                        onChangeOffset(
                          Math.min(10, Math.round((subtitleOffset + 0.25) * 100) / 100),
                        )
                      }
                    >
                      +0.25s
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="space-y-1">
                <OptionButton
                  label="Off"
                  active={selectedSubtitleId == null}
                  onClick={() => onSelectSubtitle(null)}
                />
                {subtitlesLoading ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    Loading more tracks…
                  </p>
                ) : null}
                {subtitlesError ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">{subtitlesError}</p>
                ) : null}
                {subtitles.map((track) => (
                  <OptionButton
                    key={track.id}
                    label={track.label}
                    active={track.id === selectedSubtitleId}
                    onClick={() => onSelectSubtitle(track.id)}
                  />
                ))}
                {!subtitlesLoading && !subtitlesError && subtitles.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    No subtitles found for this title.
                  </p>
                ) : null}
              </div>
            </section>

            <AppearanceControls settings={settings} update={update} reset={reset} />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
