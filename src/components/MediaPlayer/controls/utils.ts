export const DOUBLE_PRESS_DELAY = 300;
export const SEEK_INCREMENT_SECONDS = 5;
export const AUTO_HIDE_DELAY = 3000;

export const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '00:00:00';
  }

  const clampedSeconds = Math.max(0, seconds);
  return new Date(clampedSeconds * 1000).toISOString().substr(11, 8);
};

export const trimText = (text: string, fullscreen: boolean, maxLength = 12): string => {
  if (!text) {
    return '';
  }

  const effectiveMaxLength = fullscreen ? maxLength * 2 : maxLength;
  return text.length > effectiveMaxLength ? `${text.substring(0, effectiveMaxLength)}...` : text;
};
