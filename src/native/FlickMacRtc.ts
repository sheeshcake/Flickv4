import {
  NativeEventEmitter,
  NativeModules,
  requireNativeComponent,
  type HostComponent,
  type ViewProps,
} from 'react-native';
import { isMacCatalyst } from '@/src/utils/tv';

type Sdp = { type?: string; sdp?: string };

type FlickMacRtcNative = {
  join: () => Promise<boolean>;
  leave: () => Promise<boolean>;
  createOffer: (peerId: string, iceRestart: boolean) => Promise<Sdp>;
  setRemote: (peerId: string, type: string, sdp: string) => Promise<boolean>;
  createAnswer: (peerId: string) => Promise<Sdp>;
  addIce: (
    peerId: string,
    candidate: string,
    sdpMid: string | null,
    sdpMLineIndex: number | null,
  ) => Promise<boolean>;
  closePeer: (peerId: string) => Promise<boolean>;
  setMuted: (muted: boolean) => Promise<boolean>;
  setCamOff: (camOff: boolean) => Promise<boolean>;
  setPeerName: (peerId: string, name: string) => Promise<boolean>;
  addListener: (event: string) => void;
  removeListeners: (count: number) => void;
};

const native = NativeModules.FlickMacRtc as FlickMacRtcNative | undefined;

export const macRtcAvailable = isMacCatalyst && native != null;

export const FlickMacRtc = native;

export const macRtcEmitter = native ? new NativeEventEmitter(native) : null;

export const FlickMacRtcView = (
  isMacCatalyst
    ? requireNativeComponent<ViewProps>('FlickMacRtcView')
    : null
) as HostComponent<ViewProps> | null;
