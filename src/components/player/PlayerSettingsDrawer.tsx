import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import {
  Captions,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Ratio,
  Server,
  Settings2,
  X,
} from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { Focusable } from '@/src/components/Focusable';
import type { PlaybackServer } from '@/src/hooks/useServers';
import {
  getAspectLabel,
  VIDEO_ASPECT_OPTIONS,
  type VideoAspect,
} from '@/src/hooks/useVideoAspect';
import type { Variant } from '@/src/utils/hlsVariants';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

/** Session-only — resets to `1` (Normal) every time a new video is opened,
 * matching the `PlayerCore` state it backs. See the flick-player-controls
 * skill's "session-only vs per-server vs persisted" table for why. */
export const PLAYBACK_SPEED_OPTIONS = [
  0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2,
] as const;

export type PlaybackSpeed = (typeof PLAYBACK_SPEED_OPTIONS)[number];

export const formatPlaybackSpeed = (speed: number): string =>
  speed === 1 ? 'Normal' : `${speed}x`;

/** A single selectable subtitle entry, decoupled from how it's ultimately
 * rendered (drawn by our own `SubtitleOverlay` vs. handed to
 * react-native-video as a native sidecar text track — see
 * `useSubtitleSettings`'s `renderMode`). */
export interface SubtitleTrackOption {
  id: string;
  label: string;
}

const OFFSET_STEP = 0.25;
const OFFSET_MIN = -10;
const OFFSET_MAX = 10;

const formatOffset = (seconds: number): string => {
  if (seconds === 0) return 'In sync';
  const sign = seconds > 0 ? '+' : '';
  return `${sign}${seconds}s`;
};

const formatBitrate = (bps: number): string => {
  if (!bps) return '';
  const mbps = bps / 1_000_000;
  if (mbps >= 1) return `${mbps.toFixed(1)} Mbps`;
  return `${Math.round(bps / 1000)} kbps`;
};

type SettingsCategory = 'server' | 'quality' | 'aspect' | 'speed' | 'subtitles';

const CATEGORY_LABELS: Record<SettingsCategory, string> = {
  server: 'Server',
  quality: 'Video quality',
  aspect: 'Aspect ratio',
  speed: 'Playback speed',
  subtitles: 'Subtitles',
};

interface PlayerSettingsDrawerProps {
  visible: boolean;
  onClose: () => void;
  servers: PlaybackServer[];
  activeServerId: string;
  /** Omit to hide the Server setting entirely (e.g. while playing a local
   * download, where there's no scraper to re-run against a different
   * server). */
  onSelectServer?: (id: string) => void;
  variants: Variant[];
  /** `null` means "Auto" (master ABR). */
  selectedVariantUri: string | null;
  onSelectQuality: (variant: Variant | null) => void;
  aspect: VideoAspect;
  onSelectAspect: (next: VideoAspect) => void;
  playbackRate: PlaybackSpeed;
  onSelectSpeed: (next: PlaybackSpeed) => void;
  subtitleTracks: SubtitleTrackOption[];
  selectedSubtitleId: string | null;
  subtitlesLoading?: boolean;
  onSelectSubtitle: (id: string | null) => void;
  /** Current subtitle sync offset in seconds. Only meaningful (and shown)
   * once a track is selected. */
  subtitleOffsetSeconds: number;
  /**
   * Sync steppers callback. Component mode shifts cue lookup; native mode
   * rewrites the local VTT sidecar timestamps in `PlayerCore`.
   */
  onChangeSubtitleOffset?: (next: number) => void;
}

/**
 * Right-sidebar settings drawer — same shell as `PlayerEpisodeDrawer`
 * (`w-[45%]`, full height, scrim backdrop, no enter/exit animation).
 * Consolidates what used to be four separate bottom sheets (quality,
 * aspect, speed, subtitles) into one grouped main menu with per-category
 * drill-down submenus, all sharing this single sidebar shell. See the
 * flick-player-controls skill for how to add a new category here instead
 * of a new standalone sheet.
 *
 * Picking an option returns to the main menu (drawer stays open) rather
 * than closing outright, since settings are grouped together here — the
 * user can tweak more than one before dismissing via the scrim or the
 * header `X`, both of which reset back to the main menu on close so the
 * drawer never reopens deep in a submenu.
 */
