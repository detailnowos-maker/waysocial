import { CITY_COORDS, ROADS, buildRoute, concatRoutes } from './demoGeography';
import { approximate, fitBounds, haversine, pathLength, pointAlong, project, resampleRoute, unproject } from './geo';

describe('geo', () => {
  it('haversine: Jaraguá do Sul → Joinville ≈ 31 km (linha reta)', () => {
    const d = haversine(CITY_COORDS.jaragua, CITY_COORDS.joinville);
    expect(d).toBeGreaterThan(28_000);
    expect(d).toBeLessThan(34_000);
  });

  it('haversine é simétrica e zero para o mesmo ponto', () => {
    expect(haversine(CITY_COORDS.bc, CITY_COORDS.bc)).toBe(0);
    expect(haversine(CITY_COORDS.bc, CITY_COORDS.floripa)).toBeCloseTo(haversine(CITY_COORDS.floripa, CITY_COORDS.bc), 6);
  });

  it('project/unproject são inversas', () => {
    const p = { lat: -26.99, lng: -48.63 };
    for (const zoom of [3, 8.5, 14]) {
      const { x, y } = project(p, zoom);
      const back = unproject(x, y, zoom);
      expect(back.lat).toBeCloseTo(p.lat, 6);
      expect(back.lng).toBeCloseTo(p.lng, 6);
    }
  });

  it('approximate reduz a precisão para ~1 km', () => {
    const a = approximate({ lat: -26.99306, lng: -48.62714 });
    expect(a).toEqual({ lat: -26.99, lng: -48.63 });
    expect(haversine(a, { lat: -26.99306, lng: -48.62714 })).toBeLessThan(1500);
  });

  it('resampleRoute mantém o comprimento e o passo', () => {
    const route = resampleRoute([CITY_COORDS.bc, CITY_COORDS.floripa], 500);
    const total = pathLength(route);
    expect(total).toBeGreaterThan(haversine(CITY_COORDS.bc, CITY_COORDS.floripa) * 0.99);
    expect(haversine(route[0], route[1])).toBeCloseTo(500, -1);
  });

  it('pointAlong satura nas pontas', () => {
    const route = resampleRoute([CITY_COORDS.bc, CITY_COORDS.floripa], 500);
    expect(pointAlong(route, -5)).toEqual(route[0]);
    expect(pointAlong(route, 1e9)).toEqual(route[route.length - 1]);
    const total = pathLength(route);
    const mid = pointAlong(route, total / 2);
    // o ponto médio de uma reta fica a metade do caminho do início
    expect(haversine(mid, route[0])).toBeGreaterThan(total / 2 - 500);
    expect(haversine(mid, route[0])).toBeLessThan(total / 2 + 500);
  });

  it('fitBounds enquadra os pontos na viewport', () => {
    const pts = [CITY_COORDS.jaragua, CITY_COORDS.floripa];
    const b = { minLat: -27.5954, maxLat: -26.4858, minLng: -49.0665, maxLng: -48.548 };
    const { zoom } = fitBounds(b, 390, 600, 40);
    const nw = project({ lat: b.maxLat, lng: b.minLng }, zoom);
    const se = project({ lat: b.minLat, lng: b.maxLng }, zoom);
    expect(se.x - nw.x).toBeLessThanOrEqual(390);
    expect(se.y - nw.y).toBeLessThanOrEqual(600);
    expect(pts.length).toBe(2);
  });
});

describe('rota de demonstração Jaraguá do Sul → Balneário Camboriú', () => {
  const waypoints = concatRoutes(ROADS.jaraguaBlumenau, ROADS.blumenauItajai, ROADS.itajaiBc);

  it('fecha em ~128 km (como no exemplo do produto)', () => {
    const route = buildRoute(waypoints, { seed: 7, targetLengthM: 128_000 });
    const km = pathLength(route) / 1000;
    expect(km).toBeGreaterThan(126);
    expect(km).toBeLessThan(130);
  });

  it('começa em Jaraguá e termina em BC', () => {
    const route = buildRoute(waypoints, { seed: 7, targetLengthM: 128_000 });
    expect(haversine(route[0], CITY_COORDS.jaragua)).toBeLessThan(10);
    expect(haversine(route[route.length - 1], CITY_COORDS.bc)).toBeLessThan(10);
  });
});
