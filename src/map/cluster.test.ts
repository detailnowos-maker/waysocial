import { clusterMarkers, type Positioned } from './cluster';
import type { MapMarker } from './types';

const m = (id: string, kind: MapMarker['kind'] = 'post', count?: number): MapMarker => ({ id, kind, lat: 0, lng: 0, count });
const at = (marker: MapMarker, x: number, y: number): Positioned => ({ marker, x, y });

describe('clusterMarkers', () => {
  it('agrupa marcadores próximos e mantém os isolados', () => {
    const r = clusterMarkers([at(m('a'), 10, 10), at(m('b'), 30, 40), at(m('c'), 400, 400)]);
    expect(r.clusters).toHaveLength(1);
    expect(r.clusters[0].members.map((x) => x.id).sort()).toEqual(['a', 'b']);
    expect(r.singles.map((s) => s.marker.id)).toEqual(['c']);
  });

  it('o contador do cluster soma o `count` dos membros', () => {
    const r = clusterMarkers([at(m('a', 'post', 3), 10, 10), at(m('b', 'post', 4), 20, 20)]);
    expect(r.clusters[0].count).toBe(7);
  });

  it('viagens ao vivo, eventos e fixados nunca entram em cluster', () => {
    const r = clusterMarkers([at(m('l', 'live'), 10, 10), at(m('e', 'event'), 12, 12), at({ ...m('p'), pinned: true }, 14, 14), at(m('x'), 16, 16)]);
    expect(r.clusters).toHaveLength(0);
    expect(r.singles).toHaveLength(4);
  });

  it('o centro do cluster é a média das posições', () => {
    const r = clusterMarkers([at(m('a'), 10, 10), at(m('b'), 30, 30)]);
    expect(r.clusters[0].x).toBe(20);
    expect(r.clusters[0].y).toBe(20);
  });
});