export const PlayerSettingsDrawer = ({
  visible,
  onClose,
  servers,
  activeServerId,
  onSelectServer,
  variants,
  selectedVariantUri,
  onSelectQuality,
  aspect,
  onSelectAspect,
  playbackRate,
  onSelectSpeed,
  subtitleTracks,
  selectedSubtitleId,
  subtitlesLoading,
  onSelectSubtitle,
  subtitleOffsetSeconds,
  onChangeSubtitleOffset,
}: PlayerSettingsDrawerProps) => {
  const [activeCategory, setActiveCategory] =
    useState<SettingsCategory | null>(null);

  if (!visible) return null;

  const handleClose = () => {
    setActiveCategory(null);
    onClose();
  };

  const bumpOffset = (dir: -1 | 1) => {
    if (!onChangeSubtitleOffset) return;
    const next =
      Math.round((subtitleOffsetSeconds + dir * OFFSET_STEP) * 100) / 100;
    onChangeSubtitleOffset(Math.min(OFFSET_MAX, Math.max(OFFSET_MIN, next)));
  };

  const activeServerName =
    servers.find((s) => s.id === activeServerId)?.name ?? 'Unknown';
  const qualityValue =
    selectedVariantUri == null
      ? 'Auto'
      : variants.find((v) => v.uri === selectedVariantUri)?.label ?? 'Auto';
  const subtitleValue =
    selectedSubtitleId == null
      ? 'Off'
      : subtitleTracks.find((t) => t.id === selectedSubtitleId)?.label ??
        'On';

  return (
    <Box style={StyleSheet.absoluteFill} className="z-50">
      {/* Scrim: closes the drawer (back to the main menu) on tap. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleClose}>
        <Box className="h-full w-full bg-background/70" />
      </Pressable>

      <Box className="absolute bottom-0 right-0 top-0 w-[45%] bg-card">
        <HStack className="items-center justify-between px-4 py-3">
          <HStack space="sm" className="items-center">
            {activeCategory != null && (
              <Focusable
                onPress={() => setActiveCategory(null)}
                className="rounded-full p-1"
                focusedClassName={`bg-primary/20 ${TV_FOCUS_BORDER_CLASSNAME}`}
              >
                <Icon as={ChevronLeft} className="text-foreground" />
              </Focusable>
            )}
            <Heading size="md" className="text-foreground">
              {activeCategory != null
                ? CATEGORY_LABELS[activeCategory]
                : 'Settings'}
            </Heading>
          </HStack>
          <Focusable
            onPress={handleClose}
            className="rounded-full p-1"
            focusedClassName={`bg-primary ${TV_FOCUS_BORDER_CLASSNAME}`}
          >
            <Icon as={X} className="text-foreground" />
          </Focusable>
        </HStack>

        <ScrollView className="flex-1 px-4 pb-6">
          {activeCategory == null && (
            <VStack space="lg">
              {onSelectServer && servers.length > 1 && (
                <SettingsSection title="Source">
                  <SettingsMenuRow
                    icon={Server}
                    label="Server"
                    value={activeServerName}
                    onPress={() => setActiveCategory('server')}
                  />
                </SettingsSection>
              )}

              <SettingsSection title="Video">
                {variants.length > 1 && (
                  <SettingsMenuRow
                    icon={Settings2}
                    label="Quality"
                    value={qualityValue}
                    onPress={() => setActiveCategory('quality')}
                  />
                )}
                <SettingsMenuRow
                  icon={Ratio}
                  label="Aspect ratio"
                  value={getAspectLabel(aspect)}
                  onPress={() => setActiveCategory('aspect')}
                />
              </SettingsSection>

              <SettingsSection title="Audio & subtitles">
                <SettingsMenuRow
                  icon={Captions}
                  label="Subtitles"
                  value={subtitleValue}
                  onPress={() => setActiveCategory('subtitles')}
                />
              </SettingsSection>

              <SettingsSection title="Playback">
                <SettingsMenuRow
                  icon={Gauge}
                  label="Speed"
                  value={formatPlaybackSpeed(playbackRate)}
                  onPress={() => setActiveCategory('speed')}
                />
              </SettingsSection>
            </VStack>
          )}

          {activeCategory === 'server' && (
            <VStack space="xs">
              {servers.map((s, idx) => (
                <OptionRow
                  key={s.id}
                  label={s.name}
                  active={s.id === activeServerId}
                  hasTVPreferredFocus={idx === 0}
                  onPress={() => {
                    onSelectServer?.(s.id);
                    setActiveCategory(null);
                  }}
                />
              ))}
            </VStack>
          )}

          {activeCategory === 'quality' && (
            <VStack space="xs">
              <OptionRow
                label="Auto"
                hint="Adaptive"
                active={selectedVariantUri == null}
                hasTVPreferredFocus
                onPress={() => {
                  onSelectQuality(null);
                  setActiveCategory(null);
                }}
              />
              {variants.map((v) => (
                <OptionRow
                  key={v.uri}
                  label={v.label}
                  hint={formatBitrate(v.bandwidth)}
                  active={selectedVariantUri === v.uri}
                  onPress={() => {
                    onSelectQuality(v);
                    setActiveCategory(null);
                  }}
                />
              ))}
            </VStack>
          )}

          {activeCategory === 'aspect' && (
            <VStack space="xs">
              {VIDEO_ASPECT_OPTIONS.map((opt, idx) => (
                <OptionRow
                  key={opt.value}
                  label={opt.label}
                  hint={opt.hint}
                  active={aspect === opt.value}
                  hasTVPreferredFocus={idx === 0}
                  onPress={() => {
                    onSelectAspect(opt.value);
                    setActiveCategory(null);
                  }}
                />
              ))}
            </VStack>
          )}

          {activeCategory === 'speed' && (
            <VStack space="xs">
              {PLAYBACK_SPEED_OPTIONS.map((speed, idx) => (
                <OptionRow
                  key={speed}
                  label={formatPlaybackSpeed(speed)}
                  active={playbackRate === speed}
                  hasTVPreferredFocus={idx === 0}
                  onPress={() => {
                    onSelectSpeed(speed);
                    setActiveCategory(null);
                  }}
                />
              ))}
            </VStack>
          )}

          {activeCategory === 'subtitles' && (
            <VStack space="xs">
              {/* Sync lives above the track list — it's a property of
                  whatever track is already selected, not another track
                  option, so it reads better as its own section up top
                  rather than tacked on after the list. */}
              {selectedSubtitleId != null && (
                <Box className="mb-3 border-b border-border pb-3">
                  <HStack className="items-center justify-between">
                    <Text size="sm" className="text-muted-foreground">
                      Subtitle sync
                    </Text>
                    {onChangeSubtitleOffset && subtitleOffsetSeconds !== 0 && (
                      <Pressable onPress={() => onChangeSubtitleOffset(0)}>
                        <Text size="xs" className="text-primary">
                          Reset
                        </Text>
                      </Pressable>
                    )}
                  </HStack>
                  {onChangeSubtitleOffset ? (
                    <HStack
                      space="md"
                      className="mt-2 items-center justify-center"
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        onPress={() => bumpOffset(-1)}
                        isDisabled={subtitleOffsetSeconds <= OFFSET_MIN}
                      >
                        <ButtonText>-{OFFSET_STEP}s</ButtonText>
                      </Button>
                      <Text className="min-w-20 text-center text-foreground">
                        {formatOffset(subtitleOffsetSeconds)}
                      </Text>
                      <Button
                        size="sm"
                        variant="outline"
                        onPress={() => bumpOffset(1)}
                        isDisabled={subtitleOffsetSeconds >= OFFSET_MAX}
                      >
                        <ButtonText>+{OFFSET_STEP}s</ButtonText>
                      </Button>
                    </HStack>
                  ) : (
                    <Text size="xs" className="mt-1 text-muted-foreground">
                      Sync is unavailable for this stream.
                    </Text>
                  )}
                </Box>
              )}

              {subtitlesLoading ? (
                <Text className="py-2 text-muted-foreground">
                  Loading tracks…
                </Text>
              ) : (
                <>
                  <OptionRow
                    label="Off"
                    active={selectedSubtitleId == null}
                    hasTVPreferredFocus
                    onPress={() => {
                      onSelectSubtitle(null);
                      setActiveCategory(null);
                    }}
                  />
                  {subtitleTracks.map((track) => (
                    <OptionRow
                      key={track.id}
                      label={track.label}
                      active={selectedSubtitleId === track.id}
                      onPress={() => {
                        onSelectSubtitle(track.id);
                        setActiveCategory(null);
                      }}
                    />
                  ))}
                  {!subtitleTracks.length && (
                    <Text size="sm" className="py-2 text-muted-foreground">
                      No subtitles found for this title.
                    </Text>
                  )}
                </>
              )}
            </VStack>
          )}
        </ScrollView>
      </Box>
    </Box>
  );
};

