/**
 * Modelo de domínio do WaySocial.
 *
 * Estes tipos são o contrato entre a UI e a camada de dados (`WayRepository`).
 * Tanto o `MockRepository` (dados de demonstração) quanto o `SupabaseRepository`
 * devolvem exatamente estas formas — a UI nunca sabe de onde o dado veio.
 */

export type ID = string;
export type ISODate = string;

// --- Perfil & social ---------------------------------------------------------------------

export type TripVisibility = 'public' | 'followers' | 'private';
/** Relação do usuário logado com outro perfil. */
export type FollowState = 'none' | 'following' | 'requested';

export interface Profile {
  id: ID;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl?: string | null;
  /** Semente do avatar gerado (iniciais + gradiente) quando não há foto. */
  avatarSeed: number;
  /** Perfil privado: só seguidores aprovados veem publicações e viagens. */
  isPrivate: boolean;
  homeCity?: string | null;
  /** Visibilidade padrão ao começar uma viagem. */
  defaultTripVisibility: TripVisibility;
  /** Se `false`, novas publicações começam SEM localização. */
  shareLocationByDefault: boolean;
  createdAt: ISODate;
}

export type ProfilePreview = Pick<
  Profile,
  'id' | 'username' | 'displayName' | 'avatarUrl' | 'avatarSeed' | 'isPrivate'
>;

export interface ProfileStats {
  posts: number;
  trips: number;
  places: number;
  followers: number;
  following: number;
}

// --- Mídia -------------------------------------------------------------------------------

export type SceneKind = 'beach' | 'sunset' | 'mountain' | 'city' | 'food' | 'park' | 'night' | 'viewpoint';

/** Ilustração procedural usada nos dados de demonstração (sem fotos de terceiros). */
export interface SceneSpec {
  kind: SceneKind;
  seed: number;
  variant?: 'day' | 'golden' | 'dusk' | 'night';
  skyline?: boolean;
}

export interface Media {
  id: ID;
  type: 'image' | 'video';
  /** URL pública (Supabase Storage) ou URI local do aparelho. */
  uri?: string | null;
  /** Presente nos dados de demonstração no lugar de `uri`. */
  scene?: SceneSpec | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
}

// --- Lugares -----------------------------------------------------------------------------

export type PlaceKind = 'city' | 'place' | 'event';
export type PlaceCategory =
  | 'city'
  | 'beach'
  | 'restaurant'
  | 'cafe'
  | 'bar'
  | 'park'
  | 'viewpoint'
  | 'landmark'
  | 'shop'
  | 'event';

export interface Place {
  id: ID;
  kind: PlaceKind;
  category: PlaceCategory;
  name: string;
  cityName: string;
  cityId?: ID | null;
  lat: number;
  lng: number;
  address?: string | null;
  description?: string | null;
  scene: SceneSpec;
  ratingAvg: number;
  ratingCount: number;
  /** Eventos têm janela de tempo. */
  startsAt?: ISODate | null;
  endsAt?: ISODate | null;
}

export type PlaceRef = Pick<Place, 'id' | 'name' | 'cityName' | 'category'>;

/** "Pulso" do lugar: o que está acontecendo ali agora. */
export interface PlacePulse {
  placeId: ID;
  postsToday: number;
  peopleNow: number;
  lastPost?: { authorName: string; createdAt: ISODate } | null;
}

export interface PlaceReview {
  id: ID;
  placeId: ID;
  author: ProfilePreview;
  stars: number;
  text?: string | null;
  createdAt: ISODate;
}

// --- Publicações -------------------------------------------------------------------------

/**
 * Quão precisa é a localização gravada na publicação:
 * - `place`  → coordenadas do lugar escolhido (padrão — nunca a posição exata do usuário)
 * - `exact`  → posição atual do usuário, escolhida explicitamente
 * - `approx` → posição atual arredondada (~1 km)
 * - `none`   → sem localização
 */
export type LocationPrecision = 'place' | 'exact' | 'approx' | 'none';

export interface PostView {
  id: ID;
  author: ProfilePreview;
  caption: string;
  createdAt: ISODate;
  place?: PlaceRef | null;
  lat?: number | null;
  lng?: number | null;
  precision: LocationPrecision;
  media: Media[];
  tripId?: ID | null;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
}

export interface CommentView {
  id: ID;
  postId: ID;
  author: ProfilePreview;
  text: string;
  createdAt: ISODate;
}

export interface NewPostInput {
  media: Omit<Media, 'id'>[];
  caption: string;
  placeId?: ID | null;
  /** Posição do aparelho — só é gravada se `precision` for `exact`/`approx`. */
  deviceLocation?: { lat: number; lng: number } | null;
  precision: LocationPrecision;
  tripId?: ID | null;
}

