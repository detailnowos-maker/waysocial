import type { LatLng } from '@/lib/geo';
import type {
  AchievementProgress,
  CommentView,
  FinishTripInput,
  FollowState,
  ID,
  ISODate,
  MapFilter,
  MapItem,
  Media,
  NewPostInput,
  NotificationView,
  Place,
  PlacePulse,
  PlaceReview,
  PostView,
  Profile,
  ProfilePreview,
  ProfileStats,
  SearchResults,
  StartTripInput,
  Trip,
  TripDetail,
  TripPoint,
  TripMoment,
  TripVisibility,
} from '@/domain/types';

export type FeedScope = 'following' | 'explore';

export interface ProfileView {
  profile: Profile;
  stats: ProfileStats;
  followState: FollowState;
  isMe: boolean;
  /** `false` quando o perfil é privado e o viewer ainda não é seguidor aprovado. */
  canViewContent: boolean;
}

export type ProfilePatch = Partial<
  Pick<
    Profile,
    | 'displayName'
    | 'bio'
    | 'avatarUrl'
    | 'isPrivate'
    | 'homeCity'
    | 'defaultTripVisibility'
    | 'shareLocationByDefault'
  >
>;

export interface NewMomentInput {
  media: Omit<Media, 'id'>;
  caption?: string | null;
  lat: number;
  lng: number;
  takenAt: ISODate;
  /** Também publica o momento no feed (cria um post vinculado à viagem). */
  publishToFeed: boolean;
}

/**
 * Contrato de acesso a dados do WaySocial.
 *
 * Implementações: `MockRepository` (dados de demonstração + AsyncStorage) e
 * `SupabaseRepository` (Postgres + RLS). O usuário "atuante" (viewer) é implícito:
 * a UI nunca passa o próprio ID — assim o backend não confia em ID vindo do cliente.
 *
 * Toda leitura já respeita privacidade (perfil privado, visibilidade da viagem, localização
 * removida). Mutations notificam `subscribe` para a UI reconsultar.
 */
export interface WayRepository {
  readonly mode: 'mock' | 'supabase';

  setViewer(userId: ID | null): void;
  viewerId(): ID | null;
  subscribe(listener: () => void): () => void;

  // --- perfis & social
  getProfileView(userId: ID): Promise<ProfileView | null>;
  getMyProfile(): Promise<Profile | null>;
  updateProfile(patch: ProfilePatch): Promise<Profile>;
  follow(userId: ID): Promise<FollowState>;
  unfollow(userId: ID): Promise<void>;
  respondFollowRequest(requesterId: ID, accept: boolean): Promise<void>;
  listFollowers(userId: ID): Promise<ProfilePreview[]>;
  listFollowing(userId: ID): Promise<ProfilePreview[]>;
  suggestedProfiles(): Promise<ProfilePreview[]>;

  // --- publicações
  getFeed(scope: FeedScope): Promise<PostView[]>;
  getPost(id: ID): Promise<PostView | null>;
  listPostsByUser(userId: ID): Promise<PostView[]>;
  listPostsByPlace(placeId: ID, limit?: number): Promise<PostView[]>;
  listSavedPosts(): Promise<PostView[]>;
  createPost(input: NewPostInput): Promise<PostView>;
  deletePost(id: ID): Promise<void>;
  /** Apaga a localização de uma publicação já feita (privacidade). */
  removePostLocation(id: ID): Promise<PostView>;
  toggleLike(postId: ID): Promise<{ liked: boolean; count: number }>;
  toggleSave(postId: ID): Promise<boolean>;
  listComments(postId: ID): Promise<CommentView[]>;
  addComment(postId: ID, text: string): Promise<CommentView>;

  // --- lugares
  getPlace(id: ID): Promise<Place | null>;
  listPlaces(opts?: { cityName?: string; limit?: number }): Promise<Place[]>;
  getPlacePulse(placeId: ID): Promise<PlacePulse>;
  listPlaceVisitors(placeId: ID): Promise<{ profile: ProfilePreview; at: ISODate }[]>;
  listPlaceReviews(placeId: ID): Promise<PlaceReview[]>;
  getMyPlaceRating(placeId: ID): Promise<number | null>;
  ratePlace(placeId: ID, stars: number, text?: string | null): Promise<Place>;
  isPlaceSaved(placeId: ID): Promise<boolean>;
  toggleSavePlace(placeId: ID): Promise<boolean>;
  listVisitedPlaces(userId: ID): Promise<Place[]>;

  // --- mapa
  getMapItems(opts: { center: LatLng; radiusM: number; filter: MapFilter }): Promise<MapItem[]>;

  // --- viagens
  getActiveTrip(): Promise<TripDetail | null>;
  startTrip(input: StartTripInput): Promise<TripDetail>;
  appendTripPoints(tripId: ID, points: TripPoint[]): Promise<void>;
  addTripMoment(tripId: ID, input: NewMomentInput): Promise<TripMoment>;
  setTripShareLive(tripId: ID, shareLive: boolean): Promise<Trip>;
  finishTrip(input: FinishTripInput): Promise<TripDetail>;
  cancelTrip(tripId: ID): Promise<void>;
  /** `null` se a viagem não existe ou o viewer não tem permissão para vê-la. */
  getTrip(id: ID): Promise<TripDetail | null>;
  listTrips(userId: ID): Promise<Trip[]>;
  /** Viagens concluídas minhas + de quem sigo (respeitando visibilidade). */
  listTripFeed(): Promise<Trip[]>;
  updateTrip(id: ID, patch: { title?: string; visibility?: TripVisibility; summary?: string | null }): Promise<Trip>;
  deleteTrip(id: ID): Promise<void>;

  // --- busca
  search(query: string): Promise<SearchResults>;

  // --- notificações
  listNotifications(): Promise<NotificationView[]>;
  unreadNotificationCount(): Promise<number>;
  markNotificationsRead(): Promise<void>;

  // --- conquistas
  listAchievements(userId: ID): Promise<AchievementProgress[]>;
  /** Conquistas desbloqueadas desde a última chamada (para celebrar na UI). Esvazia a fila. */
  popNewAchievements(): Promise<AchievementProgress[]>;

  /** Garante que gravações pendentes foram persistidas (chamado ao sair do app). */
  flush?(): Promise<void>;

  // --- só modo demonstração
  resetDemoData?(): Promise<void>;
  simulateIncomingActivity?(): Promise<string>;
}
