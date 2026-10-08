import { segmentDistance } from '@/domain/tripStats';
import type { TripPoint } from '@/domain/types';
import { haversine } from '@/lib/geo';

import type { Fix } from './locationSources';

/** Leituras piores que isto (metros) são descartadas — GPS "pulando" suja o trajeto. */
export const MAX_ACCURACY_M = 60;
/** Movimento menor que isto não vira ponto novo (economiza bateria e armazenamento). */
export const MIN_MOVE_M = 12;
/** Parado por este tempo (ms) dentro de `STOP_RADIUS_M` = uma parada. */
export const STOP_AFTER_MS = 3 * 60_000;
export const STOP_RADIUS_M = 35;
/** Quantos pontos acumulam antes de ir para o armazenamento. */
const FLUSH_EVERY = 8;

export interface RecorderSnapshot {
  distanceM: number;
  durationS: number;
  stopCount: number;
  points: TripPoint[];
  last: TripPoint | null;
}

/**
 * Transforma leituras de posição (`Fix`) em trajeto: filtra ruído, soma distância,
 * detecta paradas e entrega os pontos em lotes. Não conhece React nem Supabase.
 */
export class TripRecorder {
  private points: TripPoint[];
  private pending: TripPoint[] = [];
  private distanceM = 0;
  private stopCount = 0;
  private anchor: { lat: number; lng: number; since: number; flagged: boolean } | null = null;
  private lastAcceptedT = 0;

  constructor(
    private readonly startedAtMs: number,
    private readonly persist: (batch: TripPoint[]) => void | Promise<void>,
    initialPoints: TripPoint[] = [],
  ) {
    this.points = [...initialPoints];
    this.distanceM = initialPoints.reduce((acc, p, i) => (i === 0 ? 0 : acc + segmentDistance(initialPoints[i - 1], p)), 0);
    this.stopCount = initialPoints.filter((p) => p.kind === 'stop').length;
    const last = initialPoints[initialPoints.length - 1];
    if (last) {
      this.lastAcceptedT = new Date(last.t).getTime();
      this.anchor = { lat: last.lat, lng: last.lng, since: this.lastAcceptedT, flagged: false };
    }
  }

  push(fix: Fix): TripPoint | null {
    if (fix.accuracy != null && fix.accuracy > MAX_ACCURACY_M) return null;
    if (fix.t <= this.lastAcceptedT) return null;
    const last = this.points[this.points.length - 1];

    // Âncora de parada: enquanto a pessoa permanece perto do mesmo ponto, o relógio corre.
    if (!this.anchor || haversine(this.anchor, fix) > STOP_RADIUS_M) {
      this.anchor = { lat: fix.lat, lng: fix.lng, since: fix.t, flagged: false };
    } else if (!this.anchor.flagged && fix.t - this.anchor.since >= STOP_AFTER_MS) {
      this.anchor.flagged = true;
      return this.accept(fix, 'stop');
    }

    if (last && haversine(last, fix) < MIN_MOVE_M) return null;
    return this.accept(fix, 'track');
  }

  /** Marca uma parada manualmente na última posição conhecida. */
  markStop(at: Fix): TripPoint | null {
    if (at.t <= this.lastAcceptedT) at = { ...at, t: this.lastAcceptedT + 1 };
    if (this.anchor) this.anchor.flagged = true;
    return this.accept(at, 'stop');
  }

  private accept(fix: Fix, kind: TripPoint['kind']): TripPoint {
    const point: TripPoint = {
      lat: fix.lat,
      lng: fix.lng,
      t: new Date(fix.t).toISOString(),
      speed: fix.speed ?? null,
      accuracy: fix.accuracy ?? null,
      kind,
    };
    const last = this.points[this.points.length - 1];
    if (last) this.distanceM += segmentDistance(last, point);
    if (kind === 'stop') this.stopCount += 1;
    this.points.push(point);
    this.pending.push(point);
    this.lastAcceptedT = fix.t;
    if (this.pending.length >= FLUSH_EVERY) void this.flush();
    return point;
  }

  async flush(): Promise<void> {
    if (this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];
    await this.persist(batch);
  }

  /** Pontos que ainda não foram entregues ao `persist`. */
  drainPending(): TripPoint[] {
    const batch = this.pending;
    this.pending = [];
    return batch;
  }

  snapshot(nowMs: number): RecorderSnapshot {
    return {
      distanceM: this.distanceM,
      durationS: Math.max(0, Math.round((nowMs - this.startedAtMs) / 1000)),
      stopCount: this.stopCount,
      points: this.points,
      last: this.points[this.points.length - 1] ?? null,
    };
  }
}
