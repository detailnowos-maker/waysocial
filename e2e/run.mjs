// E2E da jornada principal no navegador (Expo web + Chromium em viewport de celular).
//   1) npm run web  (ou deixe o servidor do Expo rodando em :8081)
//   2) npm run test:e2e
// Cada passo grava um screenshot em e2e/screenshots/. Falha (exit 1) se qualquer verificação não bater.
import { BASE_URL, launch, shot, sleep } from './lib.mjs';

const only = (process.env.E2E_ONLY ?? '').split(',').filter(Boolean);
const on = (group) => only.length === 0 || only.includes(group);
const { browser, page, logs } = await launch();
const failures = [];
let step = 0;

// só elementos visíveis: o Stack mantém telas anteriores montadas (e escondidas) no DOM
const tid = (id) => page.locator(`[data-testid="${id}"]:visible`);
async function check(name, fn) {
  step += 1;
  const label = `${String(step).padStart(2, '0')} ${name}`;
  try {
    await fn();
    console.log(`✓ ${label}`);
  } catch (e) {
    failures.push(`${label}: ${e.message.split('\n')[0]}`);
    console.log(`✗ ${label}\n    ${e.message.split('\n')[0]}`);
    await shot(page, `FAIL-${String(step).padStart(2, '0')}`).catch(() => undefined);
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const visible = async (locator, timeout = 8000) => locator.first().waitFor({ state: 'visible', timeout });
// ícones (Ionicons) entram no innerText como caracteres de uso privado — descartá-los
const text = async (locator) => (await locator.first().innerText()).replace(/[\uE000-\uF8FF]/g, '').trim();
const goto = async (path) => {
  await page.goto(BASE_URL + path, { waitUntil: 'load' });
  await sleep(1800);
};

await page.goto(BASE_URL, { waitUntil: 'load', timeout: 240_000 });
await sleep(2000);

// ---------------------------------------------------------------- entrada
await check('boas-vindas mostra a promessa do produto e as ações', async () => {
  await visible(page.getByText('Compartilhe o mundo enquanto você vive.'));
  await visible(tid('welcome-signup'));
  await visible(tid('welcome-demo'));
  await shot(page, 'e2e-01-welcome');
});

await check('login com e-mail/senha errados mostra erro', async () => {
  await tid('welcome-login').click();
  await tid('login-email').fill('lucas@waysocial.demo');
  await tid('login-password').fill('senha-errada');
  await tid('login-submit').click();
  await visible(tid('login-error'));
  expect((await text(tid('login-error'))).includes('incorretos'), 'mensagem de erro esperada');
});

await check('login com a conta de demonstração abre o feed', async () => {
  await tid('login-fill-demo').click();
  await tid('login-submit').click();
  await visible(tid('post-po_p01'), 15_000);
  await shot(page, 'e2e-02-feed');
});

if (on('app')) {
  // ---------------------------------------------------------------- feed
  await check('feed: post "há 5 min" do Pedro na Maré Alta; sino com 3 novidades', async () => {
    const card = tid('post-po_p01');
    expect((await card.innerText()).includes('Restaurante Maré Alta'), 'lugar do post');
    expect((await card.innerText()).includes('há 5 min'), 'horário relativo');
    expect(/3/.test(await page.getByTestId('feed-bell').first().innerText()), 'selo de notificações');
  });

  await check('feed: "Viajando agora" lista Marina e Gabriel ao vivo', async () => {
    await visible(tid('live-tr_marina_live'));
    await visible(tid('live-tr_gabriel_live'));
  });

  await check('curtir soma 1 e descurtir volta', async () => {
    const likes = tid('post-po_m01-likes');
    await likes.scrollIntoViewIfNeeded();
    const before = (await text(likes)).replace(/\D/g, '');
    await tid('post-po_m01-like').click();
    await sleep(500);
    const after = (await text(likes)).replace(/\D/g, '');
    expect(Number(after) === Number(before) + 1 || Number(after) === Number(before) - 1, `contagem ${before} → ${after}`);
    await tid('post-po_m01-like').click();
    await sleep(500);
    expect((await text(likes)).replace(/\D/g, '') === before, 'voltou ao valor original');
  });

  await check('segmento "Explorar" mostra posts de quem não sigo', async () => {
    await page.getByText('Explorar', { exact: true }).first().click();
    await sleep(800);
    await visible(tid('post-po_l01'));
  });

  // ---------------------------------------------------------------- post + comentário
  await check('abrir publicação e comentar', async () => {
    await goto('/post/po_l01');
    await visible(page.getByText('Dia incrível por aqui!'));
    await tid('comment-input').fill('Teste automático: que dia lindo!');
    await tid('comment-send').click();
    await sleep(800);
    await visible(page.getByText('Teste automático: que dia lindo!'));
    await shot(page, 'e2e-03-post');
  });

  // ---------------------------------------------------------------- mapa
  await check('mapa: marcadores, filtros e cartão do evento', async () => {
    await goto('/map');
    await visible(page.getByTestId(/^marker-/), 12_000);
    const n = await page.getByTestId(/^marker-/).count();
    expect(n >= 3, `esperava ≥3 marcadores, vi ${n}`);
    await tid('map-filter-events').click();
    await sleep(1200);
    await visible(tid('marker-pl_festival_outono'));
    await tid('marker-pl_festival_outono').click();
    await visible(tid('map-card-place'));
    expect((await tid('map-card-place').innerText()).includes('aqui agora'), 'cartão mostra pessoas agora');
    await shot(page, 'e2e-04-map-event');
    await tid('map-card-place').click();
    await visible(tid('place-name'));
    expect((await text(tid('place-name'))).includes('Festival de Outono'), 'abriu a página do evento');
  });

  await check('mapa: viagens ao vivo aparecem e abrem o cartão', async () => {
    await goto('/map');
    await tid('map-filter-trips').click();
    await sleep(1200);
    await visible(tid('marker-tr_marina_live'));
    await tid('marker-tr_marina_live').click();
    await visible(tid('map-card-live'));
    expect((await tid('map-card-live').innerText()).includes('Marina está viajando para Florianópolis'), 'texto da viagem ao vivo');
    await shot(page, 'e2e-05-map-live');
  });

  await check('mapa: cartão de publicação abre o post completo', async () => {
    // fluxo real: tocar numa frase de "Acontecendo agora" leva ao marcador e abre o cartão
    await tid('map-filter-all').click();
    await sleep(1500);
    const card = page.getByTestId('activity-card').filter({ hasText: 'publicou uma foto aqui' });
    await visible(card, 10_000);
    await card.first().click();
    await visible(tid('map-card-post'));
    await tid('map-card-post').click();
    await visible(page.getByText('Comentários'));
  });

  // ---------------------------------------------------------------- lugar
  await check('página do lugar: nota, fotos, quem esteve, avaliar', async () => {
    await goto('/place/pl_praia_central');
    await visible(tid('place-rating'));
    expect((await text(tid('place-name'))) === 'Praia Central', 'nome');
    await visible(page.getByText('Fotos recentes'));
    await visible(page.getByText('Quem esteve aqui'));
    await visible(tid('visitor-u_marina'));
    const stars = page.getByLabel('5 estrelas');
    await stars.first().scrollIntoViewIfNeeded();
    await stars.first().click();
    await sleep(600);
    expect((await text(tid('place-my-rating'))).includes('5'), 'nota registrada');
    await shot(page, 'e2e-06-place');
  });

  // ---------------------------------------------------------------- criar publicação
  await check('criar publicação: foto → lugar → legenda com IA → publicar', async () => {
    await goto('/');
    await tid('tab-create').click();
    await visible(tid('new-demo'));
    await tid('new-demo').click();
    await visible(tid('compose-location'));
    expect((await text(tid('compose-location-title'))).includes('Em que lugar você está?'), 'começa sem localização');
    await tid('compose-location').click();
    await visible(tid('picker-search'));
    await tid('picker-search').fill('laranjeiras');
    await visible(tid('picker-place-pl_laranjeiras'));
    await tid('picker-place-pl_laranjeiras').click();
    await sleep(600);
    expect((await text(tid('compose-location-title'))).includes('Praia de Laranjeiras'), 'lugar escolhido');
    await tid('compose-ai').click();
    await visible(tid('ai-casual'), 6000);
    await shot(page, 'e2e-07-compose-ai');
    await tid('ai-casual').click();
    const caption = await tid('compose-caption').inputValue();
    expect(caption.length > 5 && caption.includes('Laranjeiras'), `legenda da IA: "${caption}"`);
    await tid('compose-publish').click();
    await visible(tid('toast'), 8000);
    await sleep(600);
  });

  await check('a publicação nova aparece no perfil (11 posts) e no mapa', async () => {
    await goto('/profile');
    await sleep(800);
    expect((await text(tid('stat-posts'))).startsWith('11'), `posts: ${await text(tid('stat-posts'))}`);
  });

  await check('excluir a localização de uma publicação', async () => {
    await goto('/');
    await page.getByText('Explorar', { exact: true }).first().click();
    await sleep(800);
    const menu = page.getByTestId(/^post-po_.*-menu$/).first();
    await visible(menu);
    await menu.click();
    await visible(tid('post-remove-location'));
    await tid('post-remove-location').click();
    await sleep(800);
    expect((await page.getByText('Sem localização').count()) > 0, 'post ficou sem localização');
  });

  // ---------------------------------------------------------------- seguir / privacidade
  await check('perfil privado (Ana): conteúdo oculto e pedido pendente', async () => {
    await goto('/user/u_ana');
    await visible(page.getByText('Esta conta é privada'));
    expect((await text(tid('follow-button'))).includes('Solicitado'), 'botão "Solicitado"');
    expect((await page.getByTestId(/^grid-/).count()) === 0, 'sem fotos visíveis');
  });

  await check('seguir e deixar de seguir um perfil público', async () => {
    await goto('/user/u_ana');
    await goto('/search');
    await tid('search-input').fill('trilhas');
    await visible(tid('person-u_gabriel'));
    await tid('person-u_gabriel').click();
    await visible(tid('follow-button'));
    expect((await text(tid('follow-button'))).includes('Seguindo'), 'já segue o Gabriel');
    await tid('follow-button').click();
    await sleep(600);
    expect((await text(tid('follow-button'))).includes('Seguir'), 'voltou a "Seguir"');
    await tid('follow-button').click();
    await sleep(600);
    expect((await text(tid('follow-button'))).includes('Seguindo'), 'seguindo de novo');
  });

  // ---------------------------------------------------------------- busca
  await check('busca por cidade: lugares, publicações, pessoas e mapa', async () => {
    await goto('/search');
    await tid('search-input').fill('Balneário Camboriú');
    await visible(tid('city-hub'), 8000);
    await visible(page.getByText('Lugares populares'));
    await visible(page.getByText('Publicações recentes'));
    await visible(page.getByText('Pessoas', { exact: false }));
    await visible(tid('city-hub-map'));
    await shot(page, 'e2e-08-search-city');
    await tid('hub-place-pl_praia_central').click();
    await visible(tid('place-name'));
  });

  await check('busca acha pessoas, lugares e publicações', async () => {
    await goto('/search');
    await tid('search-input').fill('café');
    await sleep(900);
    await visible(tid('place-pl_cafe_colonial'));
    await tid('search-input').fill('marina');
    await visible(tid('person-u_marina'));
  });

  // ---------------------------------------------------------------- notificações
  await check('notificações: lista, marca como lidas', async () => {
    await goto('/notifications');
    await visible(tid('notif-like'));
    await visible(tid('notif-comment'));
    await visible(tid('notif-follow'));
    await sleep(2200);
    await goto('/');
    expect(!/\d/.test(await tid('feed-bell').innerText()), 'selo zerado');
    await shot(page, 'e2e-09-notifications');
  });

  await check('simular interação gera notificação nova', async () => {
    await goto('/settings');
    await tid('demo-simulate').click();
    await sleep(800);
    await visible(tid('toast'));
    await goto('/notifications');
    const n = await page.getByTestId(/^notif-/).count();
    expect(n >= 7, `esperava ≥7 notificações, vi ${n}`);
    await visible(page.getByText('Hoje', { exact: true }));
  });

}

if (on('trip')) {
  // ---------------------------------------------------------------- viagem
  await check('viagem: configurar, iniciar (simulação), registrar momento e parada', async () => {
    await goto('/trips');
    await tid('trip-start').click();
    await visible(tid('trip-begin'));
    await tid('trip-preset-joinville-jaragua').click();
    await shot(page, 'e2e-10-trip-new');
    await tid('trip-begin').click();
    await visible(tid('live-status'), 10_000);
    expect((await text(tid('live-status'))).includes('Viagem ativa'), '"Viagem ativa"');
    expect((await text(tid('live-sharing-label'))).includes('Compartilhando'), 'aviso de compartilhamento ativo');
    await sleep(5000);
    const t1 = await text(tid('live-time'));
    expect(/^\d\d:\d\d:\d\d$/.test(t1) && t1 !== '00:00:00', `cronômetro: ${t1}`);
    const d1 = await text(tid('live-distance'));
    expect(d1.includes('km') || d1.includes(' m'), `distância: ${d1}`);
    await shot(page, 'e2e-11-trip-live');
    await tid('live-moment').click();
    await visible(tid('moment-demo'));
    await tid('moment-demo').click();
    await visible(tid('moment-caption'));
    await tid('moment-caption').fill('Parada para o café');
    await tid('moment-save').click();
    await sleep(900);
    await tid('live-stop').click();
    await sleep(600);
    expect((await text(tid('live-stops'))) === '1', `paradas: ${await text(tid('live-stops'))}`);
  });

  await check('viagem: parar de compartilhar deixa claro que só o usuário vê', async () => {
    await tid('live-toggle-share').click();
    await sleep(700);
    expect(!(await text(tid('live-sharing-label'))).includes('Compartilhando'), 'rótulo mudou');
  });

  await check('viagem: aparece ativa na aba Viagens e sai do mapa dos outros', async () => {
    await tid('live-minimize').click();
    await sleep(800);
    await goto('/trips');
    await visible(tid('trip-active-card'));
  });

  await check('viagem: finalizar gera o resumo com estatísticas', async () => {
    await tid('trip-active-card').click();
    await visible(tid('live-finish'));
    await sleep(9000);
    await tid('live-finish').click();
    await visible(tid('live-finish-confirm'));
    await tid('live-finish-confirm').click();
    await visible(tid('trip-title'), 15_000);
    await sleep(1200);
    expect((await text(tid('trip-title'))).includes('Joinville'), 'título com a origem');
    expect((await text(tid('trip-stat-photos'))).startsWith('1'), `fotos: ${await text(tid('trip-stat-photos'))}`);
    expect((await text(tid('trip-stat-stops'))).startsWith('1') || (await text(tid('trip-stat-stops'))).startsWith('2'), 'paradas');
    const km = parseFloat((await text(tid('trip-stat-distance'))).replace(',', '.'));
    expect(km > 3, `distância ${km}`);
    await visible(tid('trip-summary-text'));
    await shot(page, 'e2e-12-trip-summary');
  });

  await check('viagem concluída aparece em "Minhas viagens" e no perfil', async () => {
    await goto('/profile');
    await page.getByText('Viagens', { exact: true }).last().click();
    await sleep(800);
    await visible(page.getByText('Joinville → '));
  });

}

if (on('profile')) {
  // ---------------------------------------------------------------- perfil, conquistas, configurações
  await check('perfil: abas Publicações | Viagens | Lugares com mapa dos lugares', async () => {
    await goto('/profile');
    await visible(tid('profile-name'));
    await page.getByText('Lugares', { exact: true }).last().click();
    await visible(tid('profile-places-map'));
    await shot(page, 'e2e-13-profile-places');
  });

  await check('conquistas: 5 cidades e primeira viagem desbloqueadas', async () => {
    await goto('/achievements');
    await visible(tid('ach-row-five_cities'));
    expect((await tid('ach-row-five_cities').innerText()).includes('CONQUISTADA'), '5 cidades');
    expect((await tid('ach-row-first_trip').innerText()).includes('CONQUISTADA'), 'primeira viagem');
    await shot(page, 'e2e-14-achievements');
  });

  await check('configurações: perfil privado liga/desliga e sair da conta', async () => {
    await goto('/settings');
    await page.getByLabel('Perfil privado').first().click({ force: true });
    await sleep(600);
    await goto('/profile');
    await visible(page.locator('[data-testid="profile-name"]'));
    await goto('/settings');
    await page.getByLabel('Perfil privado').first().click({ force: true });
    await sleep(400);
    await tid('logout').click();
    await visible(tid('welcome-signup'), 8000);
  });

  // ---------------------------------------------------------------- cadastro de uma conta nova
  await check('cadastro: conta nova começa privada por padrão e vê o feed de exploração', async () => {
    await tid('welcome-signup').click();
    await tid('signup-name').fill('Camila Teste');
    await tid('signup-username').fill('camila.teste');
    await tid('signup-email').fill('camila@teste.dev');
    await tid('signup-password').fill('segredo123');
    await tid('signup-submit').click();
    await visible(page.getByText('Seu feed está vazio'), 15_000);
    await page.getByText('Explorar publicações').click();
    await visible(tid('post-po_p01'));
    await sleep(500);
    await goto('/settings');
    await visible(page.getByText('Perfil privado'));
    await shot(page, 'e2e-15-new-user-settings');
  });

}

await browser.close();

const noisy = logs.filter((l) => !/useNativeDriver|Download the React DevTools|shadow\*|deprecated/i.test(l));
if (noisy.length) console.log('\nAvisos/erros do console:\n' + [...new Set(noisy)].slice(0, 12).join('\n'));
console.log(`\n${step - failures.length}/${step} verificações passaram.`);
if (failures.length) {
  console.log('\nFalhas:\n- ' + failures.join('\n- '));
  process.exit(1);
}
