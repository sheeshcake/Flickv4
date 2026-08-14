/**
 * Watch-party wire protocol. Keep in sync with `party-server/server.mjs`.
 * Rooms carry content identity + a host clock only — never a stream URL.
 */

export const PARTY_CODE_LENGTH = 5;
export const PARTY_MAX_MEMBERS = 8;
export const PARTY_SCHEME = 'flick';

export type PartyClientKind = 'player' | 'companion';
export type PartyRole = 'host' | 'guest';

export interface PartyContent {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath?: string | null;
  season?: number;
  episode?: number;
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

export interface PartyRoom {
  code: string;
  hostId: string;
  content: PartyContent;
  clock: PartyClock;
  members: PartyMember[];
}

export type ClientMessage =
  | { type: 'create'; displayName: string; kind: PartyClientKind; content: PartyContent; clock?: PartyClock }
  | { type: 'join'; displayName: string; kind: PartyClientKind; code: string }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; positionSeconds: number }
  | { type: 'episode'; season: number; episode: number }
  | { type: 'heartbeat'; positionSeconds: number; paused: boolean }
  | { type: 'buffering'; buffering: boolean }
  | { type: 'control'; action: 'play' | 'pause' | 'seek'; positionSeconds?: number }
  | { type: 'chat'; text: string }
  | { type: 'leave' };

export type ServerMessage =
  | { type: 'created'; memberId: string; room: PartyRoom }
  | { type: 'joined'; memberId: string; room: PartyRoom }
  | { type: 'state'; room: PartyRoom }
  | { type: 'clock'; clock: PartyClock }
  | { type: 'episode'; season: number; episode: number }
  | { type: 'control'; action: 'play' | 'pause' | 'seek'; positionSeconds?: number }
  | { type: 'chat'; from: string; text: string; at: number }
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
