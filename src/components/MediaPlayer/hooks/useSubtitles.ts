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
 * Custom hook for managing subtitle fetching and selection
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

  const fetchSubtitles = useCallback(async () => {
    if (!contentId || contentId <= 0) {
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

      let wyzieSubtitles: WyzieSubtitleData[] = [];

      try {
        wyzieSubtitles = await searchSubtitles(params);
      } catch (firstError) {
        if (contentType === 'tv' && params.season && params.episode) {
          wyzieSubtitles = await searchSubtitles({ tmdb_id: contentId });
        } else {
          throw firstError;
        }
      }

      if (wyzieSubtitles.length === 0) {
        setIsLoadingSubtitles(false);
        return;
      }

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

      setAvailableSubtitles(subtitles);

      if (defaultSubtitleLanguage && !hasAutoSelectedRef.current) {
        const preferred = subtitles.find(
          sub => sub.language === defaultSubtitleLanguage
        );
        if (preferred) {
          setSelectedSubtitle(preferred);
          hasAutoSelectedRef.current = true;
        }
      }
    } catch (error) {
    } finally {
      setIsLoadingSubtitles(false);
    }
  }, [contentId, contentType, season, episode, defaultSubtitleLanguage]);

  useEffect(() => {
    hasAutoSelectedRef.current = false;

    if (savedSubtitle) {
      setSelectedSubtitle(savedSubtitle);
      return;
    }

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