const SettingsSection = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <VStack space="xs">
    <Text
      size="2xs"
      bold
      className="px-2 uppercase tracking-wide text-muted-foreground"
    >
      {title}
    </Text>
    <VStack className="overflow-hidden rounded-xl bg-background/40">
      {children}
    </VStack>
  </VStack>
);

const SettingsMenuRow = ({
  icon,
  label,
  value,
  onPress,
}: {
  icon: typeof Settings2;
  label: string;
  value: string;
  onPress: () => void;
}) => (
  <Focusable
    onPress={onPress}
    className="flex-row items-center px-3 py-3"
    focusedClassName={`bg-primary/10 ${TV_FOCUS_BORDER_CLASSNAME}`}
  >
    <Icon as={icon} size="sm" className="text-muted-foreground" />
    <Text className="ml-3 flex-1 text-foreground">{label}</Text>
    <Text
      size="sm"
      className="mr-1 text-muted-foreground"
      numberOfLines={1}
    >
      {value}
    </Text>
    <Icon as={ChevronRight} size="sm" className="text-muted-foreground" />
  </Focusable>
);

const OptionRow = ({
  label,
  hint,
  active,
  hasTVPreferredFocus,
  onPress,
}: {
  label: string;
  hint?: string;
  active: boolean;
  hasTVPreferredFocus?: boolean;
  onPress: () => void;
}) => (
  <Focusable
    onPress={onPress}
    hasTVPreferredFocus={hasTVPreferredFocus}
    className={`rounded-md px-3 py-3 ${active ? 'bg-primary/20' : ''}`}
    focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
  >
    <HStack className="items-center justify-between">
      <Text
        className={
          active ? 'font-semibold text-foreground' : 'text-muted-foreground'
        }
      >
        {label}
      </Text>
      {!!hint && (
        <Text size="xs" className="text-muted-foreground">
          {hint}
        </Text>
      )}
    </HStack>
  </Focusable>
);
