import React, { useEffect } from 'react';
import { View, ViewProps } from 'react-native';
import { OverlayProvider } from '@gluestack-ui/core/overlay/creator';
import { ToastProvider } from '@gluestack-ui/core/toast/creator';
import { Appearance, ColorSchemeName } from "react-native";

export type ModeType = 'light' | 'dark' | 'system';

export function GluestackUIProvider({
  mode = 'system',
  palette = 'classic',
  ...props
}: {
  mode?: ModeType;
  palette?: 'classic' | 'coffee';
  children?: React.ReactNode;
  style?: ViewProps['style'];
}) {
  useEffect(() => {
    Appearance.setColorScheme(mode as ColorSchemeName);
  }, [mode]);

  // NativeWind web uses the `.coffee` class on :root to switch palettes.
  // On native we approximate by overriding the View's className via the
  // style prop is not enough; instead we rely on the provider's mode and
  // keep palette as a passthrough for consumers that read it. The CSS
  // variables above are the source of truth on web.
  const className = palette === 'coffee' ? 'coffee' : undefined;

  return (
    <View
      className={className}
      style={[
        { flex: 1, height: '100%', width: '100%' },
        props.style,
      ]}
    >
      <OverlayProvider>
        <ToastProvider>{props.children}</ToastProvider>
      </OverlayProvider>
    </View>
  );
}
