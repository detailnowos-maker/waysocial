/**
 * Dados de demonstração do WaySocial: 5 usuários, 6 cidades, ~35 lugares, ~40 publicações,
 * viagens concluídas e viagens "ao vivo". Tudo é gerado de forma determinística a partir de `now`,
 * então o app sempre abre com conteúdo "de agora" (há 5 min, hoje, ao vivo...).
 *
 * Nomes de estabelecimentos são FICTÍCIOS. Cidades, praias e pontos turísticos usam nomes reais
 * apenas como referência geográfica; notas e números são dados de demonstração.
 */
import { DEMO_PASSWORD, mockDigest } from './digest';
import { DB_VERSION, type MockDb, type StoredNotification, type StoredPlace, type StoredPost, type StoredTrip } from './db';
import { tripSummaryText } from '@/domain/tripSummary';
import { totalDistance } from '@/domain/tripStats';
import type {
  Media,
  PlaceCategory,
  Profile,
  SceneKind,
  SceneSpec,
  TripMoment,
  TripPoint,
  TripVisibility,
} from '@/domain/types';
import { CITY_COORDS, ROADS, buildRoute, concatRoutes, reverseRoute } from '@/lib/demoGeography';
import { type LatLng, haversine, pathLength } from '@/lib/geo';
import { hashString, mulberry32 } from '@/lib/random';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

export const U = {
  lucas: 'u_lucas',
  marina: 'u_marina',
  pedro: 'u_pedro',
  ana: 'u_ana',
  gabriel: 'u_gabriel',
} as const;

export const DEMO_EMAILS: Record<string, string> = {
  [U.lucas]: 'lucas@waysocial.demo',
  [U.marina]: 'marina@waysocial.demo',
  [U.pedro]: 'pedro@waysocial.demo',
  [U.ana]: 'ana@waysocial.demo',
  [U.gabriel]: 'gabriel@waysocial.demo',
};

const iso = (ms: number) => new Date(ms).toISOString();

// --- Cidades e lugares ----------------------------------------------------------------------

const CITY_NAME = {
  city_jaragua: 'Jaraguá do Sul',
  city_joinville: 'Joinville',
  city_blumenau: 'Blumenau',
  city_bc: 'Balneário Camboriú',
  city_floripa: 'Florianópolis',
  city_curitiba: 'Curitiba',
} as const;
type CityId = keyof typeof CITY_NAME;

const CITY_LATLNG: Record<CityId, LatLng> = {
  city_jaragua: CITY_COORDS.jaragua,
  city_joinville: CITY_COORDS.joinville,
  city_blumenau: CITY_COORDS.blumenau,
  city_bc: CITY_COORDS.bc,
  city_floripa: CITY_COORDS.floripa,
  city_curitiba: CITY_COORDS.curitiba,
};

const CITY_SCENE: Record<CityId, Omit<SceneSpec, 'seed'>> = {
  city_jaragua: { kind: 'mountain', variant: 'golden' },
  city_joinville: { kind: 'park', variant: 'day' },
  city_blumenau: { kind: 'city', variant: 'dusk' },
  city_bc: { kind: 'beach', variant: 'golden', skyline: true },
  city_floripa: { kind: 'viewpoint', variant: 'golden' },
  city_curitiba: { kind: 'sunset', variant: 'dusk' },
};

const SCENE_OF_CATEGORY: Record<PlaceCategory, SceneKind> = {
  city: 'city',
  beach: 'beach',
  restaurant: 'food',
  cafe: 'food',
  bar: 'night',
  park: 'park',
  viewpoint: 'viewpoint',
  landmark: 'city',
  shop: 'food',
  event: 'night',
};

interface PlaceSpec {
  id: string;
  city: CityId;
  category: PlaceCategory;
  name: string;
  lat: number;
  lng: number;
  desc: string;
  rating: [avg: number, count: number];
  /** [pessoas agora, publicações hoje] "de fora" dos 5 usuários fictícios. */
  ambient: [number, number];
  variant?: SceneSpec['variant'];
  skyline?: boolean;
  event?: true;
}

