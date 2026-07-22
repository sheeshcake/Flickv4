import { useWindowDimensions } from 'react-native';
import { DeviceKind, getDeviceKind } from '@/src/utils/responsive';
import { isTVLayout } from '@/src/utils/tv';

/**
 * Reactive device classification that updates on rotation / resize.
 *
 * We feed `isTVLayout` (not the raw `isTV`) so Mac Catalyst windows are
 * classified as `'tv'` — that keeps grid columns, card widths, and paddings
 * identical to the Android TV shell without any per-screen branching.
 */
export const useDeviceKind = (): DeviceKind => {
  const { width, height } = useWindowDimensions();
  return getDeviceKind({ width, height }, isTVLayout);
};
