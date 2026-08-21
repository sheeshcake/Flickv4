import type { CategoryQuery } from '@/src/services/categories';
import { GENRE_IDS, getGenreName } from '@/src/utils/genres';

/** TMDB watch-provider ids used by `/discover` `with_watch_providers`. */
export const WATCH_PROVIDERS = {
  netflix: 8,
  disneyPlus: 337,
  primeVideo: 9,
  appleTv: 350,
  max: 1899,
} as const;

export type HomeRowVariant = 'standard' | 'topTen';

export interface HomeRowSpec {
  id: string;
  title: string;
  variant: HomeRowVariant;
  query: CategoryQuery;
  /** Wave 1 is splash-blocking (regional popular → hero + country Top 10s). */
  wave: 1 | 2;
}

/** Home catalog for a catalog region. Worldwide Top 10s stay unscoped. */
export const buildHomeFeed = (
  region: string,
  regionName: string,
): HomeRowSpec[] => [
  {
    id: 'top-10-movies-regional',
    title: `Top 10 Movies in ${regionName}`,
    variant: 'topTen',
    query: { kind: 'popularMovies', region },
    wave: 1,
  },
  {
    id: 'netflix',
    title: 'Popular on Netflix',
    variant: 'standard',
    query: {
      kind: 'providerMixed',
      providerId: WATCH_PROVIDERS.netflix,
      region,
    },
    wave: 2,
  },
  {
    id: 'top-10-movies-worldwide',
    title: 'Top 10 Movies Worldwide',
    variant: 'topTen',
    query: { kind: 'trendingMovies' },
    wave: 2,
  },
  {
    id: 'action',
    title: getGenreName(GENRE_IDS.action),
    variant: 'standard',
    query: { kind: 'genreMovie', genreId: GENRE_IDS.action, region },
    wave: 2,
  },
  {
    id: 'top-10-tv-regional',
    title: `Top 10 TV in ${regionName}`,
    variant: 'topTen',
    query: { kind: 'popularTv', region },
    wave: 1,
  },
  {
    id: 'disney-plus',
    title: 'Popular on Disney+',
    variant: 'standard',
    query: {
      kind: 'providerMixed',
      providerId: WATCH_PROVIDERS.disneyPlus,
      region,
    },
    wave: 2,
  },
  {
    id: 'top-10-tv-worldwide',
    title: 'Top 10 TV Worldwide',
    variant: 'topTen',
    query: { kind: 'trendingTv' },
    wave: 2,
  },
  {
    id: 'horror',
    title: getGenreName(GENRE_IDS.horror),
    variant: 'standard',
    query: { kind: 'genreMovie', genreId: GENRE_IDS.horror, region },
    wave: 2,
  },
  {
    id: 'animation',
    title: getGenreName(GENRE_IDS.animation),
    variant: 'standard',
    query: { kind: 'genreMovie', genreId: GENRE_IDS.animation, region },
    wave: 2,
  },
  {
    id: 'prime-video',
    title: 'Popular on Prime Video',
    variant: 'standard',
    query: {
      kind: 'providerMixed',
      providerId: WATCH_PROVIDERS.primeVideo,
      region,
    },
    wave: 2,
  },
  {
    id: 'comedy',
    title: getGenreName(GENRE_IDS.comedy),
    variant: 'standard',
    query: { kind: 'genreMovie', genreId: GENRE_IDS.comedy, region },
    wave: 2,
  },
  {
    id: 'drama-tv',
    title: `${getGenreName(GENRE_IDS.drama)} TV`,
    variant: 'standard',
    query: { kind: 'genreTv', genreId: GENRE_IDS.drama, region },
    wave: 2,
  },
  {
    id: 'apple-tv',
    title: 'Popular on Apple TV+',
    variant: 'standard',
    query: {
      kind: 'providerMixed',
      providerId: WATCH_PROVIDERS.appleTv,
      region,
    },
    wave: 2,
  },
  {
    id: 'sci-fi',
    title: getGenreName(GENRE_IDS.sciFi),
    variant: 'standard',
    query: { kind: 'genreMovie', genreId: GENRE_IDS.sciFi, region },
    wave: 2,
  },
  {
    id: 'crime-tv',
    title: `${getGenreName(GENRE_IDS.crime)} TV`,
    variant: 'standard',
    query: { kind: 'genreTv', genreId: GENRE_IDS.crime, region },
    wave: 2,
  },
  {
    id: 'max',
    title: 'Popular on Max',
    variant: 'standard',
    query: {
      kind: 'providerMixed',
      providerId: WATCH_PROVIDERS.max,
      region,
    },
    wave: 2,
  },
  {
    id: 'romance',
    title: getGenreName(GENRE_IDS.romance),
    variant: 'standard',
    query: { kind: 'genreMovie', genreId: GENRE_IDS.romance, region },
    wave: 2,
  },
  {
    id: 'thriller',
    title: getGenreName(GENRE_IDS.thriller),
    variant: 'standard',
    query: { kind: 'genreMovie', genreId: GENRE_IDS.thriller, region },
    wave: 2,
  },
];

export const buildBrowseChips = (
  region: string,
): { label: string; query: CategoryQuery }[] => [
  { label: 'Top 10 Movies', query: { kind: 'popularMovies', region } },
  { label: 'Top 10 TV', query: { kind: 'popularTv', region } },
  { label: 'Worldwide', query: { kind: 'trendingMovies' } },
  {
    label: 'Netflix',
    query: {
      kind: 'providerMixed',
      providerId: WATCH_PROVIDERS.netflix,
      region,
    },
  },
  { label: 'Action', query: { kind: 'genreMovie', genreId: GENRE_IDS.action, region } },
  { label: 'Horror', query: { kind: 'genreMovie', genreId: GENRE_IDS.horror, region } },
  {
    label: 'Animation',
    query: { kind: 'genreMovie', genreId: GENRE_IDS.animation, region },
  },
  { label: 'Drama', query: { kind: 'genreTv', genreId: GENRE_IDS.drama, region } },
  { label: 'Crime', query: { kind: 'genreTv', genreId: GENRE_IDS.crime, region } },
];
