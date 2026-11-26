import type { CategoryQuery } from '@/src/services/categories';

/** Browse scope shown as chips above the category grid. */
export type BrowseScope = 'all' | 'series' | 'films';

export interface CategoryDefinition {
  id: string;
  name: string;
  /** TMDB movie genre ids joined with `,` (or `|` for any-of). */
  movieGenres?: string;
  /** TMDB TV genre ids joined with `,` (or `|` for any-of). */
  tvGenres?: string;
}

/**
 * Genre map ported from Nightflix's NFCatalog. Movie and TV genre ids differ
 * on TMDB, so each category keeps both sides and lets the chosen scope decide
 * which one (or both) is queried.
 */
export const CATEGORY_CATALOG: CategoryDefinition[] = [
  { id: 'action', name: 'Action', movieGenres: '28', tvGenres: '10759' },
  { id: 'adventure', name: 'Adventure', movieGenres: '12', tvGenres: '10759' },
  { id: 'animation', name: 'Animation', movieGenres: '16', tvGenres: '16' },
  { id: 'comedy', name: 'Comedy', movieGenres: '35', tvGenres: '35' },
  { id: 'crime', name: 'Crime', movieGenres: '80', tvGenres: '80' },
  { id: 'documentaries', name: 'Documentaries', movieGenres: '99', tvGenres: '99' },
  { id: 'drama', name: 'Drama', movieGenres: '18', tvGenres: '18' },
  { id: 'family', name: 'Family', movieGenres: '10751', tvGenres: '10751' },
  { id: 'fantasy', name: 'Fantasy', movieGenres: '14', tvGenres: '10765' },
  { id: 'history', name: 'History', movieGenres: '36' },
  { id: 'horror', name: 'Horror', movieGenres: '27' },
  { id: 'kids', name: 'Kids', movieGenres: '10751|16', tvGenres: '10762' },
  { id: 'music', name: 'Music', movieGenres: '10402' },
  { id: 'mystery', name: 'Mystery', movieGenres: '9648', tvGenres: '9648' },
  { id: 'reality', name: 'Reality', tvGenres: '10764' },
  { id: 'romance', name: 'Romance', movieGenres: '10749' },
  { id: 'scifi', name: 'Sci-Fi', movieGenres: '878', tvGenres: '10765' },
  { id: 'thrillers', name: 'Thrillers', movieGenres: '53', tvGenres: '80|9648' },
  { id: 'war', name: 'War', movieGenres: '10752', tvGenres: '10768' },
  { id: 'westerns', name: 'Westerns', movieGenres: '37', tvGenres: '37' },
];

export const getCategoryById = (id?: string): CategoryDefinition | undefined =>
  id ? CATEGORY_CATALOG.find((category) => category.id === id) : undefined;

export const supportsScope = (
  category: CategoryDefinition,
  scope: BrowseScope,
): boolean => {
  if (scope === 'series') return !!category.tvGenres;
  if (scope === 'films') return !!category.movieGenres;
  return !!category.movieGenres || !!category.tvGenres;
};

const toIsoDate = (date: Date): string =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

const dateAfterDays = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
};

export interface CategoryRowSpec {
  id: string;
  title: string;
  query: CategoryQuery;
}

const scopeLabel = (scope: BrowseScope): string =>
  scope === 'series' ? ' Series' : scope === 'films' ? ' Films' : '';

/**
 * Resolve which TMDB sides a scope+category combination should query, then
 * build one `discover` query shared by every recipe below.
 */
const discoverQuery = (
  scope: BrowseScope,
  category: CategoryDefinition | undefined,
  options: {
    sortBy: string;
    movieVoteCountGte?: number;
    tvVoteCountGte?: number;
    movieVoteCountLte?: number;
    tvVoteCountLte?: number;
    movieDateTo?: string;
    tvDateTo?: string;
  },
): CategoryQuery => {
  const movieGenres = scope === 'series' ? undefined : category?.movieGenres;
  const tvGenres = scope === 'films' ? undefined : category?.tvGenres;
  const media: 'movie' | 'tv' | 'mixed' =
    movieGenres && tvGenres
      ? 'mixed'
      : movieGenres
        ? 'movie'
        : tvGenres
          ? 'tv'
          : scope === 'series'
            ? 'tv'
            : scope === 'films'
              ? 'movie'
              : 'mixed';

  return {
    kind: 'discover',
    media,
    movieGenres,
    tvGenres,
    ...options,
  };
};

