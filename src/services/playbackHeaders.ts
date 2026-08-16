import { originOf } from '@/src/utils/streamUrl';
import {
  STREAMFLIX_PLAYBACK_HEADERS,
  isStreamflixServer,
} from '@/src/services/StreamflixService';

export type ServerResolver = 'webview' | 'streamflix';

export const playbackHeadersFor = (server: {
  resolver?: string;
  id?: string;
  url: string;
}): Record<string, string> => {
  if (isStreamflixServer(server)) return { ...STREAMFLIX_PLAYBACK_HEADERS };
  return {
    Referer: `${server.url}/`,
    Origin: originOf(server.url),
  };
};
