import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { FinishTripInput, Media, TripDetail, TripPoint, TripVisibility } from '@/domain/types';
import {
  DeviceLocationSource,
  type Fix,
  type LocationSource,
  SimulatedLocationSource,
  getDevicePosition,
  nearestRouteDistance,
  simulatedRoutePresets,
} from '@/features/trip/locationSources';
import { TripRecorder } from '@/features/trip/TripRecorder';
import type { LatLng } from '@/lib/geo';

import { useServices, useSession } from './ServicesProvider';

/** Quantos segundos de viagem passam por segundo real no modo simulado. */
export const SIM_TIME_SCALE = 60;

export interface StartTripOptions {
  plannedDestination?: string | null;
  visibility: TripVisibility;
  shareLive: boolean;
  /** `null` = usar o GPS do aparelho; senão, ID de uma rota simulada. */
  simulatePresetId: string | null;
}

interface TripSessionValue {
  /** Viagem ativa (null se não houver). */
  trip: TripDetail | null;
  elapsedS: number;
  distanceM: number;
  stopCount: number;
  position: LatLng | null;
  /** Trajeto gravado até agora. */
  points: TripPoint[];
  /** Rumo em graus (0 = norte) quando conhecido. */
  heading: number | null;
  /** Rota simulada chegou ao fim: hora de finalizar. */
  arrived: boolean;
  error: string | null;
  simulated: boolean;
  start: (opts: StartTripOptions) => Promise<TripDetail>;
  addMoment: (media: Omit<Media, 'id'>, opts?: { caption?: string; publishToFeed?: boolean }) => Promise<void>;
  markStop: () => Promise<void>;
  setShareLive: (shareLive: boolean) => Promise<void>;
  finish: () => Promise<TripDetail>;
  cancel: () => Promise<void>;
}

const noop = async () => {
  throw new Error('TripSession indisponível');
};

const TripSessionContext = createContext<TripSessionValue>({
  trip: null,
  elapsedS: 0,
  distanceM: 0,
  stopCount: 0,
  position: null,
  points: [],
  heading: null,
  arrived: false,
  error: null,
  simulated: false,
  start: noop,
  addMoment: noop,
  markStop: noop,
  setShareLive: noop,
  finish: noop,
  cancel: noop,
});

export const useTripSession = () => useContext(TripSessionContext);

/**
 * Mantém a viagem viva no nível do app: continua gravando enquanto o usuário navega por outras telas.
 * (Em primeiro plano. Gravação em segundo plano exige `expo-task-manager` + permissão "sempre" — ver docs/ARCHITECTURE.md.)
 */
