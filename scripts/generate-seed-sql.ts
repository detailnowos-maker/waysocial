/**
 * Gera supabase/seed.sql a partir do MESMO mundo de demonstração do app (src/data/mock/seed.ts):
 * 5 usuários, 6 cidades, ~35 lugares, ~40 publicações, viagens, comentários, curtidas, notificações.
 *
 *   npm run db:seed-sql
 *
 * Os tempos saem RELATIVOS a now() — o banco "abre vivo" no dia em que o seed rodar.
 * Diferenças conhecidas em relação ao modo mock: viagens "ao vivo" ficam paradas no último ponto,
 * e os números "de fora" (ambient/boost) não existem no SQL — só dados reais das linhas.
 */
import fs from 'node:fs';
import path from 'node:path';

import { DEMO_EMAILS, buildSeed } from '../src/data/mock/seed';
import type { MockDb } from '../src/data/mock/db';
import { downsample } from '../src/lib/geo';

const NOW = Date.parse('2026-10-08T15:00:00-03:00');
const db: MockDb = buildSeed(NOW);

const q = (v: string | null | undefined) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const num = (v: number | null | undefined) => (v == null ? 'null' : String(v));
const bool = (v: boolean) => (v ? 'true' : 'false');
const json = (v: unknown) => (v == null ? 'null' : `${q(JSON.stringify(v))}::jsonb`);
const wid = (id: string | null | undefined) => (id ? `pg_temp.wid(${q(id)})` : 'null');
/** Instante relativo a now(): `now() - interval 'N seconds'`. */
const ts = (iso: string | null | undefined) => {
  if (!iso) return 'null';
  const delta = Math.round((NOW - Date.parse(iso)) / 1000);
  return delta >= 0 ? `now() - interval '${delta} seconds'` : `now() + interval '${-delta} seconds'`;
};

const out: string[] = [];
const emit = (s = '') => out.push(s);
const insert = (table: string, columns: string[], rows: string[][], chunk = 200) => {
  for (let i = 0; i < rows.length; i += chunk) {
    emit(`insert into ${table} (${columns.join(', ')}) values`);
    emit(rows.slice(i, i + chunk).map((r) => `  (${r.join(', ')})`).join(',\n') + ';');
  }
};

emit(`-- =====================================================================================
-- WaySocial · seed de demonstração (GERADO por scripts/generate-seed-sql.ts — não edite à mão)
-- Rode com:  supabase db reset   (aplica migrations + este arquivo)
-- Contas de demonstração: <nome>@waysocial.demo · senha: waysocial
-- =====================================================================================`);
emit(`create or replace function pg_temp.wid(text) returns uuid language sql immutable as $$ select md5('waysocial:' || $1)::uuid $$;`);
emit();

