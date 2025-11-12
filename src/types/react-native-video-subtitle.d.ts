declare module 'react-native-video-subtitle' {
  import { ComponentType } from 'react';
  import { ViewStyle, TextStyle } from 'react-native';

  interface SubtitleProps {
    currentTime: number;
    subtitle: {
      uri: string;
      translationUri?: string;
    };
    style?: ViewStyle;
    textStyle?: TextStyle;
    subtitleTextStyle?: TextStyle;
    translationTextStyle?: TextStyle;
    adjustsFontSizeToFit?: boolean;
    disableSubtitle?: boolean;
    disableTranslation?: boolean;
    position?: 'top' | 'bottom';
  }

  const SubtitlePlayer: ComponentType<SubtitleProps>;
  export default SubtitlePlayer;
}