/**
 * Geometria geográfica pura (sem dependência de React/Expo) — testável em Node.
 * Distâncias em metros, ângulos em graus.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const EARTH_RADIUS_M = 6371008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function pathLength(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversine(points[i - 1], points[i]);
  return total;
}

export function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function lerp(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Desloca um ponto `meters` metros na direção `bearingDeg`. */
export function offsetPoint(p: LatLng, meters: number, bearingDeg: number): LatLng {
  const d = meters / EARTH_RADIUS_M;
  const br = toRad(bearingDeg);
  const lat1 = toRad(p.lat);
  const lng1 = toRad(p.lng);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
  const lng2 =
    lng1 +
    Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: toDeg(lat2), lng: toDeg(lng2) };
}

/**
 * Arredonda coordenadas para reduzir a precisão (≈1,1 km com 2 casas).
 * Usado quando o usuário escolhe compartilhar só a "região" onde está.
 */
export function approximate(p: LatLng, decimals = 2): LatLng {
  const f = 10 ** decimals;
  return { lat: Math.round(p.lat * f) / f, lng: Math.round(p.lng * f) / f };
}

export function boundsOf(points: LatLng[]): Bounds | null {
  if (points.length === 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

export function centerOf(b: Bounds): LatLng {
  return { lat: (b.minLat + b.maxLat) / 2, lng: (b.minLng + b.maxLng) / 2 };
}

/** Reamostra uma polilinha em passos regulares de `stepM` metros (inclui o ponto final). */
export function resampleRoute(waypoints: LatLng[], stepM: number): LatLng[] {
  if (waypoints.length < 2) return [...waypoints];
  const out: LatLng[] = [waypoints[0]];
  let carry = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    const segLen = haversine(a, b);
    if (segLen === 0) continue;
    let dist = stepM - carry;
    while (dist <= segLen) {
      out.push(lerp(a, b, dist / segLen));
      dist += stepM;
    }
    carry = segLen - (dist - stepM);
  }
  const last = waypoints[waypoints.length - 1];
  const tail = out[out.length - 1];
  if (tail.lat !== last.lat || tail.lng !== last.lng) out.push(last);
  return out;
}

/** Posição ao longo da polilinha a `distanceM` metros do início (satura nas pontas). */
export function pointAlong(route: LatLng[], distanceM: number): LatLng {
  if (route.length === 0) throw new Error('route vazia');
  if (distanceM <= 0) return route[0];
  let acc = 0;
  for (let i = 1; i < route.length; i++) {
    const seg = haversine(route[i - 1], route[i]);
    if (acc + seg >= distanceM) return lerp(route[i - 1], route[i], seg === 0 ? 0 : (distanceM - acc) / seg);
    acc += seg;
  }
  return route[route.length - 1];
}

export function nearest<T extends LatLng>(
  from: LatLng,
  items: readonly T[],
): { item: T; distanceM: number } | null {
  let best: { item: T; distanceM: number } | null = null;
  for (const item of items) {
    const d = haversine(from, item);
    if (!best || d < best.distanceM) best = { item, distanceM: d };
  }
  return best;
}

// --- Web Mercator (EPSG:3857) — base comum a Mapbox, MapLibre, OSM, Google ---------------

export const TILE_SIZE = 256;
const MAX_LAT = 85.0511287798;

/** Coordenada "de mundo" em pixels para um zoom (fracionário) dado. */
export function project(p: LatLng, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom;
  const lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, p.lat));
  const x = ((p.lng + 180) / 360) * scale;
  const sin = Math.sin(toRad(lat));
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

export function unproject(x: number, y: number, zoom: number): LatLng {
  const scale = TILE_SIZE * 2 ** zoom;
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = toDeg(Math.atan(Math.sinh(n)));
  return { lat, lng };
}

/** Menor zoom que enquadra `bounds` numa viewport `width`×`height` (com `padding` px). */
export function fitBounds(
  bounds: Bounds,
  width: number,
  height: number,
  padding = 48,
  maxZoom = 16,
): { center: LatLng; zoom: number } {
  const center = centerOf(bounds);
  const availW = Math.max(40, width - padding * 2);
  const availH = Math.max(40, height - padding * 2);
  let zoom = maxZoom;
  for (; zoom > 1; zoom -= 0.25) {
    const nw = project({ lat: bounds.maxLat, lng: bounds.minLng }, zoom);
    const se = project({ lat: bounds.minLat, lng: bounds.maxLng }, zoom);
    if (se.x - nw.x <= availW && se.y - nw.y <= availH) break;
  }
  return { center, zoom };
}

/** Raio aproximado (m) da menor circunferência que contém a viewport. */
export function viewportRadiusM(center: LatLng, zoom: number, width: number, height: number): number {
  const c = project(center, zoom);
  const corner = unproject(c.x + width / 2, c.y + height / 2, zoom);
  return haversine(center, corner);
}

/** Reduz uma polilinha a no máximo `max` pontos (mantém primeiro e último) — para miniaturas. */
export function downsample<T extends LatLng>(points: readonly T[], max = 48): LatLng[] {
  if (points.length <= max) return points.map((p) => ({ lat: p.lat, lng: p.lng }));
  const out: LatLng[] = [];
  for (let i = 0; i < max; i++) {
    const p = points[Math.round((i * (points.length - 1)) / (max - 1))];
    out.push({ lat: p.lat, lng: p.lng });
  }
  return out;
}
