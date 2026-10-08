/**
 * Geografia ILUSTRATIVA do litoral/planalto norte de Santa Catarina e Curitiba.
 *
 * Usada em dois lugares:
 *  1. pelo mapa de demonstração (`DemoBasemap`), para desenhar mar, terra e estradas sem depender de provedor;
 *  2. pelos dados de demonstração, para traçar rotas de viagem plausíveis.
 *
 * As coordenadas são aproximadas e simplificadas de propósito — NÃO são dados cartográficos.
 * Em produção o mapa vem de um provedor real (Mapbox, MapLibre, OSM...) e este arquivo some do caminho crítico.
 */
import { type LatLng, haversine, offsetPoint, bearing, pathLength, resampleRoute } from './geo';
import { mulberry32 } from './random';

export const CITY_COORDS = {
  jaragua: { lat: -26.4858, lng: -49.0665 },
  joinville: { lat: -26.3045, lng: -48.8487 },
  blumenau: { lat: -26.9194, lng: -49.0661 },
  bc: { lat: -26.9906, lng: -48.6348 },
  floripa: { lat: -27.5954, lng: -48.548 },
  curitiba: { lat: -25.4284, lng: -49.2733 },
} as const satisfies Record<string, LatLng>;

/** Costa continental (norte→sul), lado do mar a leste. Fecha pelo oeste no `DemoBasemap`. */
export const MAINLAND_COAST: LatLng[] = [
  { lat: -23.2, lng: -45.9 },
  { lat: -24.0, lng: -46.9 },
  { lat: -24.7, lng: -47.85 },
  { lat: -25.05, lng: -48.15 },
  { lat: -25.3, lng: -48.5 },
  { lat: -25.5, lng: -48.52 },
  { lat: -25.8, lng: -48.55 },
  { lat: -25.9, lng: -48.57 },
  { lat: -26.12, lng: -48.62 },
  { lat: -26.25, lng: -48.57 },
  { lat: -26.45, lng: -48.6 },
  { lat: -26.63, lng: -48.67 },
  { lat: -26.77, lng: -48.62 },
  { lat: -26.89, lng: -48.62 },
  { lat: -26.94, lng: -48.62 },
  { lat: -26.99, lng: -48.615 },
  { lat: -27.09, lng: -48.595 },
  { lat: -27.13, lng: -48.55 },
  { lat: -27.16, lng: -48.5 },
  { lat: -27.2, lng: -48.52 },
  { lat: -27.25, lng: -48.6 },
  { lat: -27.3, lng: -48.55 },
  { lat: -27.4, lng: -48.57 },
  { lat: -27.48, lng: -48.63 },
  { lat: -27.58, lng: -48.62 },
  { lat: -27.66, lng: -48.68 },
  { lat: -27.8, lng: -48.65 },
  { lat: -27.88, lng: -48.62 },
  { lat: -28.03, lng: -48.62 },
  { lat: -28.25, lng: -48.68 },
  { lat: -28.5, lng: -48.78 },
];

/** Ilha de Santa Catarina (polígono fechado). */
export const ISLAND_COAST: LatLng[] = [
  { lat: -27.38, lng: -48.46 },
  { lat: -27.4, lng: -48.4 },
  { lat: -27.45, lng: -48.37 },
  { lat: -27.5, lng: -48.38 },
  { lat: -27.57, lng: -48.42 },
  { lat: -27.63, lng: -48.45 },
  { lat: -27.69, lng: -48.47 },
  { lat: -27.76, lng: -48.5 },
  { lat: -27.83, lng: -48.55 },
  { lat: -27.78, lng: -48.57 },
  { lat: -27.7, lng: -48.57 },
  { lat: -27.63, lng: -48.55 },
  { lat: -27.58, lng: -48.55 },
  { lat: -27.52, lng: -48.52 },
  { lat: -27.46, lng: -48.52 },
  { lat: -27.42, lng: -48.49 },
];