const PLACE_SPECS: PlaceSpec[] = [
  // Jaraguá do Sul
  { id: 'pl_boa_vista', city: 'city_jaragua', category: 'viewpoint', name: 'Mirante do Morro da Boa Vista', lat: -26.4655, lng: -49.061, desc: 'Vista panorâmica do vale. Melhor ao nascer do sol.', rating: [4.8, 412], ambient: [3, 4], variant: 'golden' },
  { id: 'pl_parque_aguas', city: 'city_jaragua', category: 'park', name: 'Parque das Águas', lat: -26.492, lng: -49.087, desc: 'Lagos, pista de caminhada e muito verde no meio da cidade.', rating: [4.5, 268], ambient: [4, 3] },
  { id: 'pl_nonna_rosa', city: 'city_jaragua', category: 'restaurant', name: 'Cantina Nonna Rosa', lat: -26.488, lng: -49.07, desc: 'Massas caseiras e molho de receita de família.', rating: [4.6, 190], ambient: [6, 2] },
  { id: 'pl_cafe_ponte', city: 'city_jaragua', category: 'cafe', name: 'Café da Ponte', lat: -26.484, lng: -49.064, desc: 'Cafés especiais e tortas, perto do rio.', rating: [4.4, 121], ambient: [2, 1] },
  { id: 'pl_praca_matriz', city: 'city_jaragua', category: 'landmark', name: 'Praça da Matriz', lat: -26.4862, lng: -49.0673, desc: 'O coração do centro de Jaraguá do Sul.', rating: [4.3, 98], ambient: [3, 1] },
  // Joinville
  { id: 'pl_rua_palmeiras', city: 'city_joinville', category: 'landmark', name: 'Rua das Palmeiras', lat: -26.301, lng: -48.846, desc: 'Alameda de palmeiras imperiais no centro de Joinville.', rating: [4.7, 540], ambient: [5, 3], variant: 'golden' },
  { id: 'pl_bierhaus', city: 'city_joinville', category: 'bar', name: 'Bierhaus Joinville', lat: -26.306, lng: -48.842, desc: 'Cervejas artesanais e petiscos alemães.', rating: [4.5, 233], ambient: [7, 2], variant: 'night' },
  { id: 'pl_zoobotanico', city: 'city_joinville', category: 'park', name: 'Parque Zoobotânico', lat: -26.335, lng: -48.82, desc: 'Trilhas curtas em mata atlântica preservada.', rating: [4.6, 310], ambient: [3, 2] },
  { id: 'pl_mercado_jlle', city: 'city_joinville', category: 'shop', name: 'Mercado Público de Joinville', lat: -26.303, lng: -48.85, desc: 'Frutas, queijos e banquinhas de comida típica.', rating: [4.2, 144], ambient: [4, 1] },
  // Blumenau
  { id: 'pl_vila_germanica', city: 'city_blumenau', category: 'landmark', name: 'Vila Germânica', lat: -26.904, lng: -49.088, desc: 'Parque temático com arquitetura alemã e grandes festivais.', rating: [4.7, 1820], ambient: [9, 6] },
  { id: 'pl_festival_outono', city: 'city_blumenau', category: 'event', name: 'Festival de Outono · Vila Germânica', lat: -26.9035, lng: -49.0875, desc: 'Música ao vivo, chope e gastronomia durante todo o festival.', rating: [4.6, 760], ambient: [31, 9], variant: 'night', event: true },
  { id: 'pl_rua_xv_blu', city: 'city_blumenau', category: 'landmark', name: 'Rua XV de Novembro', lat: -26.9195, lng: -49.0655, desc: 'Calçadão central com cafés, lojas e muita história.', rating: [4.4, 402], ambient: [6, 2] },
  { id: 'pl_cafe_colonial', city: 'city_blumenau', category: 'cafe', name: 'Café Colonial Haus', lat: -26.912, lng: -49.07, desc: 'Café colonial completo, com pães e geleias da casa.', rating: [4.8, 521], ambient: [8, 3] },
  { id: 'pl_hortensias', city: 'city_blumenau', category: 'park', name: 'Parque das Hortênsias', lat: -26.915, lng: -49.06, desc: 'Jardim com milhares de hortênsias e mirante para o rio.', rating: [4.6, 177], ambient: [2, 1] },
  // Balneário Camboriú
  { id: 'pl_praia_central', city: 'city_bc', category: 'beach', name: 'Praia Central', lat: -26.9935, lng: -48.627, desc: 'O cartão-postal de Balneário Camboriú: mar calmo e skyline.', rating: [4.7, 1284], ambient: [38, 9], variant: 'day', skyline: true },
  { id: 'pl_laranjeiras', city: 'city_bc', category: 'beach', name: 'Praia de Laranjeiras', lat: -27.025, lng: -48.599, desc: 'Mais tranquila, com deck e restaurantes à beira-mar.', rating: [4.6, 640], ambient: [14, 4], variant: 'golden' },
  { id: 'pl_praia_amores', city: 'city_bc', category: 'beach', name: 'Praia dos Amores', lat: -27.001, lng: -48.6, desc: 'Pequena, entre pedras, ótima para o fim de tarde.', rating: [4.5, 311], ambient: [6, 2], variant: 'golden' },
  { id: 'pl_molhe', city: 'city_bc', category: 'viewpoint', name: 'Molhe da Barra Sul', lat: -26.997, lng: -48.612, desc: 'Passeio sobre o mar com vista para a cidade.', rating: [4.5, 402], ambient: [8, 3], variant: 'golden' },
  { id: 'pl_mare_alta', city: 'city_bc', category: 'restaurant', name: 'Restaurante Maré Alta', lat: -26.989, lng: -48.632, desc: 'Frutos do mar frescos a duas quadras da praia.', rating: [4.5, 312], ambient: [11, 3] },
  { id: 'pl_bar_pescador', city: 'city_bc', category: 'bar', name: 'Bar do Pescador', lat: -26.996, lng: -48.629, desc: 'Petiscos de peixe e chope gelado, com música ao vivo.', rating: [4.3, 205], ambient: [9, 2], variant: 'night' },
  { id: 'pl_parque_raimundo', city: 'city_bc', category: 'park', name: 'Parque Raimundo Malta', lat: -26.991, lng: -48.636, desc: 'Parque urbano com pista de caminhada e áreas de descanso.', rating: [4.4, 187], ambient: [5, 1] },
  // Florianópolis
  { id: 'pl_praia_mole', city: 'city_floripa', category: 'beach', name: 'Praia Mole', lat: -27.603, lng: -48.435, desc: 'Ondas, jovens e pôr do sol dourado.', rating: [4.8, 2210], ambient: [22, 8], variant: 'golden' },
  { id: 'pl_joaquina', city: 'city_floripa', category: 'beach', name: 'Praia da Joaquina', lat: -27.629, lng: -48.449, desc: 'Dunas gigantes e surf de qualidade.', rating: [4.7, 1560], ambient: [18, 7], variant: 'golden' },
  { id: 'pl_campeche', city: 'city_floripa', category: 'beach', name: 'Praia do Campeche', lat: -27.676, lng: -48.472, desc: 'Mar azul-turquesa e vista para a Ilha do Campeche.', rating: [4.8, 980], ambient: [12, 5], variant: 'day' },
  { id: 'pl_ponte_hercilio', city: 'city_floripa', category: 'landmark', name: 'Ponte Hercílio Luz', lat: -27.5942, lng: -48.564, desc: 'Ponte pênsil que virou símbolo da cidade.', rating: [4.8, 1743], ambient: [10, 5], variant: 'golden' },
  { id: 'pl_lagoa', city: 'city_floripa', category: 'viewpoint', name: 'Lagoa da Conceição', lat: -27.605, lng: -48.463, desc: 'Lagoa cercada por dunas, bares e trilhas.', rating: [4.7, 1120], ambient: [15, 6], variant: 'golden' },
  { id: 'pl_casa_ostra', city: 'city_floripa', category: 'restaurant', name: 'Casa da Ostra', lat: -27.512, lng: -48.513, desc: 'Ostras frescas direto do cultivo, em Santo Antônio de Lisboa.', rating: [4.7, 366], ambient: [9, 3] },
  { id: 'pl_cafe_ilha', city: 'city_floripa', category: 'cafe', name: 'Café da Ilha', lat: -27.599, lng: -48.55, desc: 'Café de especialidade no centro histórico.', rating: [4.5, 240], ambient: [5, 2] },
  // Curitiba
  { id: 'pl_jardim_botanico', city: 'city_curitiba', category: 'park', name: 'Jardim Botânico', lat: -25.4425, lng: -49.2394, desc: 'Estufa de metal e jardins franceses, ícone de Curitiba.', rating: [4.8, 2610], ambient: [16, 6] },
  { id: 'pl_opera_arame', city: 'city_curitiba', category: 'landmark', name: 'Ópera de Arame', lat: -25.385, lng: -49.274, desc: 'Teatro de aço e vidro no meio da mata.', rating: [4.7, 1330], ambient: [7, 3], variant: 'golden' },
  { id: 'pl_mercado_cwb', city: 'city_curitiba', category: 'restaurant', name: 'Mercado Municipal de Curitiba', lat: -25.444, lng: -49.261, desc: 'Pastel, queijos, cafés e produtos de feira.', rating: [4.4, 890], ambient: [13, 4] },
  { id: 'pl_rua_flores', city: 'city_curitiba', category: 'landmark', name: 'Rua das Flores', lat: -25.43, lng: -49.271, desc: 'Calçadão central, o primeiro de Curitiba.', rating: [4.3, 640], ambient: [9, 2] },
  { id: 'pl_cervejaria_cwb', city: 'city_curitiba', category: 'bar', name: 'Cervejaria Batel', lat: -25.44, lng: -49.286, desc: 'Torneiras de cervejas artesanais no Batel.', rating: [4.5, 295], ambient: [10, 3], variant: 'night' },
];

