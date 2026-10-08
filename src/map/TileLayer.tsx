import { memo } from 'react';
import { Image, View } from 'react-native';

import { type LatLng, TILE_SIZE, project } from '@/lib/geo';

interface Props {
  urlTemplate: string;
  center: LatLng;
  zoom: number;
  width: number;
  height: number;
}

/**
 * Camada de tiles raster XYZ ("{z}/{x}/{y}"). Serve qualquer provedor raster: Mapbox Static Tiles,
 * MapTiler, servidor próprio de tiles... Respeite os termos de uso do provedor (o tile.openstreetmap.org
 * NÃO é para uso em produção). Para vetor/estilo/rotação, use o adaptador MapLibre (docs/MAPS.md).
 */
function TileLayerBase({ urlTemplate, center, zoom, width, height }: Props) {
  const z = Math.max(0, Math.min(19, Math.round(zoom)));
  const scale = 2 ** (zoom - z);
  const size = TILE_SIZE * scale;
  const c = project(center, z);
  const originX = c.x - width / (2 * scale);
  const originY = c.y - height / (2 * scale);
  const x0 = Math.floor(originX / TILE_SIZE);
  const y0 = Math.floor(originY / TILE_SIZE);
  const x1 = Math.floor((originX + width / scale) / TILE_SIZE);
  const y1 = Math.floor((originY + height / scale) / TILE_SIZE);
  const max = 2 ** z;
  const tiles: { key: string; uri: string; left: number; top: number }[] = [];
  for (let ty = Math.max(0, y0); ty <= Math.min(max - 1, y1); ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const wrapped = ((tx % max) + max) % max;
      tiles.push({
        key: `${z}/${tx}/${ty}`,
        uri: urlTemplate.replace('{z}', String(z)).replace('{x}', String(wrapped)).replace('{y}', String(ty)),
        left: (tx * TILE_SIZE - originX) * scale,
        top: (ty * TILE_SIZE - originY) * scale,
      });
      if (tiles.length > 48) break;
    }
  }
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, width, height, backgroundColor: '#E6E9EE', overflow: 'hidden' }} pointerEvents="none">
      {tiles.map((t) => (
        <Image key={t.key} source={{ uri: t.uri }} style={{ position: 'absolute', left: Math.round(t.left), top: Math.round(t.top), width: Math.ceil(size) + 1, height: Math.ceil(size) + 1 }} />
      ))}
    </View>
  );
}

export const TileLayer = memo(TileLayerBase);
