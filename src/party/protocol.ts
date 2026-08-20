/**
 * Watch-party wire protocol. Keep in sync with `party-server/server.mjs`.
 * Rooms carry content identity, a host clock, and optional host-published
 * stream/subtitle URLs. The party server may fetch stream bytes for the
 * web player using the host’s Referer/Origin (browsers cannot set Referer).
 */

/** Stream URLs (signed m3u8s) are often far longer than a typical page link. */
export const PARTY_URI_MAX = 8192;

const STREAM_URI_RE = /\.(m3u8|mp4|webm|mkv)(\?|#|$)/i;

export const isPartyStreamUri = (uri: string): boolean =>
  /^https?:\/\//i.test(uri) && STREAM_URI_RE.test(uri);

export const partySourceKind = (uri: string): 'hls' | 'file' =>
  /\.m3u8(\?|#|$)/i.test(uri) ? 'hls' : 'file';

export const PARTY_CODE_LENGTH = 5;
export const PARTY_MAX_MEMBERS = 8;
export const PARTY_SCHEME = 'flick';

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
export type PartyReactionEmoji = (typeof PARTY_REACTIONS)[number];
export const isPartyReaction = (
  emoji: string,
): emoji is PartyReactionEmoji =>
  (PARTY_REACTIONS as readonly string[]).includes(emoji);

export type PartyClientKind = 'player' | 'companion';
export type PartyRole = 'host' | 'guest';

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

export interface PartyClock {
  positionSeconds: number;
  paused: boolean;
  updatedAt: number;
}

export interface PartyMember {
  id: string;
  displayName: string;
  kind: PartyClientKind;
  role: PartyRole;
  buffering: boolean;
}

export interface PartySource {
  uri: string;
  kind: 'hls' | 'file';
  /** Playback-server Referer the native player sends (web proxy only). */
  referer?: string;
  /** Playback-server Origin the native player sends (web proxy only). */
  origin?: string;
  /** Streamflix extractor row the host is playing (e.g. `vidrock-orion`). */
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
  /** Host left the player and is picking another title. */
  browsing?: boolean;
  /** Members who have opted into the in-party camera grid. */
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

export type ClientMessage =
  | {
      type: 'create';
      displayName: string;
      kind: PartyClientKind;
      content: PartyContent;
      clock?: PartyClock;
      password?: string;
    }
  | {
      type: 'join';
      displayName: string;
      kind: PartyClientKind;
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

export const predictedHostTime = (clock: PartyClock, now = Date.now()): number => {
  if (clock.paused) return clock.positionSeconds;
  const elapsed = Math.max(0, (now - clock.updatedAt) / 1000);
  return clock.positionSeconds + elapsed;
};

export const parsePartyCodeFromUrl = (url: string): string | null => {
  const quick = url.match(/(?:party|p)\/([A-Za-z0-9]{4,8})/i);
  if (quick?.[1]) return quick[1].toUpperCase();
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase() === 'party' && parsed.pathname.length > 1) {
      return parsed.pathname.replace(/^\//, '').split('/')[0]?.toUpperCase() ?? null;
    }
  } catch {
    // ignore
  }
  return null;
};

export const companionPathForCode = (code: string): string => `/p/${code.toUpperCase()}`;
