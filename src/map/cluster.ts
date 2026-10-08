import type { MapMarker } from './types';

export interface Positioned {
  marker: MapMarker;
  x: number;
  y: number;
}

export interface ClusterResult {
  singles: Positioned[];
  clusters: { id: string; x: number; y: number; count: number; members: MapMarker[] }[];
}

/**
 * Agrupa marcadores próximos em "bolhas" com contador. Guloso, em grade de `cell` px:
 * rápido o bastante para centenas de pontos e estável enquanto o usuário arrasta o mapa.
 * Marcadores `pinned`/de viagem ao vivo/evento nunca entram em cluster.
 */
export function clusterMarkers(items: Positioned[], cell = 60): ClusterResult {
  const singles: Positioned[] = [];
  const buckets = new Map<string, Positioned[]>();
  for (const it of items) {
    const never = it.marker.pinned || it.marker.kind === 'live' || it.marker.kind === 'event' || it.marker.kind === 'cluster';
    if (never) {
      singles.push(it);
      continue;
    }
    const key = `${Math.floor(it.x / cell)}:${Math.floor(it.y / cell)}`;
    const list = buckets.get(key);
    if (list) list.push(it);
    else buckets.set(key, [it]);
  }
  const clusters: ClusterResult['clusters'] = [];
  for (const [key, list] of buckets) {
    if (list.length === 1) {
      singles.push(list[0]);
      continue;
    }
    const x = list.reduce((a, p) => a + p.x, 0) / list.length;
    const y = list.reduce((a, p) => a + p.y, 0) / list.length;
    clusters.push({ id: `cluster:${key}:${list.length}`, x, y, count: list.reduce((a, p) => a + (p.marker.count ?? 1), 0), members: list.map((p) => p.marker) });
  }
  return { singles, clusters };
}
