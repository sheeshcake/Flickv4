import { useCallback, useMemo, useState } from 'react';
import { FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  RefreshCw,
  Trash2,
} from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { Center } from '@/components/ui/center';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { Image } from '@/components/ui/image';
import { Spinner } from '@/components/ui/spinner';
import { Focusable } from '@/src/components/Focusable';
import { ConfirmDialog } from '@/src/components/ConfirmDialog';
import { useDownloads } from '@/src/hooks/useDownloads';
import { formatBytes, type DownloadJob } from '@/src/services/DownloadService';
import { TMDBService } from '@/src/services/TMDBService';
import { getTitle, type MediaItem } from '@/src/types';
import type { RootStackParamList } from '@/src/navigation/types';
import { TV_FOCUS_BORDER_CLASSNAME } from '@/src/utils/tv';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const statusLabel = (job: DownloadJob): string => {
  switch (job.status) {
    case 'queued':
      return 'Queued';
    case 'resolving':
      return 'Finding stream…';
    case 'downloading':
      if (job.totalSegments > 1) {
        return `Downloading ${job.completedSegments}/${job.totalSegments} segments`;
      }
      return 'Downloading';
    case 'paused':
      return 'Paused';
    case 'completed':
      return 'Ready to play';
    case 'failed':
      return `Failed: ${job.error ?? 'unknown error'}`;
  }
};

/**
 * "downloaded / total" string using the actual full size of the file.
 *
 * - Direct-file (MP4) jobs get an exact total from the native downloader's
 *   `expectedBytes`.
 * - HLS jobs learn the exact total from a parallel HEAD-probe pass that
 *   `DownloadService.downloadHls` fires at job start, so once that lands
 *   (usually within a few seconds) the total is real, not estimated.
 * - Completed jobs collapse to a single figure since downloaded == total.
 */
const sizeLabel = (job: DownloadJob): string => {
  const downloaded = formatBytes(job.bytesWritten);
  if (job.status === 'completed') return downloaded;
  if (job.totalBytes > 0) {
    return `${downloaded} / ${formatBytes(job.totalBytes)}`;
  }
  return downloaded;
};

// ---------------------------------------------------------------------------
// Grouping: TV episodes collapse into one card per show; movies stand alone.
// ---------------------------------------------------------------------------

type MovieEntry = { kind: 'movie'; job: DownloadJob; createdAt: number };
type ShowEntry = {
  kind: 'show';
  showId: string;
  item: MediaItem;
  episodes: DownloadJob[];
  createdAt: number;
};
type Entry = MovieEntry | ShowEntry;

const groupJobs = (jobs: DownloadJob[]): Entry[] => {
  const shows = new Map<string, ShowEntry>();
  const movies: MovieEntry[] = [];

  for (const job of jobs) {
    const isTv = (job.item.media_type ?? 'movie') === 'tv';
    if (isTv) {
      const key = `tv-${job.item.id}`;
      const existing = shows.get(key);
      if (existing) {
        existing.episodes.push(job);
        // Float a show up when a *new* episode is enqueued (createdAt is
        // set once and never mutated). We deliberately ignore updatedAt
        // here so progress ticks don't reshuffle the list.
        if (job.createdAt > existing.createdAt) {
          existing.createdAt = job.createdAt;
        }
      } else {
        shows.set(key, {
          kind: 'show',
          showId: key,
          item: job.item,
          episodes: [job],
          createdAt: job.createdAt,
        });
      }
    } else {
      movies.push({ kind: 'movie', job, createdAt: job.createdAt });
    }
  }

  // Stable sort each show's episodes by season then episode.
  for (const show of shows.values()) {
    show.episodes.sort((a, b) => {
      const sa = a.season ?? 0;
      const sb = b.season ?? 0;
      if (sa !== sb) return sa - sb;
      return (a.episode ?? 0) - (b.episode ?? 0);
    });
  }

  const all: Entry[] = [...movies, ...shows.values()];
  // Newest download first. Stable across progress ticks because createdAt
  // is stamped once at enqueue.
  all.sort((a, b) => b.createdAt - a.createdAt);
  return all;
};

/**
 * Roll episode statuses into a compact summary line for the collapsed card.
 */
const summarizeEpisodes = (episodes: DownloadJob[]): string => {
  const buckets = { downloading: 0, ready: 0, paused: 0, failed: 0, queued: 0 };
  for (const ep of episodes) {
    if (ep.status === 'completed') buckets.ready += 1;
    else if (ep.status === 'downloading' || ep.status === 'resolving')
      buckets.downloading += 1;
    else if (ep.status === 'paused') buckets.paused += 1;
    else if (ep.status === 'failed') buckets.failed += 1;
    else buckets.queued += 1;
  }
  const parts: string[] = [];
  if (buckets.downloading) parts.push(`${buckets.downloading} downloading`);
  if (buckets.ready) parts.push(`${buckets.ready} ready`);
  if (buckets.paused) parts.push(`${buckets.paused} paused`);
  if (buckets.failed) parts.push(`${buckets.failed} failed`);
  if (buckets.queued) parts.push(`${buckets.queued} queued`);
  return parts.join(' · ');
};

