import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

export const colors = {
  red: '#E50914',
  black: '#000000',
  white: '#FFFFFF',
  dark: '#141414',
  gray: '#564D4D',
  light: '#CCCCCC',
  transparentBlack: 'rgba(0, 0, 0, 0.7)',
};

export const sizes = {
  width,
  height,
};