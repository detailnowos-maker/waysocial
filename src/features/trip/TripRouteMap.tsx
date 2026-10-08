import { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { type LatLng } from '@/lib/geo';
import { type MapMarker, SocialMap } from '@/map';
import { colors } from '@/theme';

interface Props {
  route: LatLng[];
  /** Marcadores extras (momentos, paradas, posição atual). */
  markers?: MapMarker[];
  showEndpoints?: boolean;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
  controls?: boolean;
  padding?: { top?: number; bottom?: number; left?: number; right?: number };
  onMarkerPress?: (m: MapMarker) => void;
  selectedId?: string | null;
  testID?: string;
}

/** Mapa com o trajeto de uma viagem desenhado, enquadrado automaticamente. */
export function TripRouteMap({ route, markers = [], showEndpoints = true, style, interactive = false, controls = false, padding, onMarkerPress, selectedId, testID }: Props) {
  const all = useMemo<MapMarker[]>(() => {
    const ends: MapMarker[] =
      showEndpoints && route.length > 1
        ? [
            { id: 'origin', kind: 'origin', lat: route[0].lat, lng: route[0].lng, pinned: true },
            { id: 'destination', kind: 'destination', lat: route[route.length - 1].lat, lng: route[route.length - 1].lng, pinned: true },
          ]
        : [];
    // momentos e paradas ficam sempre visíveis (sem cluster) — o trajeto é o protagonista
    return [...ends, ...markers.map((m) => ({ ...m, pinned: true }))];
  }, [route, markers, showEndpoints]);

  const lines = useMemo(() => (route.length > 1 ? [{ id: 'route', coords: route, color: colors.brand, width: 5 }] : []), [route]);
  const initial = useMemo(() => ({ fit: route.length ? route : undefined }), [route]);

  return (
    <SocialMap
      testID={testID}
      markers={all}
      lines={lines}
      initial={initial}
      focus={undefined}
      interactive={interactive}
      controls={controls}
      padding={padding ?? { top: 28, bottom: 28, left: 28, right: 28 }}
      onMarkerPress={onMarkerPress}
      selectedId={selectedId}
      style={style}
    />
  );
}
