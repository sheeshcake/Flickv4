import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WyzieService, type WyzieSubtitle } from '@/src/services/WyzieService';
import {
  findCueAt,
  parseSubtitleText,
  type SubtitleCue,
} from '@/src/utils/subtitles';

interface UseSubtitlesArgs {
  tmdbId: number;
  season?: number;
  episode?: number;
  enabled?: boolean;
  /** ISO 639-1 code; auto-selects a matching track when tracks load. */
  defaultLanguage?: string;
}

const MAX_TRACKS = 20;

export const useSubtitles = ({
  tmdbId,
  season,
  episode,
  enabled = true,
  defaultLanguage,
}: UseSubtitlesArgs) => {
  const [tracks, setTracks] = useState<WyzieSubtitle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCues, setLoadingCues] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Once the user has interacted (including choosing "Off"), stop auto-selecting.
  const didAutoSelectRef = useRef(false);

  useEffect(() => {
    if (!enabled || !tmdbId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Fetch across ALL languages (no `language` filter). Dedup and sort so the
    // default language sits at the top of the picker.
    WyzieService.searchSubtitles({ tmdbId, season, episode })
      .then((results) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const unique: WyzieSubtitle[] = [];
        for (const r of results) {
          // Key by language + display so different regional/CC variants of the
          // same language still appear (e.g. English vs. English (CC)).
          const key = `${r.language}-${r.display}-${r.isHearingImpaired ? 'cc' : 'n'}`;
          if (seen.has(key)) continue;
          seen.add(key);
          unique.push(r);
          if (unique.length >= MAX_TRACKS) break;
        }
        // Sort: default language first, then alphabetical by display label.
        const sorted = unique.sort((a, b) => {
          if (defaultLanguage) {
            const aDefault = a.language === defaultLanguage ? 0 : 1;
            const bDefault = b.language === defaultLanguage ? 0 : 1;
            if (aDefault !== bDefault) return aDefault - bDefault;
          }
          return a.display.localeCompare(b.display);
        });
        setTracks(sorted);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Subtitle search failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tmdbId, season, episode, enabled, defaultLanguage]);

  // Auto-select the first track that matches the default language (once).
  useEffect(() => {
    if (didAutoSelectRef.current) return;
    if (!defaultLanguage) return;
    if (!tracks.length) return;
    if (selectedId != null) return;
    const match = tracks.find((t) => t.language === defaultLanguage);
    if (match) {
      didAutoSelectRef.current = true;
      setSelectedId(match.id);
    }
  }, [tracks, defaultLanguage, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setCues([]);
      return;
    }
    const track = tracks.find((t) => t.id === selectedId);
    if (!track) return;

    let cancelled = false;
    setLoadingCues(true);
    WyzieService.fetchSubtitleText(track.url)
      .then((text) => {
        if (cancelled) return;
        setCues(parseSubtitleText(text));
      })
      .catch(() => {
        if (!cancelled) setCues([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingCues(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId, tracks]);

  const selectTrack = useCallback((id: string | null) => {
    // Any manual selection (including explicit "Off") disables auto-select.
    didAutoSelectRef.current = true;
    setSelectedId(id);
  }, []);

  const cueAt = useCallback(
    (time: number) => findCueAt(cues, time),
    [cues],
  );

  const selectedTrack = useMemo(
    () => tracks.find((t) => t.id === selectedId) ?? null,
    [tracks, selectedId],
  );

  return {
    tracks,
    selectedId,
    selectedTrack,
    selectTrack,
    cueAt,
    loading,
    loadingCues,
    error,
  };
};
