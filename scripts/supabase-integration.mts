/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Teste de integração do SupabaseRepository: Postgres real (migrations + seed) + PostgREST.
 * Não usa mocks do backend — cada chamada é uma requisição HTTP de verdade, com JWT por usuário,
 * então o RLS é exercitado exatamente como em produção.
 *
 *   npm run db:integration
 */
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

import { SupabaseRepository } from '../src/data/supabase/SupabaseRepository';
import type { MediaUploader } from '../src/data/supabase/media';

const URL_ = process.env.PGREST_URL ?? 'http://127.0.0.1:54330';
const SECRET = process.env.JWT_SECRET ?? '';
if (!SECRET) throw new Error('JWT_SECRET ausente');

// --- util -------------------------------------------------------------------------------------
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwtFor(sub: string): string {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${head}.${body}.${createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
}
/** Mesma regra do seed.sql: md5('waysocial:<id>')::uuid */
function uuidOf(id: string): string {
  const h = createHash('md5').update(`waysocial:${id}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const noUpload: MediaUploader = { upload: async (_u, m) => m, resolve: async () => undefined };

function repoFor(key: string): SupabaseRepository {
  const uid = uuidOf(key);
  const sb = createClient('http://localhost', 'anon-key-unused', {
    accessToken: async () => jwtFor(uid),
    global: { fetch: (input, init) => fetch(String(input).replace('http://localhost/rest/v1', URL_), init) },
  });
  const repo = new SupabaseRepository(sb, noUpload, { realtime: false });
  repo.setViewer(uid);
  return repo;
}

const U = { lucas: 'u_lucas', marina: 'u_marina', pedro: 'u_pedro', ana: 'u_ana', gabriel: 'u_gabriel' };
const lucas = repoFor(U.lucas);
const marina = repoFor(U.marina);
const pedro = repoFor(U.pedro);
const ana = repoFor(U.ana);
const gabriel = repoFor(U.gabriel);
const place = (id: string) => uuidOf(id);
const scenePhoto = () => ({ type: 'image' as const, scene: { kind: 'beach' as const, seed: 7 } });

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (e: any) {
    failures.push(`${name}: ${e.message}`);
    console.log(`✗ ${name}\n    ${String(e.message).split('\n').slice(0, 3).join('\n    ')}`);
  }
}

// --- testes -----------------------------------------------------------------------------------
await test('feed "Explorar" do Lucas: posts recentes, ordenados, sem os de perfil privado', async () => {
  const feed = await lucas.getFeed('explore');
  assert.ok(feed.length >= 25, `esperava ≥25 posts, vi ${feed.length}`);
  assert.deepEqual(feed.map((p) => p.createdAt), [...feed.map((p) => p.createdAt)].sort().reverse());
  assert.ok(!feed.some((p) => p.author.username === 'ana.cafe'), 'post da Ana (privada) vazou');
  const first = feed.find((p) => p.author.username === 'pedro.roda' && p.place?.name === 'Restaurante Maré Alta');
  assert.ok(first, 'post do Pedro na Maré Alta');
  assert.equal(first.precision, 'place');
  assert.equal(first.media[0].scene?.kind, 'food');
});

await test('feed "Seguindo": só quem o Lucas segue + ele mesmo', async () => {
  const feed = await lucas.getFeed('following');
  const authors = new Set(feed.map((p) => p.author.username));
  assert.ok(authors.has('lucas.viaja') && authors.has('marina.sc') && authors.has('pedro.roda') && authors.has('gabriel.trilhas'));
  assert.ok(!authors.has('ana.cafe'));
});

await test('perfil privado (Ana): pedido pendente, conteúdo oculto no servidor', async () => {
  const v = await lucas.getProfileView(uuidOf(U.ana));
  assert.equal(v?.followState, 'requested');
  assert.equal(v?.canViewContent, false);
  assert.deepEqual(await lucas.listPostsByUser(uuidOf(U.ana)), []);
  assert.equal(await lucas.getPost(uuidOf('po_a01')), null);
  assert.equal(await lucas.getTrip(uuidOf('tr_ana_cafe')), null);
});

await test('estatísticas do perfil do Lucas', async () => {
  const v = await lucas.getProfileView(uuidOf(U.lucas));
  assert.equal(v?.stats.posts, 10);
  assert.equal(v?.stats.places, 9);
  assert.equal(v?.stats.followers, 4);
  assert.equal(v?.stats.following, 3);
  assert.equal(v?.stats.trips, 1);
});

await test('viagem de exemplo: 128 km · 1h42 · 14 fotos · 3 vídeos · 2 paradas · 17 momentos', async () => {
  const t = await lucas.getTrip(uuidOf('tr_lucas_bc'));
  assert.ok(t, 'viagem');
  assert.equal(t.originName, 'Jaraguá do Sul');
  assert.equal(t.destinationName, 'Balneário Camboriú');
  assert.ok(t.distanceM / 1000 > 126 && t.distanceM / 1000 < 130, `distância ${t.distanceM}`);
  assert.equal(t.durationS, 102 * 60);
  assert.equal(t.photoCount, 14);
  assert.equal(t.videoCount, 3);
  assert.equal(t.stopCount, 2);
  assert.equal(t.moments.length, 17);
  assert.ok(t.points.length > 100, 'trajeto');
});

await test('visibilidade de viagens: seguidores só para quem segue', async () => {
  assert.ok(await lucas.getTrip(uuidOf('tr_gabriel_jgua')), 'Lucas segue Gabriel');
  assert.equal(await ana.getTrip(uuidOf('tr_gabriel_jgua')), null, 'Ana não segue Gabriel');
  assert.ok(await ana.getTrip(uuidOf('tr_lucas_bc')), 'viagem pública');
});

await test('mapa: viagens ao vivo respeitam seguidores; eventos e posts aparecem', async () => {
  const opts = { center: { lat: -26.8, lng: -48.9 }, radiusM: 400_000 };
  const asLucas = (await lucas.getMapItems({ ...opts, filter: 'trips' })).map((i) => i.id).sort();
  assert.deepEqual(asLucas, [uuidOf('tr_gabriel_live'), uuidOf('tr_marina_live')].sort());
  const asAna = (await ana.getMapItems({ ...opts, filter: 'trips' })).map((i) => i.id);
  assert.ok(asAna.includes(uuidOf('tr_marina_live')) && !asAna.includes(uuidOf('tr_gabriel_live')));
  const events = await lucas.getMapItems({ ...opts, filter: 'events' });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'event');
  const posts = await lucas.getMapItems({ ...opts, filter: 'posts' });
  assert.ok(posts.length >= 8, `posts no mapa: ${posts.length}`);
  assert.ok(posts.every((i) => i.type === 'post'));
  assert.ok(!posts.some((i) => i.type === 'post' && i.post.author.username === 'ana.cafe'));
  const all = await lucas.getMapItems({ ...opts, filter: 'all' });
  assert.ok(all.some((i) => i.type === 'event') && all.some((i) => i.type === 'live') && all.some((i) => i.type === 'place'));
});

await test('publicar: lugar escolhido grava as coordenadas do LUGAR (não as do aparelho)', async () => {
  const post = await lucas.createPost({ media: [scenePhoto()], caption: 'Teste no lugar', placeId: place('pl_praia_central'), deviceLocation: { lat: -10, lng: -10 }, precision: 'place' });
  const p = await lucas.getPlace(place('pl_praia_central'));
  assert.equal(post.precision, 'place');
  assert.equal(post.lat, p!.lat);
  assert.equal(post.lng, p!.lng);
  assert.equal(post.place?.name, 'Praia Central');
  assert.equal(post.author.username, 'lucas.viaja');
});

await test('publicar: sem localização, aproximada e exata', async () => {
  const device = { lat: -26.99306, lng: -48.62714 };
  const none = await lucas.createPost({ media: [scenePhoto()], caption: 'n', placeId: place('pl_praia_central'), deviceLocation: device, precision: 'none' });
  assert.equal(none.lat, null);
  assert.equal(none.place, null);
  const approx = await lucas.createPost({ media: [scenePhoto()], caption: 'a', deviceLocation: device, precision: 'approx' });
  assert.equal(approx.lat, -26.99);
  assert.equal(approx.lng, -48.63);
  const exact = await lucas.createPost({ media: [scenePhoto()], caption: 'e', deviceLocation: device, precision: 'exact' });
  assert.equal(exact.lat, device.lat);
  // excluir a localização depois
  const cleaned = await lucas.removePostLocation(exact.id);
  assert.equal(cleaned.lat, null);
  assert.equal(cleaned.precision, 'none');
  // outro usuário não consegue apagar a localização de um post alheio
  await pedro.removePostLocation(approx.id);
  assert.equal((await lucas.getPost(approx.id))?.lat, -26.99, 'post alheio foi alterado!');
});

await test('curtir, salvar e comentar geram notificações para o autor; desfazer remove', async () => {
  // o seed já tem curtidas aleatórias: parte de um estado conhecido (nem curtido, nem salvo)
  const pre = await gabriel.getPost(uuidOf('po_m03'));
  if (pre?.likedByMe) await gabriel.toggleLike(uuidOf('po_m03'));
  if (pre?.savedByMe) await gabriel.toggleSave(uuidOf('po_m03'));
  const before = await marina.unreadNotificationCount();
  const like = await gabriel.toggleLike(uuidOf('po_m03'));
  assert.equal(like.liked, true);
  assert.ok(await gabriel.toggleSave(uuidOf('po_m03')));
  const c = await gabriel.addComment(uuidOf('po_m03'), '  Que pôr do sol!  ');
  assert.equal(c.text, 'Que pôr do sol!');
  assert.equal(c.author.username, 'gabriel.trilhas');
  const notifs = await marina.listNotifications();
  assert.ok(notifs.some((n) => n.type === 'like' && n.actor.username === 'gabriel.trilhas'));
  assert.ok(notifs.some((n) => n.type === 'save' && n.actor.username === 'gabriel.trilhas'));
  assert.ok(notifs.some((n) => n.type === 'comment' && n.commentText === 'Que pôr do sol!'));
  assert.equal(await marina.unreadNotificationCount(), before + 3);
  const post = await gabriel.getPost(uuidOf('po_m03'));
  assert.equal(post?.likedByMe, true);
  assert.equal(post?.savedByMe, true);
  await gabriel.toggleLike(uuidOf('po_m03'));
  await gabriel.toggleSave(uuidOf('po_m03'));
  assert.ok(!(await marina.listNotifications()).some((n) => n.type === 'like' && n.actor.username === 'gabriel.trilhas'));
  await assert.rejects(() => gabriel.addComment(uuidOf('po_m03'), '   '));
});

await test('RLS: não é possível curtir/comentar publicação de perfil privado sem seguir', async () => {
  // (Pedro segue a Ana no seed; o Gabriel, não)
  await assert.rejects(() => gabriel.toggleLike(uuidOf('po_a01')));
  await assert.rejects(() => gabriel.addComment(uuidOf('po_a01'), 'oi'));
});

await test('notificações: marcar como lidas zera o contador (pedidos pendentes ficam)', async () => {
  assert.ok((await lucas.unreadNotificationCount()) >= 3);
  await lucas.markNotificationsRead();
  assert.equal(await lucas.unreadNotificationCount(), 0);
  const list = await lucas.listNotifications();
  assert.ok(list.length >= 6);
  assert.ok(list.every((n) => n.read));
});

await test('lugar: nota, pulso, visitantes (sem perfil privado) e avaliação', async () => {
  const p = await lucas.getPlace(place('pl_praia_central'));
  assert.equal(p?.name, 'Praia Central');
  assert.ok(p!.ratingAvg >= 4.5 && p!.ratingAvg <= 4.8, `nota ${p!.ratingAvg}`);
  const pulse = await lucas.getPlacePulse(place('pl_praia_central'));
  assert.ok(pulse.postsToday >= 1 && pulse.peopleNow >= 1);
  const visitors = await lucas.listPlaceVisitors(place('pl_festival_outono'));
  assert.ok(!visitors.some((v) => v.profile.username === 'ana.cafe'), 'Ana (privada) apareceu como visitante');
  assert.ok(visitors.some((v) => v.profile.username === 'gabriel.trilhas'));
  const before = p!.ratingCount;
  const rated = await lucas.ratePlace(place('pl_praia_central'), 1);
  assert.equal(rated.ratingCount, before + 1);
  assert.equal(await lucas.getMyPlaceRating(place('pl_praia_central')), 1);
  const again = await lucas.ratePlace(place('pl_praia_central'), 5);
  assert.equal(again.ratingCount, before + 1, 'trocar a nota não duplica');
  assert.ok((await lucas.listPlaceReviews(place('pl_praia_central'))).length >= 3);
  assert.equal(await lucas.toggleSavePlace(place('pl_praia_central')), true);
  assert.equal(await lucas.isPlaceSaved(place('pl_praia_central')), true);
});

await test('busca: "balneario camboriu" (sem acento) monta a página da cidade', async () => {
  const r = await lucas.search('balneario camboriu');
  assert.equal(r.cityHub?.city.name, 'Balneário Camboriú');
  assert.ok(r.cityHub!.topPlaces.length >= 5);
  assert.ok(r.cityHub!.recentPosts.length >= 3);
  assert.ok(r.places.some((p) => p.name === 'Praia Central'));
  assert.ok((await lucas.search('trilhas')).people.some((p) => p.username === 'gabriel.trilhas'));
  assert.deepEqual((await lucas.search('a')).places, []);
});

await test('conquistas: progresso e desbloqueio do 10º lugar', async () => {
  const list = await lucas.listAchievements(uuidOf(U.lucas));
  const by = Object.fromEntries(list.map((a) => [a.id, a]));
  assert.ok(by.five_cities.unlocked && by.first_trip.unlocked);
  assert.equal(by.ten_places_photographed.progress, 9);
  assert.equal(by.ten_beaches.progress, 4);
  await lucas.popNewAchievements();
  await lucas.createPost({ media: [scenePhoto()], caption: 'décimo lugar', placeId: place('pl_parque_aguas'), precision: 'place' });
  const fresh = await lucas.popNewAchievements();
  assert.ok(fresh.some((a) => a.id === 'ten_places_photographed'), `novas: ${fresh.map((a) => a.id)}`);
  assert.deepEqual(await lucas.popNewAchievements(), []);
});

await test('perfil: editar e alternar privacidade', async () => {
  const p = await gabriel.updateProfile({ bio: 'Nova bio', homeCity: 'Joinville' });
  assert.equal(p.bio, 'Nova bio');
  await gabriel.updateProfile({ isPrivate: true });
  assert.equal((await lucas.getProfileView(uuidOf(U.gabriel)))?.canViewContent, true, 'Lucas segue Gabriel');
  assert.equal(await ana.getPost(uuidOf('po_g01')), null, 'Ana não segue o Gabriel agora privado');
  await gabriel.updateProfile({ isPrivate: false });
  assert.ok(await ana.getPost(uuidOf('po_g01')));
});

await test('seguir: público é imediato; privado fica pendente; aprovar libera; recusar remove', async () => {
  assert.equal(await gabriel.follow(uuidOf(U.pedro)), 'following'.replace('following', 'following'));
  assert.equal(await gabriel.follow(uuidOf(U.ana)), 'requested');
  assert.ok((await ana.listNotifications()).some((n) => n.type === 'follow_request' && n.pending && n.actor.username === 'gabriel.trilhas'));
  await ana.respondFollowRequest(uuidOf(U.gabriel), true);
  assert.ok(await gabriel.getPost(uuidOf('po_a01')), 'após aprovar, o seguidor vê os posts');
  assert.ok((await gabriel.listNotifications()).some((n) => n.type === 'follow_accepted'));
  // Lucas pede, Ana recusa
  await ana.respondFollowRequest(uuidOf(U.lucas), false);
  assert.equal((await lucas.getProfileView(uuidOf(U.ana)))?.followState, 'none');
  await gabriel.unfollow(uuidOf(U.ana));
  assert.equal(await gabriel.getPost(uuidOf('po_a01')), null);
});

await test('viagem completa: iniciar → pontos → momento no feed (aproximado) → parar de compartilhar → finalizar', async () => {
  const t0 = Date.now();
  const trip = await pedro.startTrip({ visibility: 'public', shareLive: true, simulated: true, plannedDestination: 'Florianópolis', origin: { lat: -26.3, lng: -48.85 }, originName: 'Joinville' });
  assert.equal(trip.status, 'active');
  assert.equal((await pedro.getActiveTrip())?.id, trip.id);
  await assert.rejects(() => pedro.startTrip({ visibility: 'public', shareLive: true, simulated: true, origin: { lat: 0, lng: 0 }, originName: 'x' }), /duplicate|unique|ativa/i);

  const pts = [1, 2, 3, 4].map((i) => ({ lat: -26.3 - i * 0.01, lng: -48.85, t: new Date(t0 + i * 60_000).toISOString(), speed: 18, accuracy: 6, kind: 'track' as const }));
  await pedro.appendTripPoints(trip.id, pts);
  const moment = await pedro.addTripMoment(trip.id, { media: scenePhoto(), lat: pts[2].lat, lng: pts[2].lng, takenAt: pts[2].t, publishToFeed: true, caption: 'parada' });
  assert.ok(moment.postId);
  const post = await pedro.getPost(moment.postId!);
  assert.equal(post?.precision, 'approx', 'momento no feed nunca vaza posição exata');
  assert.equal(post?.tripId, trip.id);

  const live = await lucas.getMapItems({ center: { lat: -26.4, lng: -48.85 }, radiusM: 60_000, filter: 'trips' });
  assert.ok(live.some((i) => i.id === trip.id), 'viagem ao vivo aparece para quem pode ver');
  await pedro.setTripShareLive(trip.id, false);
  const hidden = await lucas.getMapItems({ center: { lat: -26.4, lng: -48.85 }, radiusM: 60_000, filter: 'trips' });
  assert.ok(!hidden.some((i) => i.id === trip.id), 'parar de compartilhar remove do mapa na hora');
  assert.equal(await lucas.getTrip(trip.id), null, 'viagem ativa sem compartilhamento é invisível para terceiros');

  const done = await pedro.finishTrip({ tripId: trip.id, points: [], destinationName: 'Barra Velha', summary: 'Resumo de teste', durationS: 4 * 60, distanceM: 0 });
  assert.equal(done.status, 'finished');
  assert.equal(done.shareLive, false);
  assert.ok(done.distanceM > 4000, `distância ${done.distanceM}`);
  assert.equal(done.photoCount, 1);
  assert.equal(done.title, 'Joinville → Barra Velha');
  assert.equal(done.summary, 'Resumo de teste');
  assert.ok(done.routePreview && done.routePreview.length >= 2);
  assert.equal(await pedro.getActiveTrip(), null);
  assert.ok(await lucas.getTrip(trip.id), 'finalizada e pública: todos veem');
});

await test('viagem privada nunca compartilha; cancelar apaga tudo', async () => {
  // a Marina já tem uma viagem ativa (seed): o banco só permite UMA por pessoa
  await assert.rejects(() => marina.startTrip({ visibility: 'private', shareLive: false, simulated: false, origin: { lat: -27.5, lng: -48.5 }, originName: 'Floripa' }));
  const t = await ana.startTrip({ visibility: 'private', shareLive: true, simulated: false, origin: { lat: -26.9, lng: -49.0 }, originName: 'Blumenau' });
  assert.equal(t.shareLive, false);
  assert.equal((await ana.setTripShareLive(t.id, true)).shareLive, false);
  await ana.cancelTrip(t.id);
  assert.equal(await ana.getTrip(t.id), null);
});

await test('listas de viagens: minhas e da comunidade (respeitando visibilidade)', async () => {
  const mine = await lucas.listTrips(uuidOf(U.lucas));
  assert.ok(mine.some((t) => t.title === 'Jaraguá do Sul → Balneário Camboriú'));
  assert.ok(mine[0].routePreview!.length >= 2);
  const community = await lucas.listTripFeed();
  assert.ok(community.length >= 3);
  assert.ok(!community.some((t) => t.owner.username === 'ana.cafe'));
  assert.ok(!community.some((t) => t.owner.id === uuidOf(U.lucas)));
});

await test('comentários: lista em ordem e contagem na publicação', async () => {
  const comments = await lucas.listComments(uuidOf('po_l01'));
  assert.equal(comments.length, 3);
  assert.ok(comments[0].createdAt <= comments[2].createdAt);
  assert.equal((await lucas.getPost(uuidOf('po_l01')))?.commentCount, 3);
});

await test('excluir publicação: some do feed e leva os comentários', async () => {
  const post = await lucas.createPost({ media: [scenePhoto()], caption: 'efêmera', precision: 'none' });
  await lucas.addComment(post.id, 'oi');
  await lucas.deletePost(post.id);
  assert.equal(await lucas.getPost(post.id), null);
  assert.deepEqual(await lucas.listComments(post.id), []);
  // outro usuário não consegue excluir posts alheios
  await pedro.deletePost(uuidOf('po_l01'));
  assert.ok(await lucas.getPost(uuidOf('po_l01')), 'post alheio foi excluído!');
});

console.log(`\n${passed}/${passed + failures.length} testes de integração passaram.`);
if (failures.length) {
  console.log('\nFalhas:\n- ' + failures.join('\n- '));
  process.exit(1);
}
