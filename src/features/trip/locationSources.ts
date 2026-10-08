import * as Location from 'expo-location';

import { type LatLng, haversine, pathLength, pointAlong, bearing } from '@/lib/geo';
import { CITY_COORDS, ROADS, buildRoute, concatRoutes, reverseRoute } from '@/lib/demoGeography';

/** Uma leitura de posição, com relógio próprio (`t`, em ms) — o relógio pode ser virtual na simulação. */
export interface Fix {
  lat: number;
  lng: number;
  t: number;
  speed?: number | null;
  accuracy?: number | null;
  /** Rumo em graus (0 = norte), quando conhecido. */
  heading?: number | null;
}

/**
 * Fonte de posição da viagem. O app grava a viagem a partir desta interface, então
 * GPS real e simulação passam exatamente pelo mesmo caminho (recorder → repositório).
 */
export interface LocationSource {
  readonly kind: 'device' | 'simulated';
  /** Relógio da fonte em ms (relógio real no GPS; virtual na simulação). */
  now(): number;
  start(onFix: (fix: Fix) => void, onError: (error: Error) => void): Promise<void>;
  stop(): void;
}

// --- GPS do aparelho (expo-location, em primeiro plano) ---------------------------------------------

export class DeviceLocationSource implements LocationSource {
  readonly kind = 'device' as const;
  private sub: Location.LocationSubscription | null = null;

  now() {
    return Date.now();
  }

  async start(onFix: (fix: Fix) => void, onError: (e: Error) => void): Promise<void> {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      onError(new Error('Permissão de localização negada. Ative-a nos ajustes para registrar a viagem.'));
      return;
    }
    this.sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 8 },
      (loc) =>
        onFix({
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          t: loc.timestamp,
          speed: loc.coords.speed,
          accuracy: loc.coords.accuracy,
        }),
      (message) => onError(new Error(message)),
    );
  }

  stop() {
    this.sub?.remove();
    this.sub = null;
  }
}

/** Posição única do aparelho; `null` se negada/indisponível (o app cai no modo demonstração). */
export async function getDevicePosition(): Promise<LatLng | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

/** Como `getDevicePosition`, mas NUNCA abre o pedido de permissão: só lê se o usuário já autorizou antes. */
export async function getDevicePositionIfPermitted(): Promise<LatLng | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

// --- Simulação (modo demonstração) -----------------------------------------------------------------

export interface SimulatedRoutePreset {
  id: string;
  label: string;
  origin: string;
  destination: string;
  route: LatLng[];
}

/** Espaçamento entre leituras simuladas (m). */
const SIM_FIX_SPACING_M = 200;

let presets: SimulatedRoutePreset[] | null = null;

/** Rotas de exemplo para a simulação — viaja pelas "estradas" do mapa de demonstração. */
export function simulatedRoutePresets(): SimulatedRoutePreset[] {
  presets ??= [
    {
      id: 'jaragua-bc',
      label: 'Jaraguá do Sul → Balneário Camboriú',
      origin: 'Jaraguá do Sul',
      destination: 'Balneário Camboriú',
      route: buildRoute(concatRoutes(ROADS.jaraguaBlumenau, ROADS.blumenauItajai, ROADS.itajaiBc), { seed: 7, targetLengthM: 128_000 }),
    },
    {
      id: 'bc-floripa',
      label: 'Balneário Camboriú → Florianópolis',
      origin: 'Balneário Camboriú',
      destination: 'Florianópolis',
      route: buildRoute(ROADS.bcFloripa, { seed: 13 }),
    },
    {
      id: 'curitiba-joinville',
      label: 'Curitiba → Joinville',
      origin: 'Curitiba',
      destination: 'Joinville',
      route: buildRoute(ROADS.curitibaJoinville, { seed: 5 }),
    },
    {
      id: 'joinville-jaragua',
      label: 'Joinville → Jaraguá do Sul',
      origin: 'Joinville',
      destination: 'Jaraguá do Sul',
      route: buildRoute(reverseRoute(ROADS.jaraguaJoinville), { seed: 9 }),
    },
  ];
  return presets;
}