// --- usuários (o trigger handle_new_user cria o perfil) ---------------------------------
emit('-- usuários de demonstração');
for (const p of db.profiles) {
  const email = DEMO_EMAILS[p.id];
  emit(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', ${wid(p.id)}, 'authenticated', 'authenticated', ${q(email)}, extensions.crypt('waysocial', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, ${json({ username: p.username, display_name: p.displayName })}, now(), now(), '', '', '', '');`);
  emit(`insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), ${wid(p.id)}, ${wid(p.id)}::text, jsonb_build_object('sub', ${wid(p.id)}::text, 'email', ${q(email)}), 'email', now(), now(), now());`);
}
emit();
for (const p of db.profiles) {
  emit(`update public.profiles set display_name = ${q(p.displayName)}, bio = ${q(p.bio)}, avatar_seed = ${p.avatarSeed}, is_private = ${bool(p.isPrivate)}, home_city = ${q(p.homeCity)}, default_trip_visibility = ${q(p.defaultTripVisibility)}, share_location_by_default = ${bool(p.shareLocationByDefault)}, created_at = ${ts(p.createdAt)} where id = ${wid(p.id)};`);
}
emit();

// A partir daqui os dados já vêm "prontos" (status de follow, coordenadas, notificações): sem triggers.
emit('set session_replication_role = replica;');
emit();

emit('-- lugares');
const cities = db.places.filter((p) => p.kind === 'city');
const others = db.places.filter((p) => p.kind !== 'city');
const placeCols = ['id', 'kind', 'category', 'name', 'city_name', 'city_id', 'lat', 'lng', 'address', 'description', 'scene', 'rating_base_avg', 'rating_base_count', 'starts_at', 'ends_at'];
const placeRow = (p: MockDb['places'][number]) => [wid(p.id), q(p.kind), q(p.category), q(p.name), q(p.cityName), wid(p.cityId), num(p.lat), num(p.lng), q(p.address), q(p.description), json(p.scene), num(p.baseRatingAvg), String(p.baseRatingCount), ts(p.startsAt), ts(p.endsAt)];
insert('public.locations', placeCols, cities.map(placeRow));
insert('public.locations', placeCols, others.map(placeRow));
emit();

emit('-- publicações e mídia');
insert('public.posts', ['id', 'author_id', 'caption', 'location_id', 'lat', 'lng', 'location_precision', 'trip_id', 'created_at'],
  db.posts.map((p) => [wid(p.id), wid(p.authorId), q(p.caption), wid(p.placeId), num(p.lat), num(p.lng), q(p.precision), wid(p.tripId), ts(p.createdAt)]));
insert('public.post_media', ['id', 'post_id', 'position', 'type', 'url', 'scene', 'width', 'height', 'duration_ms'],
  db.posts.flatMap((p) => p.media.map((m, i) => [wid(m.id), wid(p.id), String(i), q(m.type), q(m.uri ?? null), json(m.scene ?? null), num(m.width), num(m.height), num(m.durationMs)])));
emit();

emit('-- comentários, curtidas, salvos, seguidores, avaliações');
insert('public.comments', ['id', 'post_id', 'author_id', 'body', 'created_at'], db.comments.map((c) => [wid(c.id), wid(c.postId), wid(c.authorId), q(c.text), ts(c.createdAt)]));
insert('public.likes', ['post_id', 'user_id'], db.likes.map((l) => [wid(l.postId), wid(l.userId)]));
insert('public.saved_posts', ['post_id', 'user_id'], db.saves.map((s) => [wid(s.postId), wid(s.userId)]));
insert('public.follows', ['follower_id', 'followee_id', 'status', 'created_at'], db.follows.map((f) => [wid(f.followerId), wid(f.followeeId), q(f.status), ts(f.createdAt)]));
insert('public.place_reviews', ['id', 'location_id', 'user_id', 'stars', 'body', 'created_at'], db.reviews.map((r) => [wid(r.id), wid(r.placeId), wid(r.userId), String(r.stars), q(r.text), ts(r.createdAt)]));
insert('public.saved_places', ['user_id', 'location_id'], db.savedPlaces.map((s) => [wid(s.userId), wid(s.placeId)]));
emit();

emit('-- viagens, trajetos e momentos');
insert('public.trips', ['id', 'owner_id', 'title', 'status', 'visibility', 'share_live', 'simulated', 'origin_name', 'destination_name', 'planned_destination', 'started_at', 'ended_at', 'distance_m', 'duration_s', 'stop_count', 'photo_count', 'video_count', 'summary', 'last_lat', 'last_lng', 'last_point_at', 'route_preview'],
  db.trips.map((t) => [wid(t.id), wid(t.ownerId), q(t.title), q(t.status), q(t.visibility), bool(t.shareLive), bool(t.simulated), q(t.originName), q(t.destinationName), q(t.plannedDestination), ts(t.startedAt), ts(t.endedAt), num(Math.round(t.distanceM)), String(t.durationS), String(t.stopCount), String(t.photoCount), String(t.videoCount), q(t.summary), num(t.lastLat), num(t.lastLng), ts(t.lastPointAt), json(downsample(db.points[t.id] ?? [], 48))]));
for (const t of db.trips) {
  const pts = db.points[t.id] ?? [];
  // mantém as paradas e reduz o restante (≈160 pontos por viagem) para o seed ficar enxuto
  const keepEvery = Math.max(1, Math.ceil(pts.length / 160));
  const kept = pts.filter((p, i) => p.kind === 'stop' || i % keepEvery === 0 || i === pts.length - 1);
  insert('public.trip_points', ['trip_id', 'recorded_at', 'lat', 'lng', 'speed', 'accuracy', 'kind'], kept.map((p) => [wid(t.id), ts(p.t), num(p.lat), num(p.lng), num(p.speed == null ? null : Math.round(p.speed * 10) / 10), num(p.accuracy), q(p.kind)]));
}
insert('public.trip_media', ['id', 'trip_id', 'type', 'url', 'scene', 'width', 'height', 'duration_ms', 'caption', 'lat', 'lng', 'taken_at'],
  db.moments.map((m) => [wid(m.id), wid(m.tripId), q(m.media.type), q(m.media.uri ?? null), json(m.media.scene ?? null), num(m.media.width), num(m.media.height), num(m.media.durationMs), q(m.caption), num(m.lat), num(m.lng), ts(m.takenAt)]));
emit();

emit('-- notificações de exemplo (do usuário de demonstração)');
insert('public.notifications', ['id', 'user_id', 'type', 'actor_id', 'post_id', 'comment_body', 'pending', 'read_at', 'created_at'],
  db.notifications.map((n) => [wid(n.id), wid(n.userId), q(n.type), wid(n.actorId), wid(n.postId), q(n.commentText), bool(n.pending), n.read ? ts(n.createdAt) : 'null', ts(n.createdAt)]));
emit();

emit('set session_replication_role = default;');
emit();
emit('-- conquistas já ganhas (calculadas com as mesmas regras do app)');
for (const p of db.profiles) emit(`select set_config('request.jwt.claim.sub', ${wid(p.id)}::text, true), (select count(*) from public.refresh_achievements());`);
emit(`select set_config('request.jwt.claim.sub', '', true);`);

const file = path.join(__dirname, '..', 'supabase', 'seed.sql');
fs.writeFileSync(file, out.join('\n') + '\n');
console.log(`seed.sql: ${(fs.statSync(file).size / 1024).toFixed(0)} KB, ${out.length} linhas`);
