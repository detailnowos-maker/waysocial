import { useWindowDimensions } from 'react-native';

/** No celular o app ocupa a tela toda; em navegador largo, vira uma "coluna de celular" centralizada. */
export const APP_MAX_WIDTH = 480;

export function useAppWidth(): number {
  const { width } = useWindowDimensions();
  return Math.min(width, APP_MAX_WIDTH);
}

export function useAppHeight(): number {
  const { height } = useWindowDimensions();
  return height;
}
