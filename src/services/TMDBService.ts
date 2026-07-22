import { TMDB_CONFIG } from '@/src/config/env';
import {
  ContentRatingsResponse,
  CreditsResponse,
  Genre,
  MediaImagesResponse,
  MediaItem,
  Movie,
  MovieDetails,
  ReleaseDatesResponse,
  SeasonDetails,
  TmdbImage,
  TMDBResponse,
  TVShow,
  TVShowDetails,
  VideoResponse,
} from '@/src/types';

type QueryParams = Record<string, string | number | boolean | undefined>;

/** Abort a request if the network stalls, so the UI never hangs forever. */
const REQUEST_TIMEOUT_MS = 15000;

export class TMDBError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'TMDBError';
    this.status = status;
  }
}

/**
 * Thin TMDB client built on the native fetch API (no axios).
 */
class TMDBServiceImpl {
  private readonly baseUrl = TMDB_CONFIG.BASE_URL;
  private readonly apiKey = TMDB_CONFIG.API_KEY;

  private async request<T>(path: string, params: QueryParams = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set('api_key', this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new TMDBError(
          'Request timed out. TMDB may be blocked on your network — try another connection or a VPN.',
        );
      }
      throw new TMDBError('Network request failed. Check your connection.');
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new TMDBError(
        `TMDB request failed (${response.status})`,
        response.status,
      );
    }

    return (await response.json()) as T;
  }

  getImageUrl(
    path: string | null | undefined,
    size: 'w200' | 'w300' | 'w500' | 'w780' | 'original' = 'w500',
  ): string {
    if (!path) return '';
    return `https://image.tmdb.org/t/p/${size}${path}`;
  }

  // ── Trending / discover ──────────────────────────────────────────────
  getTrendingMovies(page = 1) {
    return this.request<TMDBResponse<Movie>>('/trending/movie/week', { page });
  }

  getTrendingTVShows(page = 1) {
    return this.request<TMDBResponse<TVShow>>('/trending/tv/week', { page });
  }

  getPopularMovies(page = 1) {
    return this.request<TMDBResponse<Movie>>('/movie/popular', { page });
  }

  getPopularTVShows(page = 1) {
    return this.request<TMDBResponse<TVShow>>('/tv/popular', { page });
  }

  getTopRatedMovies(page = 1) {
    return this.request<TMDBResponse<Movie>>('/movie/top_rated', { page });
  }

  discoverMoviesByGenre(genreId: number, page = 1) {
    return this.request<TMDBResponse<Movie>>('/discover/movie', {
      with_genres: genreId,
      sort_by: 'popularity.desc',
      page,
    });
  }

  discoverTVByGenre(genreId: number, page = 1) {
    return this.request<TMDBResponse<TVShow>>('/discover/tv', {
      with_genres: genreId,
      sort_by: 'popularity.desc',
      page,
    });
  }

  // ── Search ───────────────────────────────────────────────────────────
  async searchMulti(query: string, page = 1): Promise<TMDBResponse<MediaItem>> {
    const data = await this.request<TMDBResponse<MediaItem>>('/search/multi', {
      query,
      page,
      include_adult: false,
    });
    // Keep only movies and tv shows (drop person results).
    return {
      ...data,
      results: data.results.filter(
        (item) => item.media_type === 'movie' || item.media_type === 'tv',
      ),
    };
  }

  // ── Details ──────────────────────────────────────────────────────────
  getMovieDetails(id: number) {
    return this.request<MovieDetails>(`/movie/${id}`);
  }

  getTVShowDetails(id: number) {
    return this.request<TVShowDetails>(`/tv/${id}`);
  }

  getMovieVideos(id: number) {
    return this.request<VideoResponse>(`/movie/${id}/videos`);
  }

  getTVShowVideos(id: number) {
    return this.request<VideoResponse>(`/tv/${id}/videos`);
  }

  getMovieCredits(id: number) {
    return this.request<CreditsResponse>(`/movie/${id}/credits`);
  }

  getTVShowCredits(id: number) {
    return this.request<CreditsResponse>(`/tv/${id}/credits`);
  }

  getSimilarMovies(id: number, page = 1) {
    return this.request<TMDBResponse<Movie>>(`/movie/${id}/similar`, { page });
  }

  getSimilarTVShows(id: number, page = 1) {
    return this.request<TMDBResponse<TVShow>>(`/tv/${id}/similar`, { page });
  }

  getSeasonDetails(tvId: number, seasonNumber: number) {
    return this.request<SeasonDetails>(`/tv/${tvId}/season/${seasonNumber}`);
  }

  getMovieGenres() {
    return this.request<{ genres: Genre[] }>('/genre/movie/list');
  }

  getMovieReleaseDates(id: number) {
    return this.request<ReleaseDatesResponse>(`/movie/${id}/release_dates`);
  }

  getTVContentRatings(id: number) {
    return this.request<ContentRatingsResponse>(`/tv/${id}/content_ratings`);
  }

  getMovieImages(id: number) {
    return this.request<MediaImagesResponse>(`/movie/${id}/images`, {
      include_image_language: 'en,null',
    });
  }

  getTVImages(id: number) {
    return this.request<MediaImagesResponse>(`/tv/${id}/images`, {
      include_image_language: 'en,null',
    });
  }

  /** Prefer English logo, then null-language, then highest-voted. */
  pickLogoPath(logos: TmdbImage[] | undefined): string | null {
    if (!logos?.length) return null;
    const scored = [...logos].sort((a, b) => {
      const langScore = (img: TmdbImage) =>
        img.iso_639_1 === 'en' ? 2 : img.iso_639_1 == null ? 1 : 0;
      const langDiff = langScore(b) - langScore(a);
      if (langDiff !== 0) return langDiff;
      return (b.vote_average ?? 0) - (a.vote_average ?? 0);
    });
    return scored[0]?.file_path ?? null;
  }

  /** Best-effort US (or first available) certification string. */
  async getCertification(
    id: number,
    mediaType: 'movie' | 'tv',
  ): Promise<string | null> {
    try {
      if (mediaType === 'movie') {
        const data = await this.getMovieReleaseDates(id);
        const us = data.results.find((r) => r.iso_3166_1 === 'US');
        const pool = us ?? data.results[0];
        const cert = pool?.release_dates.find((d) => d.certification)?.certification;
        return cert || null;
      }
      const data = await this.getTVContentRatings(id);
      const us = data.results.find((r) => r.iso_3166_1 === 'US');
      return us?.rating || data.results[0]?.rating || null;
    } catch {
      return null;
    }
  }
}

export const TMDBService = new TMDBServiceImpl();

/** First official YouTube trailer/teaser key from a videos response. */
export const pickTrailerKey = (videos: VideoResponse | undefined): string | null => {
  if (!videos?.results?.length) return null;
  const youtube = videos.results.filter((v) => v.site === 'YouTube');
  const trailer =
    youtube.find((v) => v.type === 'Trailer' && v.official) ??
    youtube.find((v) => v.type === 'Trailer') ??
    youtube.find((v) => v.type === 'Teaser') ??
    youtube[0];
  return trailer?.key ?? null;
};
