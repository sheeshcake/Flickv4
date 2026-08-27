import { originOf } from '@/src/utils/streamUrl';
import {
  STREAMFLIX_PLAYBACK_HEADERS,
  isStreamflixServer,
} from '@/src/services/StreamflixService';
import { isFlixQuestServer } from '@/src/services/FlixQuestService';

export type ServerResolver = 'webview' | 'streamflix' | 'flixquest';

export const isRestResolverServer = (server: {
  resolver?: string;
  id?: string;
}): boolean => isStreamflixServer(server) || isFlixQuestServer(server);

export const playbackHeadersFor = (server: {
  resolver?: string;
  id?: string;
  url: string;
}): Record<string, string> => {
  if (isStreamflixServer(server)) return { ...STREAMFLIX_PLAYBACK_HEADERS };
  if (isFlixQuestServer(server)) return {};
  return {
    Referer: `${server.url}/`,
    Origin: originOf(server.url),
  };
};