/** Cidades menores (só rótulo no mapa de demonstração). */
export const TOWNS: { name: string; at: LatLng }[] = [
  { name: 'Guaramirim', at: { lat: -26.473, lng: -48.99 } },
  { name: 'Schroeder', at: { lat: -26.41, lng: -49.07 } },
  { name: 'Araquari', at: { lat: -26.37, lng: -48.72 } },
  { name: 'Barra Velha', at: { lat: -26.63, lng: -48.69 } },
  { name: 'Piçarras', at: { lat: -26.76, lng: -48.67 } },
  { name: 'Gaspar', at: { lat: -26.93, lng: -48.96 } },
  { name: 'Ilhota', at: { lat: -26.9, lng: -48.83 } },
  { name: 'Itajaí', at: { lat: -26.91, lng: -48.67 } },
  { name: 'Camboriú', at: { lat: -27.02, lng: -48.65 } },
  { name: 'Itapema', at: { lat: -27.09, lng: -48.61 } },
  { name: 'Porto Belo', at: { lat: -27.16, lng: -48.55 } },
  { name: 'Tijucas', at: { lat: -27.24, lng: -48.63 } },
  { name: 'Biguaçu', at: { lat: -27.49, lng: -48.66 } },
  { name: 'Pomerode', at: { lat: -26.74, lng: -49.18 } },
  { name: 'Garuva', at: { lat: -26.03, lng: -48.85 } },
  { name: 'São José dos Pinhais', at: { lat: -25.54, lng: -49.2 } },
];

/** Rio Itajaí-Açu, de Blumenau até a foz. */
export const RIVER_ITAJAI: LatLng[] = [
  { lat: -26.92, lng: -49.07 },
  { lat: -26.93, lng: -48.99 },
  { lat: -26.92, lng: -48.92 },
  { lat: -26.9, lng: -48.83 },
  { lat: -26.91, lng: -48.74 },
  { lat: -26.9, lng: -48.67 },
  { lat: -26.91, lng: -48.62 },
];

/** Rodovias/rotas ilustrativas (waypoints grosseiros). */
export const ROADS = {
  /** BR-101 de Garuva até a Grande Florianópolis. */
  br101: [
    { lat: -26.03, lng: -48.85 },
    { lat: -26.17, lng: -48.85 },
    { lat: -26.3, lng: -48.85 },
    { lat: -26.37, lng: -48.72 },
    { lat: -26.63, lng: -48.7 },
    { lat: -26.76, lng: -48.68 },
    { lat: -26.9, lng: -48.67 },
    { lat: -26.99, lng: -48.655 },
    { lat: -27.09, lng: -48.63 },
    { lat: -27.16, lng: -48.57 },
    { lat: -27.24, lng: -48.64 },
    { lat: -27.38, lng: -48.62 },
    { lat: -27.49, lng: -48.66 },
    { lat: -27.6, lng: -48.64 },
  ],
  /** Curitiba → Garuva (BR-376/BR-277, simplificado). */
  curitibaJoinville: [
    CITY_COORDS.curitiba,
    { lat: -25.52, lng: -49.12 },
    { lat: -25.7, lng: -49.05 },
    { lat: -25.93, lng: -49.02 },
    { lat: -26.03, lng: -48.85 },
    { lat: -26.17, lng: -48.85 },
    CITY_COORDS.joinville,
  ],
  /** Jaraguá do Sul → Joinville (BR-280). */
  jaraguaJoinville: [
    CITY_COORDS.jaragua,
    { lat: -26.47, lng: -48.99 },
    { lat: -26.43, lng: -48.93 },
    { lat: -26.37, lng: -48.89 },
    CITY_COORDS.joinville,
  ],
  /** Jaraguá do Sul → Blumenau. */
  jaraguaBlumenau: [
    CITY_COORDS.jaragua,
    { lat: -26.56, lng: -49.09 },
    { lat: -26.65, lng: -49.04 },
    { lat: -26.75, lng: -49.07 },
    { lat: -26.84, lng: -49.06 },
    CITY_COORDS.blumenau,
  ],
  /** Blumenau → Itajaí (BR-470). */
  blumenauItajai: [
    CITY_COORDS.blumenau,
    { lat: -26.93, lng: -48.96 },
    { lat: -26.9, lng: -48.83 },
    { lat: -26.91, lng: -48.72 },
    { lat: -26.91, lng: -48.67 },
  ],
  /** Itajaí → Balneário Camboriú. */
  itajaiBc: [{ lat: -26.91, lng: -48.67 }, { lat: -26.95, lng: -48.655 }, CITY_COORDS.bc],
  /** BC → Florianópolis pela BR-101. */
  bcFloripa: [
    CITY_COORDS.bc,
    { lat: -27.09, lng: -48.63 },
    { lat: -27.16, lng: -48.57 },
    { lat: -27.24, lng: -48.64 },
    { lat: -27.38, lng: -48.62 },
    { lat: -27.49, lng: -48.66 },
    { lat: -27.58, lng: -48.6 },
    { lat: -27.5954, lng: -48.548 },
  ],
  /** Volta pela ilha (Florianópolis). */
  floripaLoop: [
    { lat: -27.512, lng: -48.513 },
    { lat: -27.55, lng: -48.5 },
    { lat: -27.605, lng: -48.463 },
    { lat: -27.629, lng: -48.449 },
    { lat: -27.676, lng: -48.472 },
    { lat: -27.7, lng: -48.52 },
    { lat: -27.65, lng: -48.545 },
    { lat: -27.5954, lng: -48.548 },
  ],
} satisfies Record<string, LatLng[]>;

