// Navigation type definitions for React Navigation

import type {BottomTabScreenProps} from '@react-navigation/bottom-tabs';
import type {CompositeScreenProps} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {Movie, TVShow} from './index';

export type RootStackParamList = {
  Splash: undefined;
  Main: undefined;
  Detail: {
    content: Movie | TVShow;
    video?: string;
    isLocal?: boolean;
    autoPlay?: boolean;
  };
  Downloads: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Search: undefined;
  Settings: undefined;
};

export type RootStackScreenProps<Screen extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, Screen>;

export type MainTabScreenProps<Screen extends keyof MainTabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, Screen>,
    NativeStackScreenProps<RootStackParamList>
  >;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
