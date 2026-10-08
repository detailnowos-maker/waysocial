import type { StyleProp, ViewStyle } from 'react-native';

import type { Media, PlaceCategory, ProfilePreview } from '@/domain/types';
import type { LatLng } from '@/lib/geo';

/**
 * Contrato do mapa do WaySocial.
 *
 * Toda tela fala com `SocialMap` por estas props — nenhuma conhece Mapbox, MapLibre ou Google.
 * Para trocar o provedor, implemente um componente com `SocialMapProps` (ex.: em cima de
 * `@maplibre/maplibre-react-native`) e troque a exportação em `src/map/index.ts`.
 * Veja docs/MAPS.md.
 */

export type MarkerKind = 'post' | 'place' | 'event' | 'live' | 'moment' | 'stop' | 'origin' | 'destination' | 'cluster';

export interface MapMarker {
  id: string;
  kind: MarkerKind;
  lat: number;
  lng: number;
  /** Miniatura (post/momento). */
  media?: Media;
  /** Avatar (viagem ao vivo). */
  avatar?: ProfilePreview;
  category?: PlaceCategory;
  label?: string;
  /** Contador exibido no selo (nº de publicações, pessoas...). */
  count?: number;
  /** Marcadores `pinned` nunca entram em cluster. */
  pinned?: boolean;
}

export interface MapLine {
  id: string;
  coords: LatLng[];
  color: string;
  width?: number;
  dashed?: boolean;
  opacity?: number;
}

export interface MapViewport {
  center: LatLng;
  zoom: number;
  radiusM: number;
}

export interface MapFocus {
  /** Mude `key` para disparar a animação até `center`/`zoom` (ou até enquadrar `fit`). */
  key: string | number;
  center?: LatLng;
  zoom?: number;
  fit?: LatLng[];
}

export interface SocialMapProps {
  markers: MapMarker[];
  lines?: MapLine[];
  selectedId?: string | null;
  /** Localização do usuário (ponto azul). Passe só quando o usuário permitiu. */
  userLocation?: LatLng | null;
  /** Visão inicial. Se `fit` for informado, enquadra esses pontos. */
  initial?: { center?: LatLng; zoom?: number; fit?: LatLng[] };
  focus?: MapFocus;
  interactive?: boolean;
  controls?: boolean;
  /** Margem (px) usada ao enquadrar `fit`/`focus.fit` — para não ficar embaixo de painéis. */
  padding?: { top?: number; bottom?: number; left?: number; right?: number };
  onMarkerPress?: (marker: MapMarker) => void;
  onMapPress?: () => void;
  /** O usuário começou a arrastar/pinçar o mapa (use para parar de "seguir" a posição). */
  onGestureStart?: () => void;
  onViewportChange?: (viewport: MapViewport) => void;
  onLocatePress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}
