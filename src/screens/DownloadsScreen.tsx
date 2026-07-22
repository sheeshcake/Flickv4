import { useCallback, useMemo, useState } from 'react';
import { FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertCircle,
  CheckCircle2,
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
import { getTitle } from '@/src/types';
import type { RootStackParamList } from '@/src/navigation/types';

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

export const DownloadsScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { jobs, pause, resume, remove } = useDownloads();
  const [pendingDelete, setPendingDelete] = useState<DownloadJob | null>(null);

  const sortedJobs = useMemo(
    () => [...jobs].sort((a, b) => b.updatedAt - a.updatedAt),
    [jobs],
  );

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

      {sortedJobs.length === 0 ? (
        <Center className="flex-1 px-8">
          <Text className="text-center text-muted-foreground">
            No downloads yet. Tap Download on a movie or an episode to save it
            here for offline playback.
          </Text>
        </Center>
      ) : (
        <FlatList
          data={sortedJobs}
          keyExtractor={(j) => j.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 12 }}
          renderItem={({ item }) => (
            <DownloadRow
              job={item}
              onPrimary={() => primaryAction(item)}
              onDelete={() => setPendingDelete(item)}
              onPlay={() => play(item)}
            />
          )}
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
              focusedClassName="scale-[1.1]"
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
            focusedClassName="scale-[1.1] border border-primary"
          >
            <Icon as={primaryIcon} className="text-foreground" />
          </Focusable>

          <Focusable
            onPress={onDelete}
            className="rounded-full bg-background/40 p-2"
            focusedClassName="scale-[1.1] border border-primary"
          >
            <Icon as={Trash2} className="text-foreground" />
          </Focusable>
        </VStack>
      </HStack>
    </Box>
  );
};
