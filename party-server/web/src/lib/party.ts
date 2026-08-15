export interface PartyClock {
  positionSeconds: number;
  paused: boolean;
  updatedAt: number;
}

export interface PartyMember {
  id: string;
  displayName: string;
  kind: 'player' | 'companion';
  role: 'host' | 'guest';
  buffering: boolean;
}

export interface PartySource {
  uri: string;
  kind: 'hls' | 'file';
}

export interface PartySubtitles {
  url: string;
  language: string;
  display: string;
  offsetSeconds: number;
}

export interface PartyContent {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath?: string | null;
  season?: number;
  episode?: number;
  imdbId?: string | null;
}

export interface PartyRoom {
  code: string;
  hostId: string;
  content: PartyContent;
  clock: PartyClock;
  members: PartyMember[];
  source?: PartySource | null;
  embedUrl?: string | null;
  subtitles?: PartySubtitles | null;
  locked?: boolean;
}

export interface PublicRoomSummary {
  code: string;
  title: string;
  posterPath: string | null;
  mediaType: 'movie' | 'tv';
  season: number | null;
  episode: number | null;
  memberCount: number;
  locked: boolean;
  paused: boolean;
}

export const posterUrl = (posterPath: string | null | undefined): string | null => {
  if (!posterPath) return null;
  if (/^https?:\/\//i.test(posterPath)) return posterPath;
  return `https://image.tmdb.org/t/p/w185${posterPath}`;
};

export type ServerMessage =
  | { type: 'joined'; memberId: string; room: PartyRoom }
  | { type: 'state'; room: PartyRoom }
  | { type: 'clock'; clock: PartyClock }
  | { type: 'episode'; season: number; episode: number }
  | { type: 'source'; source: PartySource | null; embedUrl?: string | null }
  | { type: 'subtitles'; subtitles: PartySubtitles | null }
  | { type: 'chat'; from: string; text: string; at: number }
  | { type: 'error'; message: string }
  | { type: 'ended'; reason: string };

export const predictedHostTime = (clock: PartyClock, now = Date.now()): number => {
  if (clock.paused) return clock.positionSeconds;
  return clock.positionSeconds + Math.max(0, (now - clock.updatedAt) / 1000);
};

export const formatTime = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};

export const codeFromPath = (pathname: string): string => {
  const match = pathname.match(/\/p\/([A-Za-z0-9]+)/i);
  return match?.[1]?.toUpperCase() ?? '';
};

export const mediaProxyUrl = (code: string, uri: string): string =>
  `/media/${code}?u=${encodeURIComponent(uri)}`;
