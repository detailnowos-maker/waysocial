import type { AchievementDef, AchievementId, AchievementProgress, ActivityMetrics } from './types';

/**
 * Catálogo de conquistas. A tabela `achievements` do Supabase carrega o mesmo catálogo
 * (supabase/migrations/*_seed_catalog.sql) — `id` é o slug estável.
 */
export const ACHIEVEMENT_CATALOG: readonly AchievementDef[] = [
  { id: 'first_post', title: 'Primeiro registro', description: 'Publique sua primeira foto.', emoji: '📸', goal: 1 },
  { id: 'first_place', title: 'Primeiro lugar visitado', description: 'Publique em um lugar pela primeira vez.', emoji: '🏆', goal: 1 },
  { id: 'first_trip', title: 'Primeira viagem', description: 'Finalize sua primeira viagem.', emoji: '🚗', goal: 1 },
  { id: 'ten_places_photographed', title: '10 lugares fotografados', description: 'Publique em 10 lugares diferentes.', emoji: '📍', goal: 10 },
  { id: 'five_cities', title: '5 cidades visitadas', description: 'Publique em 5 cidades diferentes.', emoji: '🌎', goal: 5 },
  { id: 'streak_7', title: '7 dias publicando', description: 'Publique 7 dias seguidos.', emoji: '🔥', goal: 7 },
  { id: 'ten_beaches', title: '10 praias visitadas', description: 'Publique em 10 praias diferentes.', emoji: '🏝️', goal: 10 },
];

function progressFor(id: AchievementId, m: ActivityMetrics): number {
  switch (id) {
    case 'first_post':
      return m.postCount;
    case 'first_place':
      return m.distinctPlaces;
    case 'first_trip':
      return m.finishedTrips;
    case 'ten_places_photographed':
      return m.distinctPlaces;
    case 'five_cities':
      return m.distinctCities;
    case 'streak_7':
      return m.currentStreakDays;
    case 'ten_beaches':
      return m.distinctBeaches;
  }
}

/**
 * Avalia o progresso de todas as conquistas. `unlockedAt` guarda o que já foi desbloqueado antes —
 * uma conquista, uma vez ganha, não se perde (ex.: sequência de dias que depois quebra).
 */
export function evaluateAchievements(
  metrics: ActivityMetrics,
  alreadyUnlocked: Readonly<Partial<Record<AchievementId, string>>> = {},
  now: number = Date.now(),
): AchievementProgress[] {
  return ACHIEVEMENT_CATALOG.map((def) => {
    const raw = progressFor(def.id, metrics);
    const previous = alreadyUnlocked[def.id];
    const unlocked = Boolean(previous) || raw >= def.goal;
    return {
      ...def,
      progress: unlocked ? def.goal : Math.min(raw, def.goal),
      unlocked,
      unlockedAt: unlocked ? (previous ?? new Date(now).toISOString()) : null,
    };
  });
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Sequência de dias consecutivos com publicação, contando até hoje (ou até ontem, se hoje ainda não postou). */
export function currentStreakDays(postDates: readonly (string | number | Date)[], now: number = Date.now()): number {
  const days = new Set(postDates.map((d) => dayKey(new Date(d))));
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export interface PostFact {
  createdAt: string;
  placeId?: string | null;
  cityName?: string | null;
  category?: string | null;
}

export function computeActivityMetrics(
  posts: readonly PostFact[],
  finishedTrips: number,
  now: number = Date.now(),
): ActivityMetrics {
  const places = new Set<string>();
  const cities = new Set<string>();
  const beaches = new Set<string>();
  for (const p of posts) {
    if (!p.placeId) continue;
    places.add(p.placeId);
    if (p.cityName) cities.add(p.cityName);
    if (p.category === 'beach') beaches.add(p.placeId);
  }
  return {
    postCount: posts.length,
    distinctPlaces: places.size,
    distinctCities: cities.size,
    distinctBeaches: beaches.size,
    finishedTrips,
    currentStreakDays: currentStreakDays(posts.map((p) => p.createdAt), now),
  };
}
