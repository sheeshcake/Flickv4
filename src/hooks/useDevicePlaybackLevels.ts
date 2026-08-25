import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import * as Brightness from 'expo-brightness';
import { VolumeManager } from 'react-native-volume-manager';

const clamp01 = (n: number): number => {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
};

const readDisplayedBrightness = async (): Promise<number> => {
  const current =
    Platform.OS === 'android'
      ? await Brightness.getSystemBrightnessAsync().catch(() =>
          Brightness.getBrightnessAsync(),
        )
      : await Brightness.getBrightnessAsync();
  return clamp01(current);
};

/**
 * In-player sliders bound to the phone’s real media volume and screen
 * brightness. Not sent over watch party.
 *
 * Brightness is a session window override (Netflix-style): we never write
 * global system brightness. The slider is seeded from the currently
 * displayed level; dragging overrides the activity window until unmount.
 */
export const useDevicePlaybackLevels = () => {
  const [volume, setVolumeState] = useState(1);
  const [brightness, setBrightness] = useState<number | undefined>(undefined);
  const [useSystemVolume, setUseSystemVolume] = useState(false);
  const initialBrightnessRef = useRef<number | null>(null);
  const brightnessSupportedRef = useRef(true);
  const settingVolumeRef = useRef(false);
  const userOverrodeRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === ('windows' as typeof Platform.OS)) {
      setUseSystemVolume(false);
      return;
    }
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
    let brightnessSub: { remove: () => void } | undefined;

    const seed = async () => {
      try {
        const current = await readDisplayedBrightness();
        if (cancelled) return;
        if (userOverrodeRef.current) return;
        initialBrightnessRef.current = current;
        setBrightness(current);
      } catch {
        brightnessSupportedRef.current = false;
        if (!cancelled) setBrightness(undefined);
      }
    };

    void seed();

    if (Platform.OS === ('windows' as typeof Platform.OS)) {
      return () => {
        cancelled = true;
      };
    }

    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      brightnessSub = Brightness.addBrightnessListener(({ brightness: next }) => {
        if (userOverrodeRef.current) return;
        const clamped = clamp01(next);
        initialBrightnessRef.current = clamped;
        setBrightness(clamped);
      });
    }

    const onAppState = (state: AppStateStatus) => {
      if (state !== 'active') return;
      if (userOverrodeRef.current) return;
      void seed();
    };
    const appSub = AppState.addEventListener('change', onAppState);

    return () => {
      cancelled = true;
      brightnessSub?.remove();
      appSub.remove();
      if (!brightnessSupportedRef.current) return;
      if (Platform.OS === 'android') {
        void Brightness.restoreSystemBrightnessAsync().catch(() => {});
        return;
      }
      const restore = initialBrightnessRef.current;
      if (restore != null) {
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
    const next = clamp01(value);
    userOverrodeRef.current = true;
    setBrightness(next);
    void Brightness.setBrightnessAsync(next).catch(() => {
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
