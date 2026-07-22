/**
 * Shared "coming soon" detection for movies, TV shows, and individual TV
 * episodes.
 *
 * A title/episode is considered "coming soon" when EITHER:
 *   1. The release/air date is strictly in the future, or
 *   2. The TMDB `status` field indicates the title is still being made
 *      (Planned / In Production / Post Production / Rumored).
 *
 * `getComingSoon()` combines both signals and returns a ready-to-render
 * label (e.g. "Coming Jan 15, 2027") so callers don't have to reinvent
 * formatting per screen.
 */

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const parseDate = (iso?: string): Date | null => {
  if (!iso) return null;
  // TMDB dates arrive as `YYYY-MM-DD`. JS `new Date('YYYY-MM-DD')` parses as
  // UTC midnight which can drift one day west of the user's local calendar.
  // Split-and-construct guarantees the intended local calendar day.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (match) {
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  const fallback = new Date(iso);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

const startOfToday = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

/**
 * `true` when `iso` parses to a date strictly after the start of today
 * (i.e. still upcoming, not "today" and not in the past).
 */
export const isFutureDate = (iso?: string): boolean => {
  const parsed = parseDate(iso);
  if (!parsed) return false;
  return parsed.getTime() > startOfToday().getTime();
};

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const UNRELEASED_STATUSES = new Set([
  'planned',
  'in production',
  'post production',
  'rumored',
]);

/**
 * `true` when the TMDB `status` string indicates the title isn't out yet.
 * Case-insensitive, tolerant of extra whitespace.
 */
export const isUnreleasedStatus = (status?: string): boolean => {
  if (!status) return false;
  return UNRELEASED_STATUSES.has(status.trim().toLowerCase());
};

// ---------------------------------------------------------------------------
// Label formatting
// ---------------------------------------------------------------------------

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Human-readable "Coming {date}" label for the given ISO date. Falls back
 * gracefully when only a year is parseable or no date at all is available.
 *
 * Examples:
 *   formatComingLabel('2027-01-15') === 'Coming Jan 15, 2027'
 *   formatComingLabel('2027')       === 'Coming in 2027'
 *   formatComingLabel(undefined)    === 'Coming Soon'
 */
export const formatComingLabel = (iso?: string): string => {
  if (!iso) return 'Coming Soon';
  const parsed = parseDate(iso);
  if (parsed) {
    const month = MONTHS_SHORT[parsed.getMonth()];
    return `Coming ${month} ${parsed.getDate()}, ${parsed.getFullYear()}`;
  }
  const yearMatch = /^(\d{4})/.exec(iso);
  if (yearMatch) return `Coming in ${yearMatch[1]}`;
  return 'Coming Soon';
};

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface ComingSoonInput {
  releaseDate?: string;
  status?: string;
}

export interface ComingSoonResult {
  comingSoon: boolean;
  /** Ready-to-render label, e.g. "Coming Jan 15, 2027" or "Coming Soon". */
  label: string;
  /** The raw ISO date we used to build the label (if any). */
  date?: string;
}

/**
 * Combines the date and status signals into a single decision + label.
 *
 * Precedence for the label when `comingSoon` is `true`:
 *   1. `releaseDate` in the future — format it precisely.
 *   2. Otherwise (status-only trigger) — generic "Coming Soon", but if a
 *      release date string exists we still try to format it since TMDB
 *      sometimes ships a year-only placeholder alongside a status.
 */
export const getComingSoon = (input: ComingSoonInput): ComingSoonResult => {
  const futureDate = isFutureDate(input.releaseDate);
  const unreleased = isUnreleasedStatus(input.status);
  const comingSoon = futureDate || unreleased;
  if (!comingSoon) {
    return { comingSoon: false, label: '' };
  }
  return {
    comingSoon: true,
    label: formatComingLabel(input.releaseDate),
    date: input.releaseDate,
  };
};