function buildPlaces(now: number): StoredPlace[] {
  const cities: StoredPlace[] = (Object.keys(CITY_NAME) as CityId[]).map((cityId) => ({
    id: cityId,
    kind: 'city',
    category: 'city',
    name: CITY_NAME[cityId],
    cityName: CITY_NAME[cityId],
    cityId: null,
    lat: CITY_LATLNG[cityId].lat,
    lng: CITY_LATLNG[cityId].lng,
    address: 'Santa Catarina / Paraná · Brasil',
    description: `Descubra o que está acontecendo em ${CITY_NAME[cityId]}.`,
    scene: { ...CITY_SCENE[cityId], seed: hashString(cityId) },
    ratingAvg: 0,
    ratingCount: 0,
    baseRatingAvg: 0,
    baseRatingCount: 0,
    ambientPeople: 0,
    ambientPostsToday: 0,
  }));
  const places: StoredPlace[] = PLACE_SPECS.map((s) => {
    const isEvent = s.event === true;
    return {
      id: s.id,
      kind: isEvent ? 'event' : 'place',
      category: s.category,
      name: s.name,
      cityName: CITY_NAME[s.city],
      cityId: s.city,
      lat: s.lat,
      lng: s.lng,
      address: CITY_NAME[s.city],
      description: s.desc,
      scene: { kind: SCENE_OF_CATEGORY[s.category], seed: hashString(s.id), variant: s.variant ?? 'day', skyline: s.skyline },
      ratingAvg: s.rating[0],
      ratingCount: s.rating[1],
      baseRatingAvg: s.rating[0],
      baseRatingCount: s.rating[1],
      ambientPeople: s.ambient[0],
      ambientPostsToday: s.ambient[1],
      startsAt: isEvent ? iso(now - 2 * DAY) : null,
      endsAt: isEvent ? iso(now + 3 * DAY) : null,
    };
  });
  return [...cities, ...places];
}

// --- Perfis ---------------------------------------------------------------------------------

function buildProfiles(now: number): Profile[] {
  const base = { avatarUrl: null, shareLocationByDefault: false } as const;
  return [
    { ...base, id: U.lucas, username: 'lucas.viaja', displayName: 'Lucas Andrade', bio: 'Jaraguá do Sul · fins de semana no litoral 🌊\nCompartilhando o caminho, não só o destino.', avatarSeed: 11, isPrivate: false, homeCity: 'Jaraguá do Sul', defaultTripVisibility: 'followers', createdAt: iso(now - 200 * DAY) },
    { ...base, id: U.marina, username: 'marina.sc', displayName: 'Marina Costa', bio: 'Fotógrafa na Ilha da Magia 📷\nLuz dourada e ondas.', avatarSeed: 23, isPrivate: false, homeCity: 'Florianópolis', defaultTripVisibility: 'public', createdAt: iso(now - 320 * DAY) },
    { ...base, id: U.pedro, username: 'pedro.roda', displayName: 'Pedro Souza', bio: 'Curitiba · estrada, café e comida boa 🚗🍽️', avatarSeed: 37, isPrivate: false, homeCity: 'Curitiba', defaultTripVisibility: 'public', createdAt: iso(now - 150 * DAY) },
    { ...base, id: U.ana, username: 'ana.cafe', displayName: 'Ana Krause', bio: 'Blumenau ☕ Perfil privado — só aceito quem eu conheço.', avatarSeed: 41, isPrivate: true, homeCity: 'Blumenau', defaultTripVisibility: 'followers', createdAt: iso(now - 90 * DAY) },
    { ...base, id: U.gabriel, username: 'gabriel.trilhas', displayName: 'Gabriel Martins', bio: 'Joinville · trilhas, mirantes e chope depois 🥾🍺', avatarSeed: 59, isPrivate: false, homeCity: 'Joinville', defaultTripVisibility: 'followers', createdAt: iso(now - 240 * DAY) },
  ];
}

