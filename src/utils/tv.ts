import { Platform } from 'react-native';

/** True when running on an Android TV / tvOS leanback device. */
export const isTV = Platform.isTV === true;

/**
 * True when running as a Mac Catalyst app (an iOS binary compiled to run
 * natively on macOS). Falls back to inspecting `Platform.constants` for
 * older RN versions that don't expose the top-level flag.
 */
export const isMacCatalyst: boolean = (() => {
  if (Platform.OS !== 'ios') return false;
  const p = Platform as unknown as {
    isMacCatalyst?: boolean;
    constants?: { isMacCatalyst?: boolean; interfaceIdiom?: string };
  };
  if (p.isMacCatalyst === true) return true;
  if (p.constants?.isMacCatalyst === true) return true;
  return p.constants?.interfaceIdiom === 'mac';
})();

/**
 * Layout-level shorthand for "use the ten-foot / desktop shell". True on
 * Android TV / tvOS and on Mac Catalyst so macOS reuses the TV navigator,
 * grid, and spacing without any per-screen branching.
 */
export const isTVLayout = isTV || isMacCatalyst;

export const TV_FOCUS_SCALE = 1.08;

/**
 * TV remote event types surfaced by RN's TVEventHandler / useTVEventHandler.
 */
export type TVRemoteEvent =
  | 'select'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'playPause'
  | 'play'
  | 'pause'
  | 'rewind'
  | 'fastForward'
  | 'menu';
