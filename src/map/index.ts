import type { ComponentType } from 'react';

import { RasterMap } from './RasterMap';
import type { SocialMapProps } from './types';

/**
 * Ponto ÚNICO de troca do provedor de mapa.
 *
 * Hoje: `RasterMap` (Web Mercator em JS — mapa ilustrativo ou tiles raster XYZ via
 * `EXPO_PUBLIC_MAP_TILE_URL`). Para usar Mapbox/MapLibre/Google, implemente `SocialMapProps`
 * num componente novo e exporte-o aqui. Roteiro completo em docs/MAPS.md.
 */
export const SocialMap: ComponentType<SocialMapProps> = RasterMap;

export type { MapFocus, MapLine, MapMarker, MapViewport, SocialMapProps } from './types';
export { CATEGORY_STYLE } from './markers';
