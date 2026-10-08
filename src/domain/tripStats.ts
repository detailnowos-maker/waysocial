import { haversine } from '@/lib/geo';

import type { TripMoment, TripPoint } from './types';

/** Velocidade acima da qual um salto entre dois pontos é tratado como ruído de GPS (≈ 250 km/h). */
const MAX_PLAUSIBLE_SPEED_MS = 70;

export interface TripStats {
  distanceM: number;
  durationS: number;
  stopCount: number;
  photoCount: number;
  videoCount: number;
}

export function segmentDistance(a: TripPoint, b: TripPoint): number {
  const d = haversine(a, b);
  const dt = (new Date(b.t).getTime() - new Date(a.t).getTime()) / 1000;
  if (dt > 0 && d / dt > MAX_PLAUSIBLE_SPEED_MS) return 0;
  return d;
}

export function totalDistance(points: readonly TripPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += segmentDistance(points[i - 1], points[i]);
  return total;
}

export function computeTripStats(
  points: readonly TripPoint[],
  moments: readonly Pick<TripMoment, 'media'>[],
  startedAt: string,
  endedAt: string | null,
): TripStats {
  const last = points[points.length - 1];
  const endMs = endedAt ? new Date(endedAt).getTime() : last ? new Date(last.t).getTime() : new Date(startedAt).getTime();
  return {
    distanceM: totalDistance(points),
    durationS: Math.max(0, Math.round((endMs - new Date(startedAt).getTime()) / 1000)),
    stopCount: points.filter((p) => p.kind === 'stop').length,
    photoCount: moments.filter((m) => m.media.type === 'image').length,
    videoCount: moments.filter((m) => m.media.type === 'video').length,
  };
}

export function defaultTripTitle(origin: string, destination?: string | null): string {
  return destination && destination !== origin ? `${origin} → ${destination}` : `Viagem a partir de ${origin}`;
}
