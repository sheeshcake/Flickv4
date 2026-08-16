import {
  PARTY_REACTIONS,
  isPartyReaction,
  type PartyReactionEmoji,
} from '@/src/party/protocol';

export { PARTY_REACTIONS, isPartyReaction, type PartyReactionEmoji };

export interface FloatingReaction {
  id: string;
  from: string;
  emoji: string;
  leftPct: number;
}

const MAX_FLOATING = 24;

export const nextReactionLeftPct = (): number => 8 + Math.random() * 76;

export const appendFloatingReaction = (
  prev: FloatingReaction[],
  next: Omit<FloatingReaction, 'id' | 'leftPct'> & { id?: string },
): FloatingReaction[] => {
  const item: FloatingReaction = {
    id: next.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    from: next.from,
    emoji: next.emoji,
    leftPct: nextReactionLeftPct(),
  };
  const merged = [...prev, item];
  return merged.length > MAX_FLOATING
    ? merged.slice(merged.length - MAX_FLOATING)
    : merged;
};