// --- Publicações ----------------------------------------------------------------------------

type When = { m: number } | { d: number; h: number; min?: number };

interface PostSpec {
  id: string;
  a: keyof typeof U;
  place?: string;
  when: When;
  caption: string;
  boost: number;
  extra?: number;
  video?: number;
  variant?: SceneSpec['variant'];
  /** Para publicações sem lugar: localização aproximada (região), ou nenhuma. */
  approx?: LatLng;
}

const POST_SPECS: PostSpec[] = [
  // Lucas
  { id: 'po_l01', a: 'lucas', place: 'pl_praia_central', when: { m: 25 }, caption: 'Dia incrível por aqui! ☀️ Mar calmo e céu aberto.', boost: 118 },
  { id: 'po_l02', a: 'lucas', place: 'pl_mare_alta', when: { d: 1, h: 12, min: 40 }, caption: 'Almoço com vista pro mar — o camarão aqui vale a viagem. 🍤', boost: 64 },
  { id: 'po_l03', a: 'lucas', place: 'pl_molhe', when: { d: 2, h: 18, min: 10 }, caption: 'Fim de tarde no molhe. Sem filtro, sem pressa.', boost: 142, variant: 'golden' },
  { id: 'po_l04', a: 'lucas', place: 'pl_boa_vista', when: { d: 4, h: 8, min: 5 }, caption: 'Acordar cedo compensa: Jaraguá vista de cima. 🌄', boost: 87, variant: 'golden' },
  { id: 'po_l05', a: 'lucas', place: 'pl_praia_central', when: { d: 5, h: 15, min: 30 }, caption: 'De volta à Praia Central. Nunca enjoa.', boost: 51 },
  { id: 'po_l06', a: 'lucas', place: 'pl_rua_palmeiras', when: { d: 6, h: 16, min: 20 }, caption: 'Caminhando pela Rua das Palmeiras — Joinville no outono é outra coisa.', boost: 39 },
  { id: 'po_l07', a: 'lucas', place: 'pl_vila_germanica', when: { d: 7, h: 19, min: 45 }, caption: 'Começou o festival! Chope, música e muita gente boa. 🍻', boost: 73, variant: 'night' },
  { id: 'po_l08', a: 'lucas', place: 'pl_praia_mole', when: { d: 9, h: 11, min: 10 }, caption: 'Mole sendo Mole. 🌊', boost: 96 },
  { id: 'po_l09', a: 'lucas', place: 'pl_joaquina', when: { d: 9, h: 16, min: 40 }, caption: 'Dunas da Joaquina no fim da tarde.', boost: 128, extra: 2, variant: 'golden' },
  { id: 'po_l10', a: 'lucas', place: 'pl_laranjeiras', when: { d: 12, h: 10, min: 25 }, caption: 'Laranjeiras: pé na areia e nenhuma pressa.', boost: 58 },
  // Marina
  { id: 'po_m01', a: 'marina', place: 'pl_ponte_hercilio', when: { m: 75 }, caption: 'A Hercílio Luz com luz de fim de tarde. Vale cada degrau.', boost: 212, variant: 'golden' },
  { id: 'po_m02', a: 'marina', place: 'pl_campeche', when: { m: 190 }, caption: 'Campeche hoje está de cartão-postal. Ilha ao fundo!', boost: 154 },
  { id: 'po_m03', a: 'marina', place: 'pl_lagoa', when: { d: 1, h: 17, min: 30 }, caption: 'Pôr do sol na Lagoa. Sempre o mesmo, sempre diferente.', boost: 176, variant: 'dusk' },
  { id: 'po_m04', a: 'marina', place: 'pl_casa_ostra', when: { d: 1, h: 13, min: 10 }, caption: 'Ostras fresquinhas em Santo Antônio de Lisboa 🦪', boost: 98 },
  { id: 'po_m05', a: 'marina', place: 'pl_joaquina', when: { d: 2, h: 9, min: 20 }, caption: 'Surf logo cedo na Joaquina.', boost: 133, video: 9_000 },
  { id: 'po_m06', a: 'marina', place: 'pl_cafe_ilha', when: { d: 3, h: 15 }, caption: 'Meu cantinho de revisar fotos: Café da Ilha ☕', boost: 47 },
  { id: 'po_m07', a: 'marina', place: 'pl_praia_mole', when: { d: 4, h: 10, min: 30 }, caption: 'Maré baixa na Mole.', boost: 82 },
  { id: 'po_m08', a: 'marina', place: 'pl_praia_central', when: { d: 6, h: 16 }, caption: 'Fim de semana em BC: skyline e mar.', boost: 109, extra: 1 },
  { id: 'po_m09', a: 'marina', when: { d: 2, h: 20, min: 15 }, caption: 'Domingo sem endereço. Só curtindo. (Publicação sem localização.)', boost: 31, variant: 'dusk' },
  // Pedro
  { id: 'po_p01', a: 'pedro', place: 'pl_mare_alta', when: { m: 5 }, caption: 'Almoço de fim de semana na Maré Alta 🦐', boost: 22 },
  { id: 'po_p02', a: 'pedro', place: 'pl_jardim_botanico', when: { m: 140 }, caption: 'Jardim Botânico numa manhã de céu limpo.', boost: 91, extra: 1 },
  { id: 'po_p03', a: 'pedro', place: 'pl_mercado_cwb', when: { d: 1, h: 12, min: 15 }, caption: 'Pastel de feira + caldo de cana. Curitiba entregando.', boost: 66 },
  { id: 'po_p04', a: 'pedro', place: 'pl_opera_arame', when: { d: 2, h: 16, min: 50 }, caption: 'Ópera de Arame — arquitetura que parece flutuar.', boost: 119, variant: 'golden' },
  { id: 'po_p05', a: 'pedro', place: 'pl_cervejaria_cwb', when: { d: 3, h: 20, min: 10 }, caption: 'Sexta de cerveja artesanal 🍺', boost: 43, variant: 'night' },
  { id: 'po_p06', a: 'pedro', place: 'pl_bierhaus', when: { d: 2, h: 14, min: 55 }, caption: 'Parada estratégica em Joinville a caminho do litoral.', boost: 36 },
  { id: 'po_p07', a: 'pedro', place: 'pl_rua_flores', when: { d: 5, h: 11 }, caption: 'Rua das Flores num sábado.', boost: 55 },
  { id: 'po_p08', a: 'pedro', place: 'pl_praia_central', when: { d: 8, h: 10, min: 15 }, caption: 'Primeira vez na Praia Central em anos. Mudou muito!', boost: 72 },
  { id: 'po_p09', a: 'pedro', when: { d: 2, h: 13, min: 5 }, caption: 'Estrada livre rumo ao litoral. 🚗 (Localização aproximada.)', boost: 28, approx: { lat: -26.63, lng: -48.69 } },
  // Ana (perfil privado)
  { id: 'po_a01', a: 'ana', place: 'pl_cafe_colonial', when: { m: 35 }, caption: 'Café colonial de domingo: mesa farta e conversa boa ☕🥐', boost: 61 },
  { id: 'po_a02', a: 'ana', place: 'pl_festival_outono', when: { m: 160 }, caption: 'O Festival de Outono tá lotado! 🍂', boost: 88, extra: 1, variant: 'night' },
  { id: 'po_a03', a: 'ana', place: 'pl_rua_xv_blu', when: { d: 1, h: 14, min: 20 }, caption: 'Rua XV com cheirinho de pão.', boost: 34 },
  { id: 'po_a04', a: 'ana', place: 'pl_hortensias', when: { d: 2, h: 10, min: 40 }, caption: 'Hortênsias em flor.', boost: 57 },
  { id: 'po_a05', a: 'ana', place: 'pl_vila_germanica', when: { d: 4, h: 18 }, caption: 'Entardecer na Vila Germânica.', boost: 45, variant: 'dusk' },
  // Gabriel
  { id: 'po_g01', a: 'gabriel', place: 'pl_zoobotanico', when: { m: 55 }, caption: 'Trilha curtinha, mata fechada e silêncio.', boost: 37 },
  { id: 'po_g02', a: 'gabriel', place: 'pl_boa_vista', when: { d: 1, h: 7, min: 30 }, caption: 'Nascer do sol no Mirante da Boa Vista.', boost: 104, video: 15_000, variant: 'golden' },
  { id: 'po_g03', a: 'gabriel', place: 'pl_bierhaus', when: { d: 2, h: 21 }, caption: 'Depois da trilha, o chope. 🍺', boost: 29, variant: 'night' },
  { id: 'po_g04', a: 'gabriel', place: 'pl_rua_palmeiras', when: { d: 3, h: 17, min: 15 }, caption: 'Palmeiras imperiais sob luz de fim de tarde.', boost: 41, variant: 'golden' },
  { id: 'po_g05', a: 'gabriel', place: 'pl_lagoa', when: { d: 5, h: 15, min: 20 }, caption: 'Fim de semana na Lagoa. Dunas de manhã, bar à tarde.', boost: 53 },
  { id: 'po_g06', a: 'gabriel', place: 'pl_festival_outono', when: { m: 90 }, caption: 'Festival de Outono — banda ao vivo agora!', boost: 69, variant: 'night' },
];

