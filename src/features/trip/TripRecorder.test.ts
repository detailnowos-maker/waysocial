import { TripRecorder, MAX_ACCURACY_M, STOP_AFTER_MS } from './TripRecorder';
import { SimulatedLocationSource, simulatedRoutePresets, type Fix } from './locationSources';
import { haversine, pathLength } from '@/lib/geo';

const T0 = Date.UTC(2026, 9, 8, 12, 0, 0);

function fix(i: number, lat: number, lng: number, extra: Partial<Fix> = {}): Fix {
  return { lat, lng, t: T0 + i * 10_000, accuracy: 5, speed: 10, ...extra };
}

describe('TripRecorder', () => {
  it('soma distância e duração', () => {
    const batches: unknown[] = [];
    const rec = new TripRecorder(T0, (b) => void batches.push(b));
    // ~111 m por 0.001° de latitude
    for (let i = 0; i <= 10; i++) rec.push(fix(i, -26.0 - i * 0.001, -48.8));
    const snap = rec.snapshot(T0 + 100_000);
    expect(snap.distanceM).toBeGreaterThan(1050);
    expect(snap.distanceM).toBeLessThan(1170);
    expect(snap.durationS).toBe(100);
    expect(snap.stopCount).toBe(0);
  });

  it('descarta leituras imprecisas e fora de ordem', () => {
    const rec = new TripRecorder(T0, () => undefined);
    expect(rec.push(fix(1, -26, -48.8, { accuracy: MAX_ACCURACY_M + 1 }))).toBeNull();
    expect(rec.push(fix(2, -26, -48.8))).not.toBeNull();
    expect(rec.push({ ...fix(1, -26.01, -48.8) })).toBeNull(); // t anterior
  });

  it('ignora micro-movimentos (ruído parado)', () => {
    const rec = new TripRecorder(T0, () => undefined);
    rec.push(fix(1, -26, -48.8));
    expect(rec.push(fix(2, -26.00003, -48.8))).toBeNull(); // ~3 m
    expect(rec.snapshot(T0 + 20_000).points).toHaveLength(1);
  });

  it('detecta parada depois de ficar parado o tempo mínimo — uma vez por episódio', () => {
    const rec = new TripRecorder(T0, () => undefined);
    rec.push({ lat: -26, lng: -48.8, t: T0 + 1000, accuracy: 5 });
    let stops = 0;
    for (let s = 10; s <= 400; s += 10) {
      const p = rec.push({ lat: -26.00001, lng: -48.8, t: T0 + 1000 + s * 1000, accuracy: 5 });
      if (p?.kind === 'stop') stops += 1;
    }
    expect(stops).toBe(1);
    expect(rec.snapshot(T0 + 500_000).stopCount).toBe(1);
    // voltou a andar e parou de novo → segundo episódio
    rec.push({ lat: -26.01, lng: -48.8, t: T0 + 500_000, accuracy: 5 });
    let second = 0;
    for (let s = 10; s <= STOP_AFTER_MS / 1000 + 20; s += 10) {
      if (rec.push({ lat: -26.01001, lng: -48.8, t: T0 + 500_000 + s * 1000, accuracy: 5 })?.kind === 'stop') second += 1;
    }
    expect(second).toBe(1);
    expect(rec.snapshot(T0 + 900_000).stopCount).toBe(2);
  });

  it('parada manual conta e entra no trajeto', () => {
    const rec = new TripRecorder(T0, () => undefined);
    rec.push(fix(1, -26, -48.8));
    rec.push(fix(2, -26.01, -48.8));
    const p = rec.markStop(fix(3, -26.01, -48.8));
    expect(p?.kind).toBe('stop');
    expect(rec.snapshot(T0 + 30_000).stopCount).toBe(1);
  });

  it('entrega pontos em lotes e ao final', async () => {
    const batches: number[] = [];
    const rec = new TripRecorder(T0, (b) => void batches.push(b.length));
    for (let i = 1; i <= 20; i++) rec.push(fix(i, -26 - i * 0.002, -48.8));
    await rec.flush();
    expect(batches.reduce((a, b) => a + b, 0)).toBe(20);
    expect(batches[0]).toBe(8);
  });

  it('retoma a partir de pontos já gravados', () => {
    const rec = new TripRecorder(T0, () => undefined);
    for (let i = 1; i <= 5; i++) rec.push(fix(i, -26 - i * 0.002, -48.8));
    const saved = rec.snapshot(T0 + 60_000).points;
    const resumed = new TripRecorder(T0, () => undefined, saved);
    expect(resumed.snapshot(T0 + 60_000).distanceM).toBeCloseTo(rec.snapshot(T0 + 60_000).distanceM, 3);
    expect(resumed.push(fix(2, -26.0, -48.8))).toBeNull(); // passado
  });
});

describe('SimulatedLocationSource + TripRecorder', () => {
  it('percorre a rota de exemplo: ~128 km, 2 paradas, relógio virtual', async () => {
    jest.useFakeTimers();
    const preset = simulatedRoutePresets()[0];
    const startMs = T0;
    const source = new SimulatedLocationSource(preset.route, { startVirtualMs: startMs, timeScale: 60, tickMs: 1000 });
    const rec = new TripRecorder(startMs, () => undefined);
    await source.start((f) => rec.push(f));
    for (let i = 0; i < 400 && !source.finished; i++) jest.advanceTimersByTime(1000);
    jest.useRealTimers();

    expect(source.finished).toBe(true);
    const snap = rec.snapshot(source.now());
    const routeLen = pathLength(preset.route);
    expect(snap.distanceM / routeLen).toBeGreaterThan(0.93);
    expect(snap.distanceM / routeLen).toBeLessThan(1.02);
    expect(snap.stopCount).toBe(2);
    // 128 km a ~80 km/h + 15 min de paradas ≈ 1h45 — virtual
    expect(snap.durationS / 60).toBeGreaterThan(90);
    expect(snap.durationS / 60).toBeLessThan(130);
    expect(haversine(snap.last!, preset.route[preset.route.length - 1])).toBeLessThan(2500);
  });
});
