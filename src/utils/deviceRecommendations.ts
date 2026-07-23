const BYTES_PER_GB = 1024 ** 3;

/** Clamp range for the "forward buffer" (how many seconds of media the
 * player reads ahead of the playhead) exposed to the user in Settings. */
export const MIN_FORWARD_BUFFER_SECONDS = 10;
export const MAX_FORWARD_BUFFER_SECONDS = 600;
export const FORWARD_BUFFER_STEP_SECONDS = 10;

/** Fallback used whenever the device's RAM can't be determined (e.g. web). */
const DEFAULT_FORWARD_BUFFER_SECONDS = 30;

/**
 * Recommends a `preferredForwardBufferDuration` (seconds of media to buffer
 * ahead of the playhead — see `expo-video`'s `BufferOptions`) based on the
 * device's total RAM.
 *
 * A larger read-ahead window means fewer stalls on flaky connections, but
 * costs more resident memory per player instance (buffered segments are kept
 * decoded/queued in RAM). Low-RAM devices — common on budget Android
 * handsets and older Android TV boxes — risk the OS killing the app under
 * memory pressure if the window is too generous, so they get a conservative
 * value; higher-RAM devices can comfortably afford a much larger one.
 */
export const getRecommendedForwardBufferSeconds = (
  totalMemoryBytes: number | null,
): number => {
  if (!totalMemoryBytes || totalMemoryBytes <= 0) {
    return DEFAULT_FORWARD_BUFFER_SECONDS;
  }
  const gb = totalMemoryBytes / BYTES_PER_GB;
  if (gb < 2) return 15;
  if (gb < 3) return 20;
  if (gb < 4) return 30;
  if (gb < 6) return 60;
  if (gb < 8) return 120;
  return 300;
};

/** Human-friendly "X GB" label for the live-preview text in Settings. */
export const formatMemoryGb = (totalMemoryBytes: number | null): string => {
  if (!totalMemoryBytes || totalMemoryBytes <= 0) return 'unknown';
  const gb = totalMemoryBytes / BYTES_PER_GB;
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)} GB`;
};
