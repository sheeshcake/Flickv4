import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Brightness from 'expo-brightness';
import { VolumeManager } from 'react-native-volume-manager';

/**
 * In-player sliders bound to the phone’s real media volume and screen
 * brightness. Not sent over watch party.
 */
export const useDevicePlaybackLevels = () => {
  const [volume, setVolumeState] = useState(1);
  const [brightness, setBrightness] = useState<number | undefined>(undefined);
  const [useSystemVolume, setUseSystemVolume] = useState(false);
  const initialBrightnessRef = useRef<number | null>(null);
  const brightnessSupportedRef = useRef(true);
  const settingVolumeRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let sub: { remove: () => void } | undefined;
    void (async () => {
      try {
        await VolumeManager.showNativeVolumeUI({ enabled: false });
        const result = await VolumeManager.getVolume();
        if (cancelled) return;
        setVolumeState(result.volume);
        setUseSystemVolume(true);
        sub = VolumeManager.addVolumeListener((next) => {
          if (settingVolumeRef.current) return;
          setVolumeState(next.volume);
        });
      } catch {
        if (!cancelled) setUseSystemVolume(false);
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
      void VolumeManager.showNativeVolumeUI({ enabled: true }).catch(() => {});
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let sub: { remove: () => void } | undefined;
    void (async () => {
      try {
        const current =
          Platform.OS === 'android'
            ? await Brightness.getSystemBrightnessAsync().catch(() =>
                Brightness.getBrightnessAsync(),
              )
            : await Brightness.getBrightnessAsync();
        if (cancelled) return;
        initialBrightnessRef.current = current;
        setBrightness(current);
      } catch {
        brightnessSupportedRef.current = false;
        if (!cancelled) setBrightness(undefined);
      }
    })();
    if (Platform.OS === 'ios') {
      sub = Brightness.addBrightnessListener(({ brightness: next }) => {
        setBrightness(next);
      });
    }
    return () => {
      cancelled = true;
      sub?.remove();
      const restore = initialBrightnessRef.current;
      if (restore != null && brightnessSupportedRef.current) {
        void Brightness.setBrightnessAsync(restore).catch(() => {});
      }
    };
  }, []);

  const setVolume = useCallback(
    (value: number) => {
      const next = Math.min(1, Math.max(0, value));
      setVolumeState(next);
      if (!useSystemVolume) return;
      settingVolumeRef.current = true;
      void VolumeManager.setVolume(next, { showUI: false })
        .catch(() => {
          setUseSystemVolume(false);
        })
        .finally(() => {
          settingVolumeRef.current = false;
        });
    },
    [useSystemVolume],
  );

  const onBrightnessChange = useCallback((value: number) => {
    setBrightness(value);
    void Brightness.setBrightnessAsync(value).catch(() => {
      brightnessSupportedRef.current = false;
      setBrightness(undefined);
    });
  }, []);

  return {
    volume,
    setVolume,
    brightness,
    onBrightnessChange,
    videoVolume: useSystemVolume ? 1 : volume,
  };
};