// --- Viagens -----------------------------------------------------------------------------

export type TripStatus = 'active' | 'finished';

export interface TripPoint {
  lat: number;
  lng: number;
  t: ISODate;
  speed?: number | null;
  accuracy?: number | null;
  kind: 'track' | 'stop';
}

export interface TripMoment {
  id: ID;
  tripId: ID;
  media: Media;
  caption?: string | null;
  lat: number;
  lng: number;
  takenAt: ISODate;
  postId?: ID | null;
}

export interface Trip {
  id: ID;
  owner: ProfilePreview;
  title: string;
  status: TripStatus;
  visibility: TripVisibility;
  /** Compartilhamento ao vivo ativo (posição visível no mapa para quem pode ver). */
  shareLive: boolean;
  /** Deslocamento simulado (modo demonstração) em vez do GPS. */
  simulated: boolean;
  originName: string;
  destinationName?: string | null;
  plannedDestination?: string | null;
  startedAt: ISODate;
  endedAt?: ISODate | null;
  distanceM: number;
  durationS: number;
  stopCount: number;
  photoCount: number;
  videoCount: number;
  summary?: string | null;
  lastLat?: number | null;
  lastLng?: number | null;
  lastPointAt?: ISODate | null;
  /** Trajeto simplificado (≤ ~48 pontos) para miniaturas — o trajeto completo vem em `TripDetail.points`. */
  routePreview?: { lat: number; lng: number }[];
}

export interface TripDetail extends Trip {
  points: TripPoint[];
  moments: TripMoment[];
}

export interface StartTripInput {
  plannedDestination?: string | null;
  visibility: TripVisibility;
  shareLive: boolean;
  simulated: boolean;
  origin: { lat: number; lng: number };
  originName: string;
}

export interface FinishTripInput {
  tripId: ID;
  points: TripPoint[];
  destinationName?: string | null;
  summary?: string | null;
  durationS: number;
  distanceM: number;
}

// --- Mapa --------------------------------------------------------------------------------

export type MapItem =
  /** A publicação mais recente do local; `count` = quantas publicações recentes há ali. */
  | { type: 'post'; id: ID; lat: number; lng: number; post: PostView; count: number; pulse?: PlacePulse | null }
  | { type: 'place'; id: ID; lat: number; lng: number; place: Place; pulse: PlacePulse }
  | { type: 'event'; id: ID; lat: number; lng: number; place: Place; pulse: PlacePulse }
  | { type: 'live'; id: ID; lat: number; lng: number; trip: Trip };

export type MapFilter = 'all' | 'posts' | 'places' | 'food' | 'events' | 'trips';

// --- Busca -------------------------------------------------------------------------------

export interface SearchResults {
  query: string;
  cities: Place[];
  places: Place[];
  people: ProfilePreview[];
  posts: PostView[];
  /** Quando a busca bate com uma cidade, resumo para a "página da cidade". */
  cityHub?: { city: Place; topPlaces: Place[]; recentPosts: PostView[]; people: ProfilePreview[] } | null;
}

// --- Notificações ------------------------------------------------------------------------

export type NotificationType = 'like' | 'comment' | 'follow' | 'follow_request' | 'follow_accepted' | 'save';

export interface NotificationView {
  id: ID;
  type: NotificationType;
  actor: ProfilePreview;
  createdAt: ISODate;
  read: boolean;
  post?: { id: ID; media?: Media | null } | null;
  commentText?: string | null;
  /** Para `follow_request`: ainda pendente? */
  pending?: boolean;
}

// --- Conquistas --------------------------------------------------------------------------

export type AchievementId =
  | 'first_post'
  | 'first_place'
  | 'first_trip'
  | 'ten_places_photographed'
  | 'five_cities'
  | 'streak_7'
  | 'ten_beaches';

export interface AchievementDef {
  id: AchievementId;
  title: string;
  description: string;
  emoji: string;
  goal: number;
}

export interface AchievementProgress extends AchievementDef {
  progress: number;
  unlocked: boolean;
  unlockedAt?: ISODate | null;
}

/** Métricas de atividade de um usuário, das quais as conquistas são derivadas. */
export interface ActivityMetrics {
  postCount: number;
  distinctPlaces: number;
  distinctCities: number;
  distinctBeaches: number;
  finishedTrips: number;
  /** Maior sequência atual de dias consecutivos com publicação, terminando hoje ou ontem. */
  currentStreakDays: number;
}