export interface SimulationOptions {
  /** Velocidade de cruzeiro em m/s (padrão ≈ 80 km/h). */
  speedMs?: number;
  /** Quantos segundos "virtuais" passam por segundo real. */
  timeScale?: number;
  /** Intervalo real entre leituras. */
  tickMs?: number;
  /** Distância já percorrida (para retomar). */
  startDistanceM?: number;
  /** Instante virtual inicial (ms). */
  startVirtualMs?: number;
  /** Paradas simuladas: fração da rota e duração virtual (s). */
  dwells?: { frac: number; durS: number }[];
}

/**
 * Anda sozinho por uma rota. Com `timeScale = 60`, cada segundo real equivale a 1 minuto de viagem,
 * então 128 km levam ~1,5 min reais — dá para ver a viagem inteira sem sair do sofá.
 */
export class SimulatedLocationSource implements LocationSource {
  readonly kind = 'simulated' as const;
  private virtualMs: number;
  private distanceM: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private dwellLeftS = 0;
  private doneDwells = new Set<number>();
  private readonly total: number;
  private readonly speedMs: number;
  private readonly timeScale: number;
  private readonly tickMs: number;
  private readonly dwells: { frac: number; durS: number }[];
  finished = false;

  constructor(
    private readonly route: LatLng[],
    opts: SimulationOptions = {},
  ) {
    this.speedMs = opts.speedMs ?? 22;
    this.timeScale = opts.timeScale ?? 60;
    this.tickMs = opts.tickMs ?? 1000;
    this.distanceM = opts.startDistanceM ?? 0;
    this.virtualMs = opts.startVirtualMs ?? Date.now();
    this.total = pathLength(route);
    this.dwells = opts.dwells ?? [
      { frac: 0.38, durS: 9 * 60 },
      { frac: 0.72, durS: 6 * 60 },
    ];
    for (const [i, d] of this.dwells.entries()) if (this.distanceM / this.total > d.frac) this.doneDwells.add(i);
  }

  now() {
    return this.virtualMs;
  }

  async start(onFix: (fix: Fix) => void): Promise<void> {
    const emitAt = (distanceM: number, tMs: number, moving: boolean) => {
      const p = pointAlong(this.route, distanceM);
      const ahead = pointAlong(this.route, Math.min(this.total, distanceM + 50));
      onFix({ lat: p.lat, lng: p.lng, t: tMs, speed: moving ? this.speedMs : 0, accuracy: 6, heading: bearing(p, ahead) });
    };
    emitAt(this.distanceM, this.virtualMs, false);
    this.timer = setInterval(() => {
      const dt = this.timeScale; // segundos virtuais por tick
      const tickStartMs = this.virtualMs;
      this.virtualMs += dt * 1000;
      if (this.dwellLeftS > 0) {
        this.dwellLeftS -= dt;
        emitAt(this.distanceM, this.virtualMs, false);
      } else {
        const from = this.distanceM;
        const to = Math.min(this.total, from + this.speedMs * dt);
        // um GPS de verdade lê várias vezes por minuto; sem isso os atalhos entre leituras encurtam as curvas
        const steps = Math.max(1, Math.ceil((to - from) / SIM_FIX_SPACING_M));
        for (let k = 1; k <= steps; k++) {
          emitAt(from + ((to - from) * k) / steps, tickStartMs + ((this.virtualMs - tickStartMs) * k) / steps, true);
        }
        this.distanceM = to;
        for (const [i, d] of this.dwells.entries()) {
          if (!this.doneDwells.has(i) && this.distanceM / this.total >= d.frac) {
            this.doneDwells.add(i);
            this.dwellLeftS = d.durS;
          }
        }
        if (to >= this.total) this.finished = true;
      }
      if (this.finished) this.stop();
    }, this.tickMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export function nearestRouteDistance(route: LatLng[], point: LatLng): number {
  let best = Infinity;
  let bestAlong = 0;
  let acc = 0;
  for (let i = 0; i < route.length; i++) {
    if (i > 0) acc += haversine(route[i - 1], route[i]);
    const d = haversine(route[i], point);
    if (d < best) {
      best = d;
      bestAlong = acc;
    }
  }
  return bestAlong;
}

export const DEMO_DEFAULT_LOCATION: LatLng = CITY_COORDS.jaragua;
