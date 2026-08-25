import { useWindowDimensions } from 'react-native';
import { DeviceKind, getDeviceKind } from '@/src/utils/responsive';
import { isTVLayout } from '@/src/utils/tv';

/**
 * Reactive device classification that updates on rotation / resize.
 *
 * We feed `isTVLayout`, which is true only on real TV devices. Mac Catalyst
 * and Windows windows are classified by size instead, so their large windows
 * resolve to `'tablet'` (tablet grid columns, card widths, and paddings).
 */
export const useDeviceKind = (): DeviceKind => {
  const { width, height } = useWindowDimensions();
  return getDeviceKind({ width, height }, isTVLayout);
};
