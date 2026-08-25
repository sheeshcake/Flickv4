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

/** True on react-native-windows (desktop WinUI / UWP shell). */
export const isWindowsDesktop = Platform.OS === ('windows' as typeof Platform.OS);

/**
 * Layout-level shorthand for "use the ten-foot TV shell". True only on real
 * Android TV / tvOS devices. Mac Catalyst and Windows fall through to the
 * tablet layout (classified by window size in `getDeviceKind`), so they use
 * the tab navigator, tablet grid columns, and tablet spacing.
 */
export const isTVLayout = isTV;

/**
 * Canonical TV D-pad focus ring: a 2px primary-colored border, used by every
 * focusable control so highlighting is visually consistent app-wide.
 */
export const TV_FOCUS_BORDER_CLASSNAME = 'border-2 border-primary';

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