export function TripSessionProvider({ children }: { children: ReactNode }) {
  const { repo, ai, geocoder } = useServices();
  const { userId } = useSession();
  const [tripState, setTrip] = useState<TripDetail | null>(null);
  const trip = userId ? tripState : null;
  const [position, setPosition] = useState<LatLng | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [stats, setStats] = useState<{ distanceM: number; stopCount: number; points: TripPoint[] }>({ distanceM: 0, stopCount: 0, points: [] });
  const [elapsedTick, setElapsedS] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorder = useRef<TripRecorder | null>(null);
  const source = useRef<LocationSource | null>(null);
  const startedAtMs = useRef(0);
  const tripRef = useRef<TripDetail | null>(null);
  useEffect(() => {
    tripRef.current = trip;
  });

  const teardown = useCallback(() => {
    source.current?.stop();
    source.current = null;
    recorder.current = null;
  }, []);

  const refreshTrip = useCallback(async () => {
    const t = await repo.getActiveTrip();
    setTrip(t);
    return t;
  }, [repo]);

  const onFix = useCallback((fix: Fix) => {
    const rec = recorder.current;
    if (!rec) return;
    rec.push(fix);
    setPosition({ lat: fix.lat, lng: fix.lng });
    setHeading(fix.heading ?? null);
    const snap = rec.snapshot(source.current?.now() ?? Date.now());
    setStats({ distanceM: snap.distanceM, stopCount: snap.stopCount, points: [...snap.points] });
    const src = source.current;
    if (src instanceof SimulatedLocationSource && src.finished) setArrived(true);
  }, []);

  const attach = useCallback(
    async (detail: TripDetail, src: LocationSource) => {
      startedAtMs.current = new Date(detail.startedAt).getTime();
      recorder.current = new TripRecorder(startedAtMs.current, (batch) => repo.appendTripPoints(detail.id, batch), detail.points);
      const snap = recorder.current.snapshot(src.now());
      setStats({ distanceM: snap.distanceM, stopCount: snap.stopCount, points: [...snap.points] });
      setPosition(detail.points.length ? { lat: detail.points[detail.points.length - 1].lat, lng: detail.points[detail.points.length - 1].lng } : null);
      setArrived(false);
      setError(null);
      source.current = src;
      await src.start(onFix, (e) => setError(e.message));
    },
    [repo, onFix],
  );

  // Restaura uma viagem ativa (app reaberto) ao entrar na conta.
  useEffect(() => {
    if (!userId) {
      teardown();
      return;
    }
    let cancelled = false;
    void (async () => {
      const t = await refreshTrip();
      if (cancelled || !t || source.current) return;
      if (t.simulated) {
        const preset = simulatedRoutePresets().find((p) => p.origin === t.originName) ?? simulatedRoutePresets()[0];
        const last = t.points[t.points.length - 1];
        const along = last ? nearestRouteDistance(preset.route, last) : 0;
        const lastMs = last ? new Date(last.t).getTime() : new Date(t.startedAt).getTime();
        await attach(t, new SimulatedLocationSource(preset.route, { startDistanceM: along, startVirtualMs: lastMs, timeScale: SIM_TIME_SCALE }));
      } else {
        await attach(t, new DeviceLocationSource());
      }
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [userId, refreshTrip, attach, teardown]);

  // mantém `trip` em dia quando o repositório muda (contadores de fotos, compartilhamento...)
  useEffect(() => {
    if (!userId) return;
    return repo.subscribe(() => {
      if (tripRef.current || source.current) void refreshTrip();
    });
  }, [repo, userId, refreshTrip]);

  // cronômetro
  useEffect(() => {
    if (!trip) return;
    const tick = () => setElapsedS(Math.max(0, Math.round(((source.current?.now() ?? Date.now()) - new Date(trip.startedAt).getTime()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [trip?.id, trip?.startedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback<TripSessionValue['start']>(
    async (opts) => {
      if (tripRef.current) throw new Error('Você já tem uma viagem ativa.');
      const preset = opts.simulatePresetId ? simulatedRoutePresets().find((p) => p.id === opts.simulatePresetId) : undefined;
      let origin: LatLng;
      let originName: string;
      if (preset) {
        origin = preset.route[0];
        originName = preset.origin;
      } else {
        const here = await getDevicePosition();
        if (!here) throw new Error('Não conseguimos acessar sua localização. Ative o GPS e a permissão, ou use o modo demonstração.');
        origin = here;
        originName = (await geocoder.reverse(here)).label;
      }
      const detail = await repo.startTrip({
        plannedDestination: opts.plannedDestination?.trim() || (preset ? preset.destination : null),
        visibility: opts.visibility,
        shareLive: opts.shareLive,
        simulated: !!preset,
        origin,
        originName,
      });
      setTrip(detail);
      const src = preset
        ? new SimulatedLocationSource(preset.route, { startVirtualMs: new Date(detail.startedAt).getTime(), timeScale: SIM_TIME_SCALE })
        : new DeviceLocationSource();
      await attach(detail, src);
      return detail;
    },
    [repo, geocoder, attach],
  );

  const addMoment = useCallback<TripSessionValue['addMoment']>(
    async (media, opts = {}) => {
      const t = tripRef.current;
      const here = position ?? (t?.points.length ? t.points[t.points.length - 1] : null);
      if (!t || !here) throw new Error('Aguarde o primeiro sinal de localização.');
      await repo.addTripMoment(t.id, {
        media,
        caption: opts.caption ?? null,
        lat: here.lat,
        lng: here.lng,
        takenAt: new Date(source.current?.now() ?? Date.now()).toISOString(),
        publishToFeed: !!opts.publishToFeed,
      });
      await refreshTrip();
    },
    [repo, position, refreshTrip],
  );

  const markStop = useCallback(async () => {
    const rec = recorder.current;
    const here = position;
    if (!rec || !here) throw new Error('Aguarde o primeiro sinal de localização.');
    rec.markStop({ lat: here.lat, lng: here.lng, t: source.current?.now() ?? Date.now(), accuracy: 5 });
    const snap = rec.snapshot(source.current?.now() ?? Date.now());
    setStats({ distanceM: snap.distanceM, stopCount: snap.stopCount, points: [...snap.points] });
    await rec.flush();
  }, [position]);

  const setShareLive = useCallback(
    async (shareLive: boolean) => {
      const t = tripRef.current;
      if (!t) return;
      await repo.setTripShareLive(t.id, shareLive);
      await refreshTrip();
    },
    [repo, refreshTrip],
  );

  const finish = useCallback<TripSessionValue['finish']>(async () => {
    const t = tripRef.current;
    const rec = recorder.current;
    if (!t || !rec) throw new Error('Nenhuma viagem ativa.');
    source.current?.stop();
    await rec.flush();
    const snap = rec.snapshot(source.current?.now() ?? Date.now());
    const last = snap.last ?? { lat: t.lastLat ?? 0, lng: t.lastLng ?? 0 };
    const geo = await geocoder.reverse({ lat: last.lat, lng: last.lng });
    const destinationName = t.plannedDestination || geo.label;
    const fresh = await repo.getTrip(t.id);
    const momentCount = (fresh?.photoCount ?? 0) + (fresh?.videoCount ?? 0);
    const summary = await ai
      .summarizeTrip({ origin: t.originName, destination: destinationName, distanceM: snap.distanceM, durationS: snap.durationS, stopCount: snap.stopCount, momentCount })
      .catch(() => null);
    const input: FinishTripInput = { tripId: t.id, points: [], destinationName, summary, durationS: snap.durationS, distanceM: snap.distanceM };
    const done = await repo.finishTrip(input);
    teardown();
    setTrip(null);
    setPosition(null);
    setStats({ distanceM: 0, stopCount: 0, points: [] });
    setArrived(false);
    return done;
  }, [repo, ai, geocoder, teardown]);

  const cancel = useCallback(async () => {
    const t = tripRef.current;
    teardown();
    if (t) await repo.cancelTrip(t.id);
    setTrip(null);
    setPosition(null);
    setStats({ distanceM: 0, stopCount: 0, points: [] });
    setArrived(false);
  }, [repo, teardown]);

  useEffect(() => () => teardown(), [teardown]);

  const elapsedS = trip ? elapsedTick : 0;
  const value = useMemo<TripSessionValue>(
    () => ({
      trip,
      elapsedS,
      distanceM: stats.distanceM || trip?.distanceM || 0,
      stopCount: Math.max(stats.stopCount, trip?.stopCount ?? 0),
      position,
      points: stats.points,
      heading,
      arrived,
      error,
      simulated: trip?.simulated ?? false,
      start,
      addMoment,
      markStop,
      setShareLive,
      finish,
      cancel,
    }),
    [trip, elapsedS, stats, position, heading, arrived, error, start, addMoment, markStop, setShareLive, finish, cancel],
  );

  return <TripSessionContext.Provider value={value}>{children}</TripSessionContext.Provider>;
}
