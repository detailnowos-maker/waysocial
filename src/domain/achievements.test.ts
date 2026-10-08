import { ACHIEVEMENT_CATALOG, computeActivityMetrics, currentStreakDays, evaluateAchievements } from './achievements';

const NOW = new Date(2026, 9, 8, 15, 0, 0).getTime();
const day = (daysAgo: number, hour = 12) => new Date(2026, 9, 8 - daysAgo, hour).toISOString();

describe('sequência de dias', () => {
  it('conta dias consecutivos terminando hoje', () => {
    expect(currentStreakDays([day(0), day(1), day(2)], NOW)).toBe(3);
  });
  it('ainda vale se hoje não publicou mas ontem sim', () => {
    expect(currentStreakDays([day(1), day(2)], NOW)).toBe(2);
  });
  it('quebra com um dia sem publicar', () => {
    expect(currentStreakDays([day(0), day(2), day(3)], NOW)).toBe(1);
    expect(currentStreakDays([day(2), day(3)], NOW)).toBe(0);
  });
  it('várias publicações no mesmo dia contam uma vez', () => {
    expect(currentStreakDays([day(0, 8), day(0, 9), day(0, 20)], NOW)).toBe(1);
  });
});

describe('conquistas', () => {
  const posts = Array.from({ length: 10 }, (_, i) => ({ createdAt: day(i), placeId: `p${i}`, cityName: `c${i % 5}`, category: i < 4 ? 'beach' : 'park' }));
  const metrics = computeActivityMetrics(posts, 1, NOW);

  it('calcula as métricas', () => {
    expect(metrics).toMatchObject({ postCount: 10, distinctPlaces: 10, distinctCities: 5, distinctBeaches: 4, finishedTrips: 1, currentStreakDays: 10 });
  });
  it('desbloqueia o que atingiu a meta e mostra progresso do resto', () => {
    const by = Object.fromEntries(evaluateAchievements(metrics, {}, NOW).map((a) => [a.id, a]));
    expect(by.first_post.unlocked && by.first_place.unlocked && by.first_trip.unlocked).toBe(true);
    expect(by.ten_places_photographed.unlocked).toBe(true);
    expect(by.five_cities.unlocked).toBe(true);
    expect(by.streak_7.unlocked).toBe(true);
    expect(by.ten_beaches.unlocked).toBe(false);
    expect(by.ten_beaches.progress).toBe(4);
  });
  it('conquista ganha não se perde (ex.: sequência que quebra)', () => {
    const broken = { ...metrics, currentStreakDays: 0 };
    const by = Object.fromEntries(evaluateAchievements(broken, { streak_7: '2026-10-01T00:00:00.000Z' }, NOW).map((a) => [a.id, a]));
    expect(by.streak_7.unlocked).toBe(true);
    expect(by.streak_7.unlockedAt).toBe('2026-10-01T00:00:00.000Z');
  });
  it('o catálogo tem as 6 conquistas pedidas + "primeiro registro"', () => {
    expect(ACHIEVEMENT_CATALOG.map((a) => a.id)).toEqual(['first_post', 'first_place', 'first_trip', 'ten_places_photographed', 'five_cities', 'streak_7', 'ten_beaches']);
  });
});
