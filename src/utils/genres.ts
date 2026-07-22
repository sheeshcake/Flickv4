/** Common TMDB genre ids used to build home rows. */
export const GENRE_IDS = {
  action: 28,
  comedy: 35,
  horror: 27,
  romance: 10749,
  documentary: 99,
  sciFi: 878,
  animation: 16,
} as const;

const GENRE_NAMES: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Science Fiction',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
};

export const getGenreName = (id: number): string => GENRE_NAMES[id] ?? '';
