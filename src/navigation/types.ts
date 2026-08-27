import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CategoryQuery } from '@/src/services/categories';
import type {
  LiveChannel,
  LiveStream,
} from '@/src/services/DaddyLiveService';
import type { MediaItem } from '@/src/types';

export type RootStackParamList = {
  Splash: undefined;
  Main: undefined;
  Detail: { item: MediaItem };
  ViewMore: { title: string; query: CategoryQuery };
  SubtitleSettings: undefined;
  ServerSettings: undefined;
  VideoQualitySettings: undefined;
  VideoAspectSettings: undefined;
  RegionSettings: undefined;
  PlaybackPerformance: undefined;
  Disclaimer: undefined;
  Credits: undefined;
  FinishedMovies: undefined;
  JoinParty: { code?: string };
  LivePlayer: {
    channel: LiveChannel;
    channels: LiveChannel[];
    stream?: LiveStream;
  };
  Player: {
    item: MediaItem;
    title: string;
    /** Optional fallback source used if server scraping fails. */
    videoUrl?: string;
    subtitle?: string;
    season?: number;
    episode?: number;
    resumeFrom?: number;
    /** When set, PlayerScreen plays a downloaded local source and skips the
     * WebViewScraper entirely (see DownloadService.getLocalSource). */
    localSourceId?: string;
  };
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
