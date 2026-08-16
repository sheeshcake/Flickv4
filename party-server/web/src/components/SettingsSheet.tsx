import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface StreamflixWebSource {
  id: string;
  name: string;
  language?: string;
  kind: 'hls' | 'file';
  url: string;
  subtitles: { label: string; file: string }[];
}

export interface AudioOption {
  id: number;
  label: string;
}

export interface SubtitleOption {
  id: string;
  label: string;
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
  subtitleOffset: number;
  onChangeOffset: (next: number) => void;
}

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
  subtitleOffset,
  onChangeOffset,
}: SettingsSheetProps) => (
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
            <div className="space-y-1">
              <OptionButton
                label="Off"
                active={selectedSubtitleId == null}
                onClick={() => onSelectSubtitle(null)}
              />
              {subtitles.map((track) => (
                <OptionButton
                  key={track.id}
                  label={track.label}
                  active={track.id === selectedSubtitleId}
                  onClick={() => onSelectSubtitle(track.id)}
                />
              ))}
            </div>
            {selectedSubtitleId != null ? (
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {formatOffset(subtitleOffset)}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="chip"
                    className="h-9 px-3"
                    onClick={() =>
                      onChangeOffset(Math.max(-10, Math.round((subtitleOffset - 0.25) * 100) / 100))
                    }
                  >
                    −0.25s
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="chip"
                    className="h-9 px-3"
                    onClick={() =>
                      onChangeOffset(Math.min(10, Math.round((subtitleOffset + 0.25) * 100) / 100))
                    }
                  >
                    +0.25s
                  </Button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </ScrollArea>
    </SheetContent>
  </Sheet>
);