export const DownloadsScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { jobs, pause, resume, remove } = useDownloads();
  const [pendingDelete, setPendingDelete] = useState<DownloadJob | null>(null);

  const entries = useMemo(() => groupJobs(jobs), [jobs]);

  const play = useCallback(
    (job: DownloadJob) => {
      if (job.status !== 'completed') return;
      navigation.navigate('Player', {
        item: job.item,
        title: job.title,
        localSourceId: job.id,
        season: job.season,
        episode: job.episode,
        subtitle:
          job.season != null && job.episode != null
            ? `S${job.season} E${job.episode}`
            : undefined,
      });
    },
    [navigation],
  );

  const primaryAction = useCallback(
    (job: DownloadJob) => {
      if (job.status === 'downloading' || job.status === 'resolving' || job.status === 'queued') {
        void pause(job.id);
      } else if (job.status === 'paused' || job.status === 'failed') {
        void resume(job.id);
      } else if (job.status === 'completed') {
        play(job);
      }
    },
    [pause, resume, play],
  );

  return (
    <Box className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <Heading size="2xl" bold className="mb-4 mt-4 px-4 text-foreground">
        Downloads
      </Heading>

      {entries.length === 0 ? (
        <Center className="flex-1 px-8">
          <Text className="text-center text-muted-foreground">
            No downloads yet. Tap Download on a movie or an episode to save it
            here for offline playback.
          </Text>
        </Center>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(entry) =>
            entry.kind === 'movie' ? entry.job.id : entry.showId
          }
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 12 }}
          renderItem={({ item: entry }) =>
            entry.kind === 'movie' ? (
              <DownloadRow
                job={entry.job}
                onPrimary={() => primaryAction(entry.job)}
                onDelete={() => setPendingDelete(entry.job)}
                onPlay={() => play(entry.job)}
              />
            ) : (
              <DownloadGroupCard
                entry={entry}
                onPrimary={primaryAction}
                onDelete={setPendingDelete}
                onPlay={play}
              />
            )
          }
        />
      )}

      <ConfirmDialog
        visible={pendingDelete != null}
        title="Delete download?"
        message={
          pendingDelete
            ? `Remove "${pendingDelete.title}" from your device? This frees up ${formatBytes(pendingDelete.bytesWritten)}.`
            : ''
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (pendingDelete) void remove(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Group card for TV shows — collapsed by default, expands to a list of rows.
// ---------------------------------------------------------------------------

const DownloadGroupCard = ({
  entry,
  onPrimary,
  onDelete,
  onPlay,
}: {
  entry: ShowEntry;
  onPrimary: (job: DownloadJob) => void;
  onDelete: (job: DownloadJob) => void;
  onPlay: (job: DownloadJob) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const poster = TMDBService.getImageUrl(entry.item.poster_path, 'w300');
  const totalBytes = entry.episodes.reduce(
    (sum, ep) => sum + (ep.bytesWritten || 0),
    0,
  );
  const summary = summarizeEpisodes(entry.episodes);
  const showTitle = getTitle(entry.item);

  return (
    <Box className="rounded-lg bg-card p-3">
      <Focusable
        onPress={() => setExpanded((v) => !v)}
        className="rounded-md"
        focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
      >
        <HStack space="md" className="items-center">
          <Box className="h-24 w-16 overflow-hidden rounded-md bg-background">
            {poster ? (
              <Image
                source={{ uri: poster }}
                alt={showTitle}
                resizeMode="cover"
                className="h-full w-full"
              />
            ) : null}
          </Box>
          <VStack className="flex-1">
            <Heading size="sm" className="text-foreground" numberOfLines={2}>
              {showTitle}
            </Heading>
            <Text size="xs" className="text-muted-foreground">
              {entry.episodes.length} episode
              {entry.episodes.length === 1 ? '' : 's'} · {formatBytes(totalBytes)}
            </Text>
            {summary ? (
              <Text size="xs" className="mt-0.5 text-muted-foreground">
                {summary}
              </Text>
            ) : null}
          </VStack>
          <Icon
            as={expanded ? ChevronUp : ChevronDown}
            className="text-foreground"
          />
        </HStack>
      </Focusable>

      {expanded ? (
        <VStack space="sm" className="mt-3 border-t border-border pt-3">
          {entry.episodes.map((ep) => (
            <EpisodeRow
              key={ep.id}
              job={ep}
              onPrimary={() => onPrimary(ep)}
              onDelete={() => onDelete(ep)}
              onPlay={() => onPlay(ep)}
            />
          ))}
        </VStack>
      ) : null}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Compact episode row inside an expanded show group — no poster (the show
// header already has one), tighter vertical rhythm.
// ---------------------------------------------------------------------------

const EpisodeRow = ({
  job,
  onPrimary,
  onDelete,
  onPlay,
}: {
  job: DownloadJob;
  onPrimary: () => void;
  onDelete: () => void;
  onPlay: () => void;
}) => {
  const progress =
    job.totalSegments > 0
      ? (job.completedSegments / job.totalSegments) * 100
      : job.totalBytes > 0
        ? (job.bytesWritten / job.totalBytes) * 100
        : 0;

  const primaryIcon =
    job.status === 'completed'
      ? Play
      : job.status === 'paused' || job.status === 'failed'
        ? RefreshCw
        : Pause;

  const label =
    job.season != null && job.episode != null
      ? `S${job.season} E${job.episode}`
      : job.title;

  return (
    <HStack space="md" className="items-center">
      <VStack className="flex-1">
        <Heading size="xs" className="text-foreground" numberOfLines={1}>
          {label}
        </Heading>
        <Text size="xs" className="text-muted-foreground" numberOfLines={1}>
          {job.qualityLabel} · {sizeLabel(job)}
        </Text>
        <Text size="xs" className="mt-0.5 text-muted-foreground" numberOfLines={1}>
          {statusLabel(job)}
        </Text>
        {job.status === 'downloading' || job.status === 'paused' ? (
          <Box className="mt-2 h-1 w-full rounded-full bg-background">
            <Box
              className="h-1 rounded-full bg-primary"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </Box>
        ) : null}
      </VStack>

      <HStack space="xs" className="items-center">
        {job.status === 'completed' ? (
          <Focusable
            onPress={onPlay}
            className="rounded-full bg-primary p-2"
            focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
          >
            <Icon as={Play} className="text-primary-foreground" />
          </Focusable>
        ) : job.status === 'downloading' || job.status === 'resolving' || job.status === 'queued' ? (
          <Spinner size="small" color="#E50914" />
        ) : job.status === 'failed' ? (
          <Icon as={AlertCircle} className="text-primary" />
        ) : (
          <Icon as={CheckCircle2} className="text-muted-foreground" />
        )}

        <Focusable
          onPress={onPrimary}
          className="rounded-full bg-background/40 p-2"
          focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
        >
          <Icon as={primaryIcon} className="text-foreground" />
        </Focusable>

        <Focusable
          onPress={onDelete}
          className="rounded-full bg-background/40 p-2"
          focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
        >
          <Icon as={Trash2} className="text-foreground" />
        </Focusable>
      </HStack>
    </HStack>
  );
};

// ---------------------------------------------------------------------------
// Movie row — same UI as before (poster + full metadata + action stack).
// ---------------------------------------------------------------------------

const DownloadRow = ({
  job,
  onPrimary,
  onDelete,
  onPlay,
}: {
  job: DownloadJob;
  onPrimary: () => void;
  onDelete: () => void;
  onPlay: () => void;
}) => {
  const poster = TMDBService.getImageUrl(job.item.poster_path, 'w300');
  const progress =
    job.totalSegments > 0
      ? (job.completedSegments / job.totalSegments) * 100
      : job.totalBytes > 0
        ? (job.bytesWritten / job.totalBytes) * 100
        : 0;

  const primaryIcon =
    job.status === 'completed'
      ? Play
      : job.status === 'paused' || job.status === 'failed'
        ? RefreshCw
        : Pause;

  return (
    <Box className="rounded-lg bg-card p-3">
      <HStack space="md" className="items-center">
        <Box className="h-24 w-16 overflow-hidden rounded-md bg-background">
          {poster ? (
            <Image
              source={{ uri: poster }}
              alt={getTitle(job.item)}
              resizeMode="cover"
              className="h-full w-full"
            />
          ) : null}
        </Box>
        <VStack className="flex-1">
          <Heading size="sm" className="text-foreground" numberOfLines={2}>
            {job.title}
          </Heading>
          <Text size="xs" className="text-muted-foreground">
            {job.qualityLabel} · {sizeLabel(job)}
          </Text>
          <Text size="xs" className="mt-0.5 text-muted-foreground">
            {statusLabel(job)}
          </Text>

          {job.status === 'downloading' || job.status === 'paused' ? (
            <Box className="mt-2 h-1 w-full rounded-full bg-background">
              <Box
                className="h-1 rounded-full bg-primary"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </Box>
          ) : null}
        </VStack>

        <VStack space="xs" className="items-center">
          {job.status === 'completed' ? (
            <Focusable
              onPress={onPlay}
              className="rounded-full bg-primary p-2"
              focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
            >
              <Icon as={Play} className="text-primary-foreground" />
            </Focusable>
          ) : job.status === 'downloading' || job.status === 'resolving' || job.status === 'queued' ? (
            <Spinner size="small" color="#E50914" />
          ) : job.status === 'failed' ? (
            <Icon as={AlertCircle} className="text-primary" />
          ) : (
            <Icon as={CheckCircle2} className="text-muted-foreground" />
          )}

          <Focusable
            onPress={onPrimary}
            className="rounded-full bg-background/40 p-2"
            focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
          >
            <Icon as={primaryIcon} className="text-foreground" />
          </Focusable>

          <Focusable
            onPress={onDelete}
            className="rounded-full bg-background/40 p-2"
            focusedClassName={TV_FOCUS_BORDER_CLASSNAME}
          >
            <Icon as={Trash2} className="text-foreground" />
          </Focusable>
        </VStack>
      </HStack>
    </Box>
  );
};