function whenMs(now: number, w: When): number {
  if ('m' in w) return now - w.m * MIN;
  const d = new Date(now);
  d.setDate(d.getDate() - w.d);
  d.setHours(w.h, w.min ?? 0, 0, 0);
  return d.getTime();
}

function mediaFor(spec: PostSpec, sceneKind: SceneKind, placeVariant: SceneSpec['variant'], skyline?: boolean): Media[] {
  const variant = spec.variant ?? placeVariant ?? 'day';
  const count = 1 + (spec.extra ?? 0);
  const out: Media[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: `${spec.id}_m${i + 1}`,
      type: 'image',
      scene: { kind: sceneKind, seed: hashString(`${spec.id}:${i}`), variant, skyline },
      width: 1080,
      height: 1350,
    });
  }
  if (spec.video) {
    out[0] = { ...out[0], type: 'video', durationMs: spec.video };
  }
  return out;
}

function buildPosts(now: number, places: StoredPlace[]): StoredPost[] {
  const byId = new Map(places.map((p) => [p.id, p]));
  return POST_SPECS.map((spec) => {
    const place = spec.place ? byId.get(spec.place) : undefined;
    const kind = place ? place.scene.kind : 'sunset';
    const media = mediaFor(spec, kind, place?.scene.variant, place?.scene.skyline);
    const hasApprox = !place && spec.approx;
    return {
      id: spec.id,
      authorId: U[spec.a],
      caption: spec.caption,
      createdAt: iso(whenMs(now, spec.when)),
      placeId: place?.id ?? null,
      lat: place ? place.lat : hasApprox ? spec.approx!.lat : null,
      lng: place ? place.lng : hasApprox ? spec.approx!.lng : null,
      precision: place ? 'place' : hasApprox ? 'approx' : 'none',
      media,
      tripId: null,
      demoLikeBoost: spec.boost,
    };
  });
}

// --- Viagens --------------------------------------------------------------------------------

interface TripSpec {
  id: string;
  owner: keyof typeof U;
  route: LatLng[];
  startMs: number;
  /** Duração total (inclui paradas), em segundos. */
  totalS: number;
  stops: { frac: number; durS: number }[];
  photos: number;
  videos: number;
  origin: string;
  destination: string;
  visibility: TripVisibility;
  sceneAt: (frac: number) => SceneKind;
}