export function concatRoutes(...parts: LatLng[][]): LatLng[] {
  const out: LatLng[] = [];
  for (const part of parts) {
    for (const p of part) {
      const last = out[out.length - 1];
      if (!last || haversine(last, p) > 1) out.push(p);
    }
  }
  return out;
}

export function reverseRoute(route: LatLng[]): LatLng[] {
  return [...route].reverse();
}

function wobbleRoute(base: LatLng[], amplitudeM: number, seed: number): LatLng[] {
  const rand = mulberry32(seed);
  const p1 = rand() * Math.PI * 2;
  const p2 = rand() * Math.PI * 2;
  const p3 = rand() * Math.PI * 2;
  return base.map((p, i) => {
    if (i === 0 || i === base.length - 1) return p;
    const heading = bearing(base[i - 1], base[i + 1] ?? base[i]);
    const w = Math.sin(i * 0.09 + p1) * 0.62 + Math.sin(i * 0.21 + p2) * 0.3 + Math.sin(i * 0.8 + p3) * 0.08;
    return offsetPoint(p, w * amplitudeM, heading + 90);
  });
}

/**
 * Transforma waypoints grosseiros numa trilha densa, com curvas de estrada.
 * Se `targetLengthM` for dado, ajusta a amplitude das curvas (bisseção) para que o
 * comprimento final fique próximo do alvo — é assim que a viagem de exemplo
 * Jaraguá do Sul → Balneário Camboriú fecha em ~128 km.
 */
export function buildRoute(
  waypoints: LatLng[],
  opts: { stepM?: number; seed?: number; targetLengthM?: number; amplitudeM?: number } = {},
): LatLng[] {
  const stepM = opts.stepM ?? 250;
  const seed = opts.seed ?? 1;
  const base = resampleRoute(waypoints, stepM);
  if (opts.targetLengthM === undefined) return wobbleRoute(base, opts.amplitudeM ?? 220, seed);

  let lo = 0;
  let hi = 4500;
  let best = base;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const candidate = wobbleRoute(base, mid, seed);
    best = candidate;
    if (pathLength(candidate) < opts.targetLengthM) lo = mid;
    else hi = mid;
  }
  return best;
}