/** Nightflix's Popular / New / Acclaimed / Gems / Classic row recipes. */
export const buildCategoryRows = (
  scope: BrowseScope,
  category?: CategoryDefinition,
): CategoryRowSpec[] => {
  const name = category?.name ?? 'Titles';
  const suffix = category ? '' : scopeLabel(scope);
  const today = toIsoDate(new Date());
  const rows: CategoryRowSpec[] = [
    {
      id: 'popular',
      title: `Popular ${name}${suffix}`,
      query: discoverQuery(scope, category, {
        sortBy: 'popularity.desc',
        movieVoteCountGte: 150,
        tvVoteCountGte: 60,
      }),
    },
    {
      id: 'new',
      title: `New ${name}${suffix}`,
      query: discoverQuery(scope, category, {
        sortBy:
          scope === 'series'
            ? 'first_air_date.desc'
            : scope === 'films'
              ? 'primary_release_date.desc'
              : 'popularity.desc',
        movieVoteCountGte: 40,
        tvVoteCountGte: 15,
        movieDateTo: today,
        tvDateTo: today,
      }),
    },
    {
      id: 'acclaimed',
      title: `Critically Acclaimed ${name}${suffix}`,
      query: discoverQuery(scope, category, {
        sortBy: 'vote_average.desc',
        movieVoteCountGte: 1500,
        tvVoteCountGte: 400,
      }),
    },
    {
      id: 'gems',
      title: `Hidden Gems${category ? ` · ${name}` : suffix}`,
      query: discoverQuery(scope, category, {
        sortBy: 'vote_average.desc',
        movieVoteCountGte: 150,
        movieVoteCountLte: 1200,
        tvVoteCountGte: 60,
        tvVoteCountLte: 400,
      }),
    },
    {
      id: 'classic',
      title: `Classic ${name}${suffix}`,
      query: discoverQuery(scope, category, {
        sortBy: 'vote_count.desc',
        movieDateTo: '2004-12-31',
        tvDateTo: '2008-12-31',
      }),
    },
  ];

  if (category?.movieGenres && category.tvGenres && scope === 'all') {
    rows.splice(
      2,
      0,
      {
        id: 'category-series',
        title: `${name} Series`,
        query: {
          kind: 'discover',
          media: 'tv',
          tvGenres: category.tvGenres,
          sortBy: 'popularity.desc',
          tvVoteCountGte: 100,
        },
      },
      {
        id: 'category-films',
        title: `${name} Films`,
        query: {
          kind: 'discover',
          media: 'movie',
          movieGenres: category.movieGenres,
          sortBy: 'popularity.desc',
          movieVoteCountGte: 500,
        },
      },
    );
  }

  return rows;
};

/** Shared query for the Recently Added rail (now playing + new series). */
export const buildRecentlyAddedQuery = (
  media: 'mixed' | 'movie' | 'tv' = 'mixed',
  region?: string,
): CategoryQuery => ({ kind: 'recentlyAdded', media, region });

/** A small trending rail above the recipe rows for scope-wide browsing. */
export const buildScopeTrendingRow = (
  scope: BrowseScope,
): CategoryRowSpec | null => {
  if (scope === 'series') {
    return { id: 'trending', title: `Trending Series`, query: { kind: 'trendingTv' } };
  }
  if (scope === 'films') {
    return {
      id: 'trending',
      title: 'Trending Films',
      query: { kind: 'trendingMovies' },
    };
  }
  return { id: 'trending', title: 'Trending Now', query: { kind: 'trendingAll' } };
};

export { dateAfterDays };
