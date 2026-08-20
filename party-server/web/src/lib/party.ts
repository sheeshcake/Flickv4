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
  referer?: string;
  origin?: string;
  sourceId?: string;
}

export type PartyRtcSignalKind = 'offer' | 'answer' | 'ice';

export interface PartyRtcSignalPayload {
  type: PartyRtcSignalKind;
  sdp?: string;
  candidate?: string | null;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
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
  year?: string;
}

export interface PartyChatLine {
  from: string;
  text: string;
  at?: number;
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
  browsing?: boolean;
  rtcMemberIds?: string[];
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

export const PARTY_REACTIONS = [
  '👍',
  '👎',
  '❤️',
  '😂',
  '😮',
  '👏',
  '🎉',
  '🔥',
  '😢',
] as const;

export const isPartyReaction = (emoji: string): boolean =>
  (PARTY_REACTIONS as readonly string[]).includes(emoji);

export const posterUrl = (posterPath: string | null | undefined): string | null => {
  if (!posterPath) return null;
  if (/^https?:\/\//i.test(posterPath)) return posterPath;
  return `https://image.tmdb.org/t/p/w185${posterPath}`;
};

export type ServerMessage =
  | { type: 'created'; memberId: string; room: PartyRoom; hostKey: string }
  | { type: 'joined'; memberId: string; room: PartyRoom }
  | { type: 'state'; room: PartyRoom }
  | { type: 'clock'; clock: PartyClock }
  | { type: 'episode'; season: number; episode: number }
  | { type: 'browse' }
  | { type: 'content'; content: PartyContent }
  | { type: 'source'; source: PartySource | null; embedUrl?: string | null }
  | { type: 'subtitles'; subtitles: PartySubtitles | null }
  | { type: 'control'; action: 'play' | 'pause' | 'seek'; positionSeconds?: number }
  | { type: 'chat'; from: string; text: string; at: number }
  | { type: 'reaction'; from: string; emoji: string; at: number }
  | { type: 'rtc-peers'; ids: string[] }
  | { type: 'rtc-signal'; from: string; payload: PartyRtcSignalPayload }
  | { type: 'error'; message: string }
  | { type: 'ended'; reason: string };

export type ClientKind = 'player' | 'companion';

export type ClientMessage =
  | {
      type: 'create';
      displayName: string;
      kind: ClientKind;
      content: PartyContent;
      clock?: PartyClock;
      password?: string;
    }
  | {
      type: 'join';
      displayName: string;
      kind: ClientKind;
      code: string;
      hostKey?: string;
      password?: string;
    }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; positionSeconds: number }
  | { type: 'episode'; season: number; episode: number }
  | { type: 'browse' }
  | { type: 'content'; content: PartyContent }
  | { type: 'heartbeat'; positionSeconds: number; paused: boolean }
  | { type: 'buffering'; buffering: boolean }
  | {
      type: 'source';
      uri: string;
      kind: 'hls' | 'file';
      embedUrl?: string;
      referer?: string;
      origin?: string;
      sourceId?: string;
    }
  | { type: 'subtitles'; subtitles: PartySubtitles | null }
  | { type: 'control'; action: 'play' | 'pause' | 'seek'; positionSeconds?: number }
  | { type: 'chat'; text: string }
  | { type: 'reaction'; emoji: string }
  | { type: 'rtc-join' }
  | { type: 'rtc-leave' }
  | { type: 'rtc-signal'; to: string; payload: PartyRtcSignalPayload }
  | { type: 'leave' };

export const watchPath = (content: PartyContent): string => {
  if (content.mediaType === 'tv') {
    if (content.season == null || content.episode == null) {
      return `/title/tv/${content.tmdbId}`;
    }
    return `/watch/tv/${content.tmdbId}/${content.season}/${content.episode}`;
  }
  return `/watch/movie/${content.tmdbId}`;
};

export const streamflixQueryUrl = (
  content: PartyContent,
  sourceId?: string,
): string => {
  const params = new URLSearchParams();
  params.set('tmdbId', String(content.tmdbId));
  params.set('mediaType', content.mediaType);
  if (content.imdbId) params.set('imdbId', content.imdbId);
  if (content.year) params.set('year', content.year);
  if (content.season != null) params.set('season', String(content.season));
  if (content.episode != null) params.set('episode', String(content.episode));
  if (sourceId) params.set('source', sourceId);
  return `/streamflix?${params}`;
};

export const partyContentFromTitle = (
  item: {
    id: number;
    media_type?: string;
    title?: string;
    name?: string;
    poster_path?: string | null;
    release_date?: string;
    first_air_date?: string;
  },
  season?: number,
  episode?: number,
  imdbId?: string | null,
): PartyContent => {
  const date = item.media_type === 'tv' ? item.first_air_date : item.release_date;
  const year = date?.slice(0, 4);
  return {
    tmdbId: item.id,
    mediaType: item.media_type === 'tv' ? 'tv' : 'movie',
    title: item.title || item.name || 'Untitled',
    posterPath: item.poster_path ?? null,
    season,
    episode,
    imdbId: imdbId ?? null,
    ...(year && /^\d{4}$/.test(year) ? { year } : {}),
  };
};

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

/** Host scraped on mobile via embed WebView (not Streamflix API). */
export const isWebViewHostSource = (room: PartyRoom): boolean =>
  Boolean(room.source?.uri && room.embedUrl && !room.source.sourceId);

export const subtitleProxyUrl = (code: string, uri?: string): string =>
  uri ? `/subtitle/${code}?u=${encodeURIComponent(uri)}` : `/subtitle/${code}`;
