import {TMDBService} from '../TMDBService';

describe('TMDBService', () => {
  let tmdbService: TMDBService;

  beforeEach(() => {
    tmdbService = new TMDBService();
  });

  it('should create an instance of TMDBService', () => {
    expect(tmdbService).toBeInstanceOf(TMDBService);
  });

  it('should have getImageUrl method', () => {
    expect(typeof tmdbService.getImageUrl).toBe('function');
  });

  it('should generate correct image URL', () => {
    const path = '/test-image.jpg';
    const expectedUrl = 'https://image.tmdb.org/t/p/w500/test-image.jpg';
    expect(tmdbService.getImageUrl(path)).toBe(expectedUrl);
  });

  it('should return empty string for empty path', () => {
    expect(tmdbService.getImageUrl('')).toBe('');
  });

  it('should have all required methods', () => {
    const methods = [
      'getTrendingMovies',
      'getTrendingTVShows',
      'searchMulti',
      'searchMovies',
      'searchTVShows',
      'getMovieDetails',
      'getTVShowDetails',
      'getMovieVideos',
      'getTVShowVideos',
      'getSimilarMovies',
      'getSimilarTVShows',
      'getMovieCredits',
      'getTVShowCredits',
      'getPopularMovies',
      'getPopularTVShows',
      'getTopRatedMovies',
      'getTopRatedTVShows',
      'getNowPlayingMovies',
      'getUpcomingMovies',
      'getTVShowsAiringToday',
      'getTVShowsOnTheAir',
    ];

    methods.forEach(method => {
      expect(typeof (tmdbService as any)[method]).toBe('function');
    });
  });
});
