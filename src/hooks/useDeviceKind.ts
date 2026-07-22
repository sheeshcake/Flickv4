import { useWindowDimensions } from 'react-native';
import { DeviceKind, getDeviceKind } from '@/src/utils/responsive';
import { isTV } from '@/src/utils/tv';

/** Reactive device classification that updates on rotation / resize. */
export const useDeviceKind = (): DeviceKind => {
  const { width, height } = useWindowDimensions();
  return getDeviceKind({ width, height }, isTV);
};
