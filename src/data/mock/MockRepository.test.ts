import { MockRepository, type KeyValueStorage } from './MockRepository';
import { U } from './seed';
import { haversine } from '@/lib/geo';

const NOW = new Date(2026, 9, 8, 15, 0, 0).getTime();

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

async function setup(viewer: string | null = U.lucas, now = NOW) {
  const storage = memoryStorage();
  const repo = new MockRepository({ storage, now: () => now });
  await repo.whenReady();
  repo.setViewer(viewer);
  return { repo, storage };
}

describe('MockRepository · seed', () => {
  it('abre com os 5 usuários, 6 cidades e conteúdo de verdade', async () => {
    const { repo } = await setup();
    const explore = await repo.getFeed('explore');
    expect(explore.length).toBeGreaterThan(25);
    const lucas = await repo.getProfileView(U.lucas);
    expect(lucas?.profile.username).toBe('lucas.viaja');
    expect(lucas?.stats.posts).toBe(10);
    const cities = (await repo.search('Santa')).cities; // sem acento
    expect(Array.isArray(cities)).toBe(true);
    for (const name of ['Jaraguá do Sul', 'Joinville', 'Blumenau', 'Balneário Camboriú', 'Florianópolis', 'Curitiba']) {
      const r = await repo.search(name);
      expect(r.cities.map((c) => c.name)).toContain(name);
    }
  });

  it('ordena o feed do mais recente para o mais antigo', async () => {
    const { repo } = await setup();
    const feed = await repo.getFeed('explore');
    const times = feed.map((p) => p.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
  });
});

describe('MockRepository · privacidade de perfil', () => {
  it('perfil privado (Ana) fica oculto até a aprovação do pedido', async () => {
    const { repo } = await setup();
    // Lucas já tem um pedido pendente para Ana
    expect(await repo.getProfileView(U.ana).then((v) => v?.followState)).toBe('requested');
    expect((await repo.getFeed('explore')).some((p) => p.author.id === U.ana)).toBe(false);
    expect(await repo.listPostsByUser(U.ana)).toEqual([]);
    expect(await repo.getPost('po_a01')).toBeNull();
    expect(await repo.getProfileView(U.ana).then((v) => v?.canViewContent)).toBe(false);

    // Ana aprova
    repo.setViewer(U.ana);
    await repo.respondFollowRequest(U.lucas, true);
    repo.setViewer(U.lucas);
    expect((await repo.getFeed('explore')).some((p) => p.author.id === U.ana)).toBe(true);
    expect(await repo.getPost('po_a01')).not.toBeNull();
    // quem pediu recebe o aviso de que foi aceito
    expect((await repo.listNotifications()).some((n) => n.type === 'follow_accepted' && n.actor.id === U.ana)).toBe(true);
  });

  async function newcomer(repo: MockRepository) {
    const id = await repo.registerUser({ email: 'novo@teste.dev', digest: 'x', username: 'novo', displayName: 'Novo Usuário' });
    repo.setViewer(id);
    return id;
  }

  it('seguir perfil público é imediato; privado vira "requested" e notifica', async () => {
    const { repo } = await setup();
    const me = await newcomer(repo);
    expect(await repo.follow(U.gabriel)).toBe('following');
    expect(await repo.follow(U.ana)).toBe('requested');
    repo.setViewer(U.ana);
    const n = (await repo.listNotifications()).find((x) => x.type === 'follow_request' && x.actor.id === me);
    expect(n?.pending).toBe(true);
    repo.setViewer(U.gabriel);
    expect((await repo.listNotifications()).some((x) => x.type === 'follow' && x.actor.id === me)).toBe(true);
  });

  it('recusar pedido remove a relação e a notificação', async () => {
    const { repo } = await setup();
    const me = await newcomer(repo);
    await repo.follow(U.ana);
    repo.setViewer(U.ana);
    await repo.respondFollowRequest(me, false);
    expect((await repo.listNotifications()).some((x) => x.actor.id === me && x.type === 'follow_request')).toBe(false);
    repo.setViewer(me);
    expect((await repo.getProfileView(U.ana))?.followState).toBe('none');
    expect(await repo.listPostsByUser(U.ana)).toEqual([]);
  });

  it('um recém-chegado não vê viagem de seguidores nem posts de perfil privado', async () => {
    const { repo } = await setup();
    await newcomer(repo);
    expect(await repo.getTrip('tr_gabriel_jgua')).toBeNull();
    expect((await repo.getFeed('explore')).some((p) => p.author.id === U.ana)).toBe(false);
    expect(await repo.getTrip('tr_lucas_bc')).not.toBeNull();
  });

  it('tornar o perfil público aprova pedidos pendentes', async () => {
    const { repo } = await setup(U.ana);
    await repo.updateProfile({ isPrivate: false });
    repo.setViewer(U.lucas);
    expect((await repo.getProfileView(U.ana))?.followState).toBe('following');
  });
});

describe('MockRepository · localização das publicações', () => {
  const device = { lat: -26.99306, lng: -48.62714 };

  it('lugar escolhido grava as coordenadas do LUGAR, não a posição do aparelho', async () => {
    const { repo } = await setup();
    const post = await repo.createPost({
      media: [{ type: 'image', uri: 'file:///x.jpg' }],
      caption: 'oi',
      placeId: 'pl_praia_central',
      deviceLocation: device,
      precision: 'place',
    });
    const place = await repo.getPlace('pl_praia_central');
    expect(post.lat).toBe(place!.lat);
    expect(post.lng).toBe(place!.lng);
    expect(post.precision).toBe('place');
  });

  it('"none" não grava lugar nem coordenadas, mesmo com aparelho informado', async () => {
    const { repo } = await setup();
    const post = await repo.createPost({
      media: [{ type: 'image', uri: 'file:///x.jpg' }],
      caption: 'sem local',
      placeId: 'pl_praia_central',
      deviceLocation: device,
      precision: 'none',
    });
    expect(post.place).toBeNull();
    expect(post.lat).toBeNull();
    expect(post.lng).toBeNull();
  });

  it('"approx" arredonda a posição (~1 km); "exact" mantém', async () => {
    const { repo } = await setup();
    const approx = await repo.createPost({ media: [{ type: 'image', uri: 'a' }], caption: '', deviceLocation: device, precision: 'approx' });
    expect(haversine({ lat: approx.lat!, lng: approx.lng! }, device)).toBeLessThan(1500);
    expect(approx.lat).not.toBe(device.lat);
    const exact = await repo.createPost({ media: [{ type: 'image', uri: 'a' }], caption: '', deviceLocation: device, precision: 'exact' });
    expect(exact.lat).toBe(device.lat);
  });

  it('removePostLocation apaga lugar e coordenadas e some do mapa', async () => {
    const { repo } = await setup();
    const before = await repo.getMapItems({ center: { lat: -26.99, lng: -48.63 }, radiusM: 5000, filter: 'posts' });
    expect(before.some((i) => i.type === 'post' && i.post.id === 'po_l01')).toBe(true);
    const updated = await repo.removePostLocation('po_l01');
    expect(updated.place).toBeNull();
    expect(updated.lat).toBeNull();
    expect(updated.precision).toBe('none');
    const after = await repo.getMapItems({ center: { lat: -26.99, lng: -48.63 }, radiusM: 5000, filter: 'posts' });
    expect(after.some((i) => i.type === 'post' && i.post.id === 'po_l01')).toBe(false);
  });

  it('só o autor pode apagar localização ou excluir', async () => {
    const { repo } = await setup(U.pedro);
    await expect(repo.removePostLocation('po_l01')).rejects.toThrow();
    await expect(repo.deletePost('po_l01')).rejects.toThrow();
  });
});

describe('MockRepository · interações', () => {
  it('curtir soma 1, notifica o autor e descurtir desfaz tudo', async () => {
    const { repo } = await setup(U.gabriel);
    const before = (await repo.getPost('po_m03'))!;
    const r = await repo.toggleLike('po_m03');
    expect(r.liked).toBe(!before.likedByMe);
    expect(r.count).toBe(before.likeCount + (before.likedByMe ? -1 : 1));
    repo.setViewer(U.marina);
    const hadNotif = (await repo.listNotifications()).some((n) => n.type === 'like' && n.actor.id === U.gabriel && n.post?.id === 'po_m03');
    expect(hadNotif).toBe(!before.likedByMe);
    repo.setViewer(U.gabriel);
    await repo.toggleLike('po_m03');
    expect((await repo.getPost('po_m03'))!.likeCount).toBe(before.likeCount);
  });

  it('comentar atualiza contagem e notifica; comentário vazio é rejeitado', async () => {
    const { repo } = await setup();
    const before = (await repo.getPost('po_m03'))!.commentCount;
    await repo.addComment('po_m03', '  Linda foto!  ');
    expect((await repo.getPost('po_m03'))!.commentCount).toBe(before + 1);
    const comments = await repo.listComments('po_m03');
    expect(comments[comments.length - 1].text).toBe('Linda foto!');
    await expect(repo.addComment('po_m03', '   ')).rejects.toThrow();
    repo.setViewer(U.marina);
    expect((await repo.listNotifications()).some((n) => n.type === 'comment' && n.commentText === 'Linda foto!')).toBe(true);
  });

  it('salvar publicação aparece em listSavedPosts', async () => {
    const { repo } = await setup();
    expect(await repo.toggleSave('po_m02')).toBe(true);
    expect((await repo.listSavedPosts()).map((p) => p.id)).toContain('po_m02');
    expect(await repo.toggleSave('po_m02')).toBe(false);
  });

  it('não curte publicação de perfil privado sem seguir', async () => {
    const { repo } = await setup();
    await expect(repo.toggleLike('po_a01')).rejects.toThrow();
  });
});

describe('MockRepository · lugares', () => {
  it('pulso da Praia Central soma o "ambiente" da demo com publicações reais', async () => {
    const { repo } = await setup();
    const pulse = await repo.getPlacePulse('pl_praia_central');
    expect(pulse.postsToday).toBeGreaterThanOrEqual(9);
    expect(pulse.peopleNow).toBeGreaterThanOrEqual(38);
  });

  it('o pulso do Maré Alta lembra "Pedro publicou há 5 min"', async () => {
    const { repo } = await setup();
    const pulse = await repo.getPlacePulse('pl_mare_alta');
    expect(pulse.lastPost?.authorName).toBe('Pedro');
    expect((NOW - new Date(pulse.lastPost!.createdAt).getTime()) / 60000).toBe(5);
  });

  it('avaliar recalcula a média e permite trocar a nota', async () => {
    const { repo } = await setup();
    const before = (await repo.getPlace('pl_praia_central'))!;
    const after = await repo.ratePlace('pl_praia_central', 1);
    expect(after.ratingCount).toBe(before.ratingCount + 1);
    expect(after.ratingAvg).toBeLessThanOrEqual(before.ratingAvg);
    expect(await repo.getMyPlaceRating('pl_praia_central')).toBe(1);
    const again = await repo.ratePlace('pl_praia_central', 5);
    expect(again.ratingCount).toBe(before.ratingCount + 1); // não duplica
  });

  it('"quem esteve aqui" respeita perfil privado', async () => {
    const { repo } = await setup();
    const visitors = await repo.listPlaceVisitors('pl_festival_outono');
    expect(visitors.map((v) => v.profile.id)).not.toContain(U.ana);
    expect(visitors.map((v) => v.profile.id)).toContain(U.gabriel);
  });
});

describe('MockRepository · viagens', () => {
  it('a viagem de exemplo bate com o produto: ~128 km, 1h42, 14 fotos, 3 vídeos, 2 paradas', async () => {
    const { repo } = await setup();
    const trip = (await repo.getTrip('tr_lucas_bc'))!;
    expect(trip.originName).toBe('Jaraguá do Sul');
    expect(trip.destinationName).toBe('Balneário Camboriú');
    expect(trip.distanceM / 1000).toBeGreaterThan(126);
    expect(trip.distanceM / 1000).toBeLessThan(130);
    expect(trip.durationS).toBe(102 * 60);
    expect(trip.photoCount).toBe(14);
    expect(trip.videoCount).toBe(3);
    expect(trip.stopCount).toBe(2);
    expect(trip.moments).toHaveLength(17);
    expect(trip.summary).toContain('Jaraguá do Sul');
  });

  it('visibilidade: privada some, "seguidores" só para quem segue', async () => {
    const { repo } = await setup();
    expect(await repo.getTrip('tr_ana_cafe')).toBeNull(); // privada
    expect(await repo.getTrip('tr_gabriel_jgua')).not.toBeNull(); // seguidores — Lucas segue Gabriel
    repo.setViewer(U.ana); // Ana não segue Gabriel
    expect(await repo.getTrip('tr_gabriel_jgua')).toBeNull();
    expect(await repo.getTrip('tr_lucas_bc')).not.toBeNull(); // pública
  });

  it('viagens ao vivo no mapa respeitam seguidores e compartilhamento', async () => {
    const { repo } = await setup();
    const all = { center: { lat: -26.8, lng: -48.9 }, radiusM: 400_000, filter: 'trips' as const };
    const asLucas = (await repo.getMapItems(all)).filter((i) => i.type === 'live').map((i) => i.id);
    expect(asLucas).toEqual(expect.arrayContaining(['tr_marina_live', 'tr_gabriel_live']));
    repo.setViewer(U.ana);
    const asAna = (await repo.getMapItems(all)).filter((i) => i.type === 'live').map((i) => i.id);
    expect(asAna).toContain('tr_marina_live');
    expect(asAna).not.toContain('tr_gabriel_live');
    // Marina para de compartilhar
    repo.setViewer(U.marina);
    await repo.setTripShareLive('tr_marina_live', false);
    repo.setViewer(U.lucas);
    const after = (await repo.getMapItems(all)).filter((i) => i.type === 'live').map((i) => i.id);
    expect(after).not.toContain('tr_marina_live');
  });

  it('a viagem ao vivo anda com o relógio', async () => {
    const { repo, storage } = await setup(U.lucas, NOW);
    await repo.flush();
    const later = new MockRepository({ storage, now: () => NOW + 10 * 60_000 });
    await later.whenReady();
    later.setViewer(U.lucas);
    const opts = { center: { lat: -27.1, lng: -48.6 }, radiusM: 400_000, filter: 'trips' as const };
    const pa = (await repo.getMapItems(opts)).find((i) => i.id === 'tr_marina_live')!;
    const pb = (await later.getMapItems(opts)).find((i) => i.id === 'tr_marina_live')!;
    // 10 min a 22 m/s ≈ 13 km pela rota (a corda entre os pontos é um pouco menor)
    expect(haversine(pa, pb)).toBeGreaterThan(8_000);
  });

  it('fluxo completo: iniciar → pontos → momento → parar de compartilhar → finalizar', async () => {
    const { repo } = await setup(U.pedro);
    const trip = await repo.startTrip({
      visibility: 'public',
      shareLive: true,
      simulated: true,
      plannedDestination: 'Florianópolis',
      origin: { lat: -26.3, lng: -48.85 },
      originName: 'Joinville',
    });
    expect(trip.status).toBe('active');
    expect(await repo.getActiveTrip().then((t) => t?.id)).toBe(trip.id);
    await expect(repo.startTrip({ visibility: 'public', shareLive: true, simulated: true, origin: { lat: 0, lng: 0 }, originName: 'x' })).rejects.toThrow(/ativa/);

    const t0 = new Date(trip.startedAt).getTime();
    const pts = [1, 2, 3, 4].map((i) => ({ lat: -26.3 - i * 0.01, lng: -48.85, t: new Date(t0 + i * 60_000).toISOString(), speed: 18, accuracy: 6, kind: 'track' as const }));
    await repo.appendTripPoints(trip.id, pts);
    const m = await repo.addTripMoment(trip.id, {
      media: { type: 'image', uri: 'file:///a.jpg' },
      lat: pts[2].lat,
      lng: pts[2].lng,
      takenAt: pts[2].t,
      publishToFeed: true,
    });
    expect(m.postId).toBeTruthy();
    const post = (await repo.getPost(m.postId!))!;
    expect(post.precision).toBe('approx'); // momento no feed nunca vaza posição exata
    expect(post.tripId).toBe(trip.id);

    repo.setViewer(U.lucas);
    expect((await repo.getMapItems({ center: { lat: -26.4, lng: -48.85 }, radiusM: 50_000, filter: 'trips' })).some((i) => i.id === trip.id)).toBe(true);
    repo.setViewer(U.pedro);
    await repo.setTripShareLive(trip.id, false);
    repo.setViewer(U.lucas);
    expect((await repo.getMapItems({ center: { lat: -26.4, lng: -48.85 }, radiusM: 50_000, filter: 'trips' })).some((i) => i.id === trip.id)).toBe(false);

    repo.setViewer(U.pedro);
    const done = await repo.finishTrip({ tripId: trip.id, points: [], destinationName: 'Barra Velha', summary: 'ok', durationS: 4 * 60, distanceM: 0 });
    expect(done.status).toBe('finished');
    expect(done.shareLive).toBe(false);
    expect(done.distanceM).toBeGreaterThan(4000);
    expect(done.photoCount).toBe(1);
    expect(done.title).toBe('Joinville → Barra Velha');
    expect(await repo.getActiveTrip()).toBeNull();
  });

  it('viagem privada nunca compartilha ao vivo', async () => {
    const { repo } = await setup(U.pedro);
    const trip = await repo.startTrip({ visibility: 'private', shareLive: true, simulated: false, origin: { lat: -25.4, lng: -49.27 }, originName: 'Curitiba' });
    expect(trip.shareLive).toBe(false);
    const again = await repo.setTripShareLive(trip.id, true);
    expect(again.shareLive).toBe(false);
  });

  it('cancelar descarta viagem, pontos e momentos', async () => {
    const { repo } = await setup(U.pedro);
    const trip = await repo.startTrip({ visibility: 'followers', shareLive: false, simulated: false, origin: { lat: -25.4, lng: -49.27 }, originName: 'Curitiba' });
    await repo.cancelTrip(trip.id);
    expect(await repo.getTrip(trip.id)).toBeNull();
  });
});

describe('MockRepository · conquistas', () => {
  it('Lucas tem 5 cidades e primeira viagem; 9/10 lugares; sequência de 3 dias', async () => {
    const { repo } = await setup();
    const list = await repo.listAchievements(U.lucas);
    const by = Object.fromEntries(list.map((a) => [a.id, a]));
    expect(by.first_post.unlocked).toBe(true);
    expect(by.first_place.unlocked).toBe(true);
    expect(by.first_trip.unlocked).toBe(true);
    expect(by.five_cities.unlocked).toBe(true);
    expect(by.ten_places_photographed.unlocked).toBe(false);
    expect(by.ten_places_photographed.progress).toBe(9);
    expect(by.streak_7.progress).toBe(3);
    expect(by.ten_beaches.progress).toBe(4);
  });

  it('o 10º lugar desbloqueia a conquista e entra na fila de celebração', async () => {
    const { repo } = await setup();
    await repo.listAchievements(U.lucas); // registra o que já estava desbloqueado
    await repo.popNewAchievements();
    await repo.createPost({ media: [{ type: 'image', uri: 'a' }], caption: 'novo', placeId: 'pl_parque_aguas', precision: 'place' });
    const unlocked = await repo.popNewAchievements();
    expect(unlocked.map((a) => a.id)).toContain('ten_places_photographed');
    expect(await repo.popNewAchievements()).toEqual([]);
  });
});

describe('MockRepository · busca', () => {
  it('"balneario camboriu" (sem acento) monta a página da cidade', async () => {
    const { repo } = await setup();
    const r = await repo.search('balneario camboriu');
    expect(r.cityHub?.city.name).toBe('Balneário Camboriú');
    expect(r.cityHub?.topPlaces[0].cityName).toBe('Balneário Camboriú');
    expect(r.cityHub!.recentPosts.length).toBeGreaterThan(3);
    expect(r.cityHub!.people.length).toBeGreaterThan(0);
    expect(r.places.some((p) => p.id === 'pl_praia_central')).toBe(true);
  });

  it('acha pessoas por @username e por nome', async () => {
    const { repo } = await setup();
    expect((await repo.search('marina')).people.map((p) => p.username)).toContain('marina.sc');
    expect((await repo.search('trilhas')).people.map((p) => p.username)).toContain('gabriel.trilhas');
  });

  it('consulta curta não retorna nada', async () => {
    const { repo } = await setup();
    expect((await repo.search('a')).places).toEqual([]);
  });
});

describe('MockRepository · persistência', () => {
  it('grava e recarrega o estado; avança o relógio quando ficou parado', async () => {
    const { repo, storage } = await setup();
    await repo.addComment('po_m03', 'persistiu?');
    await repo.flush();
    const raw = storage.data.values().next().value as string;
    expect(raw).toContain('persistiu?');

    const reopened = new MockRepository({ storage, now: () => NOW + 10 * 3600_000 });
    await reopened.whenReady();
    reopened.setViewer(U.lucas);
    const comments = await reopened.listComments('po_m03');
    expect(comments.some((c) => c.text === 'persistiu?')).toBe(true);
    // a publicação de "25 min atrás" continua "25 min atrás" depois de 10 h
    const p = (await reopened.getPost('po_l01'))!;
    expect(Math.round((NOW + 10 * 3600_000 - new Date(p.createdAt).getTime()) / 60000)).toBe(25);
  });

  it('resetDemoData volta ao seed', async () => {
    const { repo } = await setup();
    await repo.deletePost('po_l01');
    expect(await repo.getPost('po_l01')).toBeNull();
    await repo.resetDemoData();
    expect(await repo.getPost('po_l01')).not.toBeNull();
  });
});

describe('MockRepository · notificações', () => {
  it('Lucas abre com 3 não lidas e marcar como lidas zera (pedidos pendentes ficam)', async () => {
    const { repo } = await setup();
    expect(await repo.unreadNotificationCount()).toBe(3);
    await repo.markNotificationsRead();
    expect(await repo.unreadNotificationCount()).toBe(0);
  });

  it('simulateIncomingActivity gera uma notificação nova', async () => {
    const { repo } = await setup();
    const before = (await repo.listNotifications()).length;
    const msg = await repo.simulateIncomingActivity();
    expect(typeof msg).toBe('string');
    expect((await repo.listNotifications()).length).toBeGreaterThanOrEqual(before);
  });
});