function buildFinishedTrip(spec: TripSpec): { trip: StoredTrip; points: TripPoint[]; moments: TripMoment[] } {
  const { route } = spec;
  const total = pathLength(route);
  const stopTotal = spec.stops.reduce((a, s) => a + s.durS, 0);
  const movingS = Math.max(60, spec.totalS - stopTotal);
  const stopIdx = new Map<number, number>();
  for (const s of spec.stops) stopIdx.set(Math.round(s.frac * (route.length - 1)), s.durS);

  const points: TripPoint[] = [];
  let cum = 0;
  let pausedS = 0;
  for (let i = 0; i < route.length; i++) {
    if (i > 0) {
      cum += haversine(route[i - 1], route[i]);
    }
    const t = spec.startMs + ((cum / total) * movingS + pausedS) * 1000;
    const dur = stopIdx.get(i);
    points.push({
      lat: route[i].lat,
      lng: route[i].lng,
      t: iso(t),
      speed: i === 0 ? 0 : (total / movingS) * (0.85 + ((i * 37) % 30) / 100),
      accuracy: 8,
      kind: dur ? 'stop' : 'track',
    });
    if (dur) pausedS += dur;
  }

  const moments: TripMoment[] = [];
  const n = spec.photos + spec.videos;
  const videoSlots = new Set<number>();
  for (let v = 0; v < spec.videos; v++) videoSlots.add(Math.floor(((v + 0.5) * n) / Math.max(1, spec.videos)));
  for (let i = 0; i < n; i++) {
    const frac = (i + 0.7) / (n + 0.4);
    const idx = Math.min(points.length - 1, Math.round(frac * (points.length - 1)));
    const isVideo = videoSlots.has(i);
    moments.push({
      id: `${spec.id}_mo${i + 1}`,
      tripId: spec.id,
      media: {
        id: `${spec.id}_mo${i + 1}_m`,
        type: isVideo ? 'video' : 'image',
        scene: { kind: spec.sceneAt(frac), seed: hashString(`${spec.id}:mo:${i}`), variant: frac > 0.8 ? 'golden' : 'day' },
        durationMs: isVideo ? 8_000 + (i % 3) * 3_000 : null,
        width: 1080,
        height: 1350,
      },
      caption: null,
      lat: points[idx].lat,
      lng: points[idx].lng,
      takenAt: points[idx].t,
    });
  }

  const endMs = spec.startMs + spec.totalS * 1000;
  const distanceM = totalDistance(points);
  const trip: StoredTrip = {
    id: spec.id,
    ownerId: U[spec.owner],
    title: `${spec.origin} → ${spec.destination}`,
    status: 'finished',
    visibility: spec.visibility,
    shareLive: false,
    simulated: false,
    originName: spec.origin,
    destinationName: spec.destination,
    plannedDestination: spec.destination,
    startedAt: iso(spec.startMs),
    endedAt: iso(endMs),
    distanceM,
    durationS: spec.totalS,
    stopCount: spec.stops.length,
    photoCount: spec.photos,
    videoCount: spec.videos,
    summary: tripSummaryText({
      origin: spec.origin,
      destination: spec.destination,
      distanceM,
      durationS: spec.totalS,
      stopCount: spec.stops.length,
      momentCount: n,
    }),
    lastLat: points[points.length - 1].lat,
    lastLng: points[points.length - 1].lng,
    lastPointAt: iso(endMs),
    sim: null,
  };
  return { trip, points, moments };
}

interface LiveSpec {
  id: string;
  owner: keyof typeof U;
  route: LatLng[];
  speedMs: number;
  elapsedMin: number;
  origin: string;
  destination: string;
  visibility: TripVisibility;
  photos: number;
  stops: number;
}

function buildLiveTrip(spec: LiveSpec, now: number): { trip: StoredTrip; points: TripPoint[]; moments: TripMoment[] } {
  const startMs = now - spec.elapsedMin * MIN;
  const total = pathLength(spec.route);
  const progressM = Math.min(total - 1, spec.speedMs * spec.elapsedMin * 60);
  // pontos já percorridos
  const points: TripPoint[] = [];
  let acc = 0;
  for (let i = 0; i < spec.route.length && acc <= progressM; i++) {
    if (i > 0) acc += haversine(spec.route[i - 1], spec.route[i]);
    points.push({
      lat: spec.route[i].lat,
      lng: spec.route[i].lng,
      t: iso(startMs + (acc / spec.speedMs) * 1000),
      speed: spec.speedMs,
      accuracy: 8,
      kind: 'track',
    });
  }
  const last = points[points.length - 1];
  const moments: TripMoment[] = Array.from({ length: spec.photos }, (_, i) => {
    const p = points[Math.max(0, Math.floor(((i + 1) / (spec.photos + 1)) * (points.length - 1)))];
    return {
      id: `${spec.id}_mo${i + 1}`,
      tripId: spec.id,
      media: {
        id: `${spec.id}_mo${i + 1}_m`,
        type: 'image',
        scene: { kind: i % 2 === 0 ? 'sunset' : 'park', seed: hashString(`${spec.id}:${i}`), variant: 'day' },
        width: 1080,
        height: 1350,
      },
      caption: null,
      lat: p.lat,
      lng: p.lng,
      takenAt: p.t,
    };
  });
  const trip: StoredTrip = {
    id: spec.id,
    ownerId: U[spec.owner],
    title: `${spec.origin} → ${spec.destination}`,
    status: 'active',
    visibility: spec.visibility,
    shareLive: true,
    simulated: false,
    originName: spec.origin,
    destinationName: null,
    plannedDestination: spec.destination,
    startedAt: iso(startMs),
    endedAt: null,
    distanceM: acc,
    durationS: spec.elapsedMin * 60,
    stopCount: spec.stops,
    photoCount: spec.photos,
    videoCount: 0,
    summary: null,
    lastLat: last.lat,
    lastLng: last.lng,
    lastPointAt: last.t,
    sim: { route: spec.route, speedMs: spec.speedMs },
  };
  return { trip, points, moments };
}

