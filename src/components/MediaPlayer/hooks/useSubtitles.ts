import { useCallback, useEffect, useState, useRef } from 'react';
import { searchSubtitles } from 'wyzie-lib';
import { SubtitleTrack, WyzieSubtitleData } from '../../../types';

interface UseSubtitlesProps {
  contentId: number;
  contentType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  autoSelectSubtitles?: boolean;
  defaultSubtitleLanguage?: string;
  savedSubtitle?: SubtitleTrack | null;
}

/**
 * Custom hook for managing subtitle fetching, conversion, and selection
 */
export const useSubtitles = ({
  contentId,
  contentType,
  season,
  episode,
  autoSelectSubtitles = false,
  defaultSubtitleLanguage,
  savedSubtitle,
}: UseSubtitlesProps) => {
  const [selectedSubtitle, setSelectedSubtitle] = useState<SubtitleTrack | null>(null);
  const [availableSubtitles, setAvailableSubtitles] = useState<SubtitleTrack[]>([]);
  const [isLoadingSubtitles, setIsLoadingSubtitles] = useState(false);
  const hasAutoSelectedRef = useRef(false);

  // Convert subtitle to VTT format using Wyzie API
  const convertSubtitleToVtt = useCallback(async (subtitle: SubtitleTrack): Promise<SubtitleTrack> => {
    // Already converted or native VTT
    if (subtitle.isConverted && subtitle.vttContent) return subtitle;
    if (subtitle.format === 'vtt') return { ...subtitle, isConverted: true };

    try {
      const response = await fetch(subtitle.url);
      if (!response.ok) throw new Error(`Failed to download: HTTP ${response.status}`);

      const subtitleContent = await response.text();
      const blob = new Blob([subtitleContent]);
      const formData = new FormData();
      formData.append('file', blob);

      const apiResponse = await fetch('https://sub.wyzie.ru/', {
        method: 'POST',
        body: formData,
        headers: { 'Accept': 'text/vtt, text/plain, */*' },
      });

      if (!apiResponse.ok) throw new Error(`API error: HTTP ${apiResponse.status}`);

      const vttContent = await apiResponse.text();
      if (!vttContent || !vttContent.includes('WEBVTT')) {
        throw new Error('Invalid VTT content');
      }

      const vttDataUrl = `data:text/vtt;charset=utf-8,${encodeURIComponent(vttContent)}`;

      return {
        ...subtitle,
        url: vttDataUrl,
        format: 'vtt',
        isConverted: true,
        vttContent,
        title: `${subtitle.title.replace(' (Wyzie)', '')} (VTT)`,
      };
    } catch (error) {
      console.error('[useSubtitles] Conversion error:', error);
      return subtitle;
    }
  }, []);

  // Fetch subtitles from Wyzie
  const fetchSubtitles = useCallback(async () => {
    if (!contentId || contentId <= 0) {
      console.warn('[useSubtitles] Invalid contentId:', contentId);
      return;
    }

    setIsLoadingSubtitles(true);

    try {
      const params: any = { tmdb_id: contentId };

      // Add TV show params if valid
      if (contentType === 'tv' && season && episode && season > 0 && episode > 0) {
        params.season = season;
        params.episode = episode;
      }

      console.log('[useSubtitles] Fetching with params:', params);

      let wyzieSubtitles: WyzieSubtitleData[] = [];

      try {
        wyzieSubtitles = await searchSubtitles(params);
      } catch (firstError) {
        // Fallback: try without season/episode for TV shows
        if (contentType === 'tv' && params.season && params.episode) {
          console.log('[useSubtitles] Retrying without season/episode...');
          wyzieSubtitles = await searchSubtitles({ tmdb_id: contentId });
        } else {
          throw firstError;
        }
      }

      if (wyzieSubtitles.length === 0) {
        console.log('[useSubtitles] No subtitles found');
        setIsLoadingSubtitles(false);
        return;
      }

      // Convert to internal format
      const subtitles: SubtitleTrack[] = wyzieSubtitles.map((sub, index) => ({
        id: `wyzie_${sub.id}_${index}`,
        title: `${sub.display} (Wyzie)`,
        language: sub.language,
        url: sub.url,
        format: sub.format || 'srt',
        encoding: sub.encoding,
        isHearingImpaired: sub.isHearingImpaired,
        flagUrl: sub.flagUrl,
        source: 'wyzie' as const,
        originalUrl: sub.url,
        isConverted: false,
      }));

      // Convert all to VTT
      const vttSubtitles: SubtitleTrack[] = [];
      for (const subtitle of subtitles) {
        const vttSubtitle = await convertSubtitleToVtt(subtitle);
        vttSubtitles.push(vttSubtitle);
      }

      console.log('[useSubtitles] Converted subtitles:', vttSubtitles.length);
      setAvailableSubtitles(vttSubtitles);

      // Auto-select preferred language
      if (defaultSubtitleLanguage && !hasAutoSelectedRef.current) {
        const preferred = vttSubtitles.find(
          sub => sub.language === defaultSubtitleLanguage
        );
        if (preferred) {
          console.log('[useSubtitles] Auto-selected:', preferred.title);
          setSelectedSubtitle(preferred);
          hasAutoSelectedRef.current = true;
        }
      }
    } catch (error) {
      console.error('[useSubtitles] Fetch failed:', error);
    } finally {
      setIsLoadingSubtitles(false);
    }
  }, [contentId, contentType, season, episode, defaultSubtitleLanguage, convertSubtitleToVtt]);

  // Load saved subtitle or auto-fetch
  useEffect(() => {
    // Reset auto-select flag when content changes
    hasAutoSelectedRef.current = false;

    // Load saved subtitle
    if (savedSubtitle) {
      console.log('[useSubtitles] Loading saved subtitle:', savedSubtitle.title);
      setSelectedSubtitle(savedSubtitle);
      return;
    }

    // Auto-fetch if enabled
    if (autoSelectSubtitles && contentId) {
      fetchSubtitles();
    }
  }, [contentId, contentType, season, episode, savedSubtitle, autoSelectSubtitles, fetchSubtitles]);

  return {
    selectedSubtitle,
    setSelectedSubtitle,
    availableSubtitles,
    isLoadingSubtitles,
    fetchSubtitles,
  };
};
