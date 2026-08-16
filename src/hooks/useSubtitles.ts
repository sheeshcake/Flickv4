import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { File } from 'expo-file-system';
import { WyzieService, type WyzieSubtitle } from '@/src/services/WyzieService';
import type { LocalDownloadedSubtitle } from '@/src/services/DownloadService';
import {
  findCueAt,
  parseSubtitleText,
  type SubtitleCue,
} from '@/src/utils/subtitles';

export type SubtitleTrack = WyzieSubtitle | LocalDownloadedSubtitle;

interface UseSubtitlesArgs {
  tmdbId: number;
  season?: number;
  episode?: number;
  enabled?: boolean;
  /**
   * Whether to download + parse the selected track's `.srt`/`.vtt` text into
   * `cues` for `SubtitleOverlay` to render. Defaults to `true`. Callers that
   * hand the track's `url` straight to a native sidecar text track instead
   * (react-native-video's `source.textTracks`) can set this to `false` to
   * skip the extra network fetch — the track *search* above still needs to
   * run either way, since it's also how the sidecar list gets built.
   */
  loadCues?: boolean;
  /** ISO 639-1 code; auto-selects a matching track when tracks load. */
  defaultLanguage?: string;
  /**
   * When set (offline playback of a completed download), skip Wyzie entirely
   * and use these local tracks instead. Cue text is read from `localUri`.
   */
  localTracks?: LocalDownloadedSubtitle[];
  /**
   * Wyzie `format` query (default `srt`). Pass `vtt` for native sidecar mode
   * — iOS only supports WebVTT sidecars, and VTT is the most reliable MIME
   * on Android with react-native-video.
   */
  format?: 'srt' | 'vtt';
  /** Extractor sidecar tracks (Streamflix Videasy/Vidzee), shown above Wyzie. */
  extraTracks?: WyzieSubtitle[];
}

const MAX_TRACKS = 20;

const isLocalTrack = (
  track: SubtitleTrack,
): track is LocalDownloadedSubtitle => 'localUri' in track;

export const useSubtitles = ({
  tmdbId,
  season,
  episode,
  enabled = true,
  loadCues = true,
  defaultLanguage,
  localTracks,
  format = 'srt',
  extraTracks = [],
}: UseSubtitlesArgs) => {
  const [remoteTracks, setRemoteTracks] = useState<WyzieSubtitle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCues, setLoadingCues] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Once the user has interacted (including choosing "Off"), stop auto-selecting.
  const didAutoSelectRef = useRef(false);

  const useLocal = (localTracks?.length ?? 0) > 0;
  const tracks: SubtitleTrack[] = useLocal
    ? (localTracks as LocalDownloadedSubtitle[])
    : [...extraTracks, ...remoteTracks];

  useEffect(() => {
    if (!enabled || !tmdbId || useLocal) {
      if (useLocal) {
        setRemoteTracks([]);
        setLoading(false);
        setError(null);
      }
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Fetch across ALL languages (no `language` filter). Dedup and sort so the
    // default language sits at the top of the picker.
    WyzieService.searchSubtitles({ tmdbId, season, episode, format })
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
        setRemoteTracks(sorted);
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
  }, [tmdbId, season, episode, enabled, defaultLanguage, useLocal, format]);

  // Auto-select the first track that matches the default language (once).
  // For offline local tracks, auto-select the first (only) bundled track.
  useEffect(() => {
    if (didAutoSelectRef.current) return;
    if (!tracks.length) return;
    if (selectedId != null) return;
    if (useLocal) {
      didAutoSelectRef.current = true;
      setSelectedId(tracks[0].id);
      return;
    }
    if (!defaultLanguage) return;
    const match = tracks.find((t) => t.language === defaultLanguage);
    if (match) {
      didAutoSelectRef.current = true;
      setSelectedId(match.id);
    }
  }, [tracks, defaultLanguage, selectedId, useLocal]);

  // String key so parent re-renders that rebuild the `tracks` array don't
  // cancel an in-flight cue download when the selected URI is unchanged.
  const selectedSourceKey = useMemo(() => {
    if (!selectedId) return null;
    const track = tracks.find((t) => t.id === selectedId);
    if (!track) return null;
    return isLocalTrack(track)
      ? `local:${track.localUri}`
      : `remote:${track.url}`;
  }, [tracks, selectedId]);

  useEffect(() => {
    if (!loadCues || !selectedSourceKey) {
      setCues([]);
      return;
    }
    const isLocal = selectedSourceKey.startsWith('local:');
    const uri = selectedSourceKey.slice(selectedSourceKey.indexOf(':') + 1);

    let cancelled = false;
    setLoadingCues(true);

    const load = async () => {
      try {
        const text = isLocal
          ? await new File(uri).text()
          : await WyzieService.fetchSubtitleText(uri);
        if (!cancelled) setCues(parseSubtitleText(text));
      } catch {
        if (!cancelled) setCues([]);
      } finally {
        if (!cancelled) setLoadingCues(false);
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [loadCues, selectedSourceKey]);

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