// --- Montagem -------------------------------------------------------------------------------

/** Rota de exemplo do produto: Jaraguá do Sul → Balneário Camboriú (via Blumenau), ~128 km. */
export function jaraguaToBcRoute(): LatLng[] {
  return buildRoute(concatRoutes(ROADS.jaraguaBlumenau, ROADS.blumenauItajai, ROADS.itajaiBc), { seed: 7, targetLengthM: 128_000 });
}

export function buildSeed(now: number): MockDb {
  const profiles = buildProfiles(now);
  const places = buildPlaces(now);
  const posts = buildPosts(now, places);
  const rand = mulberry32(2026);
  const dayAt = (daysAgo: number, h: number, min = 0) => whenMs(now, { d: daysAgo, h, min });

  // Viagens concluídas
  const t1 = buildFinishedTrip({
    id: 'tr_lucas_bc',
    owner: 'lucas',
    route: jaraguaToBcRoute(),
    startMs: dayAt(3, 7, 10),
    totalS: 102 * 60,
    stops: [
      { frac: 0.41, durS: 540 },
      { frac: 0.72, durS: 360 },
    ],
    photos: 14,
    videos: 3,
    origin: 'Jaraguá do Sul',
    destination: 'Balneário Camboriú',
    visibility: 'public',
    sceneAt: (f) => (f < 0.22 ? 'mountain' : f < 0.5 ? 'city' : f < 0.82 ? 'sunset' : 'beach'),
  });
  const t2 = buildFinishedTrip({
    id: 'tr_marina_ilha',
    owner: 'marina',
    route: buildRoute(ROADS.floripaLoop, { seed: 3 }),
    startMs: dayAt(6, 15, 20),
    totalS: 85 * 60,
    stops: [
      { frac: 0.25, durS: 600 },
      { frac: 0.5, durS: 900 },
      { frac: 0.78, durS: 420 },
    ],
    photos: 8,
    videos: 1,
    origin: 'Santo Antônio de Lisboa',
    destination: 'Centro de Florianópolis',
    visibility: 'public',
    sceneAt: (f) => (f < 0.3 ? 'viewpoint' : f < 0.7 ? 'beach' : 'sunset'),
  });
  const t3 = buildFinishedTrip({
    id: 'tr_pedro_jlle',
    owner: 'pedro',
    route: buildRoute(ROADS.curitibaJoinville, { seed: 5 }),
    startMs: dayAt(2, 11, 30),
    totalS: 125 * 60,
    stops: [
      { frac: 0.35, durS: 480 },
      { frac: 0.8, durS: 600 },
    ],
    photos: 9,
    videos: 2,
    origin: 'Curitiba',
    destination: 'Joinville',
    visibility: 'public',
    sceneAt: (f) => (f < 0.4 ? 'city' : f < 0.75 ? 'mountain' : 'park'),
  });
  const t4 = buildFinishedTrip({
    id: 'tr_gabriel_jgua',
    owner: 'gabriel',
    route: buildRoute(reverseRoute(ROADS.jaraguaJoinville), { seed: 9 }),
    startMs: dayAt(4, 6, 30),
    totalS: 50 * 60,
    stops: [{ frac: 0.55, durS: 420 }],
    photos: 6,
    videos: 1,
    origin: 'Joinville',
    destination: 'Jaraguá do Sul',
    visibility: 'followers',
    sceneAt: (f) => (f < 0.5 ? 'park' : 'viewpoint'),
  });
  const t5 = buildFinishedTrip({
    id: 'tr_ana_cafe',
    owner: 'ana',
    route: buildRoute(ROADS.blumenauItajai, { seed: 11 }),
    startMs: dayAt(5, 9, 10),
    totalS: 75 * 60,
    stops: [{ frac: 0.5, durS: 900 }],
    photos: 5,
    videos: 0,
    origin: 'Blumenau',
    destination: 'Itajaí',
    visibility: 'private',
    sceneAt: () => 'food',
  });
  // Viagens ao vivo
  const live1 = buildLiveTrip(
    {
      id: 'tr_marina_live',
      owner: 'marina',
      route: buildRoute(ROADS.bcFloripa, { seed: 13 }),
      speedMs: 22,
      elapsedMin: 38,
      origin: 'Balneário Camboriú',
      destination: 'Florianópolis',
      visibility: 'public',
      photos: 3,
      stops: 1,
    },
    now,
  );
  const live2 = buildLiveTrip(
    {
      id: 'tr_gabriel_live',
      owner: 'gabriel',
      route: buildRoute(reverseRoute(ROADS.curitibaJoinville), { seed: 17 }),
      speedMs: 24,
      elapsedMin: 25,
      origin: 'Joinville',
      destination: 'Curitiba',
      visibility: 'followers',
      photos: 2,
      stops: 0,
    },
    now,
  );

  const built = [t1, t2, t3, t4, t5, live1, live2];
  const trips = built.map((b) => b.trip);
  const points = Object.fromEntries(built.map((b) => [b.trip.id, b.points]));
  const moments = built.flatMap((b) => b.moments);

  // Curtidas "reais" entre os 5 usuários (determinístico) + salvos
  const userIds = Object.values(U) as string[];
  const likes: { postId: string; userId: string }[] = [];
  for (const post of posts) {
    for (const uid of userIds) {
      if (uid === post.authorId) continue;
      if (rand() < 0.55) likes.push({ postId: post.id, userId: uid });
    }
  }
  const saves = [
    { postId: 'po_m01', userId: U.lucas },
    { postId: 'po_p04', userId: U.lucas },
    { postId: 'po_g02', userId: U.lucas },
    { postId: 'po_l01', userId: U.marina },
    { postId: 'po_l03', userId: U.pedro },
  ];

  const c = (id: string, postId: string, who: keyof typeof U, text: string, ago: number) => ({
    id,
    postId,
    authorId: U[who],
    text,
    createdAt: iso(now - ago * MIN),
  });
  const comments = [
    c('c01', 'po_l01', 'marina', 'Esse mar tá um sonho! 😍', 20),
    c('c02', 'po_l01', 'pedro', 'Que lugar lindo! Preciso voltar aí.', 18),
    c('c03', 'po_l01', 'gabriel', 'Anotado pro próximo fim de semana.', 9),
    c('c04', 'po_l02', 'pedro', 'Camarão na Maré Alta é covardia 😅', 1_200),
    c('c05', 'po_l02', 'marina', 'Anotando a dica!', 1_100),
    c('c06', 'po_l03', 'marina', 'Essa luz!!', 2_700),
    c('c07', 'po_m01', 'lucas', 'Uma das minhas fotos favoritas da ponte.', 60),
    c('c08', 'po_m01', 'pedro', 'Que foto, Marina.', 50),
    c('c09', 'po_m02', 'gabriel', 'Campeche é outro nível.', 150),
    c('c10', 'po_p01', 'lucas', 'Boa escolha! Já pediu a moqueca?', 3),
    c('c11', 'po_p01', 'marina', 'Saudade da Maré Alta!', 2),
    c('c12', 'po_p02', 'marina', 'Jardim Botânico de manhã é perfeito.', 110),
    c('c13', 'po_g01', 'lucas', 'Qual trilha é essa? Quero ir.', 30),
    c('c14', 'po_g01', 'gabriel', 'É a do Zoobotânico, 40 min de ida.', 20),
    c('c15', 'po_g02', 'lucas', 'Nascer do sol lindo!', 1_300),
    c('c16', 'po_g02', 'marina', '🔥🔥', 1_250),
    c('c17', 'po_a01', 'marina', 'Que mesa!', 20),
    c('c18', 'po_a02', 'pedro', 'Vou aí no fim de semana!', 100),
    c('c19', 'po_l09', 'marina', 'Joaquina de tarde é o melhor horário.', 12_000),
    c('c20', 'po_m05', 'lucas', 'Que onda! 🤙', 2_800),
  ];

  // Seguidores
  const f = (a: keyof typeof U, b: keyof typeof U, status: 'accepted' | 'pending' = 'accepted', ago = 30 * 1440) => ({
    followerId: U[a],
    followeeId: U[b],
    status,
    createdAt: iso(now - ago * MIN),
  });
  const follows = [
    f('lucas', 'marina'), f('lucas', 'pedro'), f('lucas', 'gabriel'), f('lucas', 'ana', 'pending', 60),
    f('marina', 'lucas'), f('pedro', 'lucas'), f('gabriel', 'lucas', 'accepted', 180), f('ana', 'lucas', 'accepted', 1440),
    f('marina', 'pedro'), f('marina', 'gabriel'), f('marina', 'ana'),
    f('pedro', 'marina'), f('pedro', 'ana'), f('gabriel', 'marina'), f('gabriel', 'pedro'),
    f('ana', 'marina'), f('ana', 'pedro'),
  ];

  const reviews = [
    { id: 'rv01', placeId: 'pl_praia_central', userId: U.marina, stars: 5, text: 'Mar de manhã cedo é perfeito.', createdAt: iso(now - 2 * DAY) },
    { id: 'rv02', placeId: 'pl_praia_central', userId: U.pedro, stars: 4, text: 'Lotada no fim de semana, mas vale.', createdAt: iso(now - 5 * DAY) },
    { id: 'rv03', placeId: 'pl_mare_alta', userId: U.pedro, stars: 5, text: 'Camarão impecável. Espera de uns 20 min.', createdAt: iso(now - 1 * DAY) },
    { id: 'rv04', placeId: 'pl_praia_mole', userId: U.lucas, stars: 5, text: null, createdAt: iso(now - 9 * DAY) },
    { id: 'rv05', placeId: 'pl_jardim_botanico', userId: U.marina, stars: 5, text: 'Estufa linda em qualquer horário.', createdAt: iso(now - 12 * DAY) },
    { id: 'rv06', placeId: 'pl_boa_vista', userId: U.gabriel, stars: 5, text: 'Subida curta, vista enorme.', createdAt: iso(now - 1 * DAY) },
  ];

  const n = (
    id: string,
    type: StoredNotification['type'],
    actor: keyof typeof U,
    ago: number,
    extra: Partial<StoredNotification> = {},
  ): StoredNotification => ({
    id,
    userId: U.lucas,
    type,
    actorId: U[actor],
    postId: null,
    commentText: null,
    createdAt: iso(now - ago * MIN),
    read: false,
    pending: false,
    ...extra,
  });
  const notifications: StoredNotification[] = [
    n('n01', 'like', 'marina', 12, { postId: 'po_l01' }),
    n('n02', 'comment', 'pedro', 18, { postId: 'po_l01', commentText: 'Que lugar lindo! Preciso voltar aí.' }),
    n('n03', 'follow', 'gabriel', 180),
    n('n04', 'save', 'marina', 300, { postId: 'po_l03', read: true }),
    n('n05', 'follow', 'ana', 1440, { read: true }),
    n('n06', 'like', 'pedro', 1500, { postId: 'po_l02', read: true }),
  ];

  const credentials = userIds.map((uid) => ({
    email: DEMO_EMAILS[uid],
    digest: mockDigest(DEMO_EMAILS[uid], DEMO_PASSWORD),
    userId: uid,
  }));

  return {
    version: DB_VERSION,
    seedAt: now,
    touchedAt: now,
    profiles,
    places,
    posts,
    comments,
    likes,
    saves,
    follows,
    reviews,
    savedPlaces: [{ placeId: 'pl_praia_mole', userId: U.lucas }],
    trips,
    points,
    moments,
    notifications,
    unlocked: {},
    credentials,
  };
}
