/**
 * Turns raw service/network failures into short, human copy for the UI.
 *
 * Screens used to render `err.message` verbatim, so users could see things
 * like "Network request failed" or "AbortError: aborted". Anything we don't
 * recognise but that is already short and readable is passed through, so we
 * never hide genuinely useful backend messages.
 */
const MAX_VERBATIM_LENGTH = 140;

export const friendlyErrorMessage = (
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string => {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  const msg = raw.trim().toLowerCase();
  if (!msg) return fallback;

  if (msg.includes('abort')) {
    return 'The request took too long. Check your connection and try again.';
  }

  if (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('no internet') ||
    msg.includes('offline') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('econn') ||
    msg.includes('enotfound')
  ) {
    return 'No internet connection. Check your network and try again.';
  }

  if (msg.includes('429') || msg.includes('rate limit')) {
    return 'Too many requests right now. Please wait a moment and try again.';
  }

  if (
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden')
  ) {
    return 'This content is not available right now.';
  }

  if (msg.includes('404') || msg.includes('not found')) {
    return 'We could not find that content.';
  }

  if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
    return 'Our servers are having trouble. Please try again in a moment.';
  }

  return raw.length <= MAX_VERBATIM_LENGTH ? raw : fallback;
};
