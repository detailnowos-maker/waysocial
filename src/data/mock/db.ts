import type {
  AchievementId,
  ID,
  ISODate,
  LocationPrecision,
  Media,
  NotificationType,
  Place,
  Profile,
  TripMoment,
  TripPoint,
  TripStatus,
  TripVisibility,
} from '@/domain/types';
import type { LatLng } from '@/lib/geo';

/** Formas persistidas do banco de demonstração (JSON em AsyncStorage). */

export interface StoredPlace extends Place {
  /** Nota-base da demonstração (avaliações "de outros usuários") + avaliações reais em `reviews`. */
  baseRatingAvg: number;
  baseRatingCount: number;
  /** Somente demonstração: pessoas/publicações "de fora" dos 5 usuários fictícios. */
  ambientPeople: number;
  ambientPostsToday: number;
}

export interface StoredPost {
  id: ID;
  authorId: ID;
  caption: string;
  createdAt: ISODate;
  placeId: ID | null;
  lat: number | null;
  lng: number | null;
  precision: LocationPrecision;
  media: Media[];
  tripId: ID | null;
  /** Somente demonstração: curtidas de contas que não existem no mock. */
  demoLikeBoost: number;
}

export interface StoredComment {
  id: ID;
  postId: ID;
  authorId: ID;
  text: string;
  createdAt: ISODate;
}

export interface StoredFollow {
  followerId: ID;
  followeeId: ID;
  status: 'accepted' | 'pending';
  createdAt: ISODate;
}

export interface StoredReview {
  id: ID;
  placeId: ID;
  userId: ID;
  stars: number;
  text: string | null;
  createdAt: ISODate;
}

export interface StoredTrip {
  id: ID;
  ownerId: ID;
  title: string;
  status: TripStatus;
  visibility: TripVisibility;
  shareLive: boolean;
  simulated: boolean;
  originName: string;
  destinationName: string | null;
  plannedDestination: string | null;
  startedAt: ISODate;
  endedAt: ISODate | null;
  distanceM: number;
  durationS: number;
  stopCount: number;
  photoCount: number;
  videoCount: number;
  summary: string | null;
  lastLat: number | null;
  lastLng: number | null;
  lastPointAt: ISODate | null;
  /** Viagens "ao vivo" da demonstração andam sozinhas pela rota (posição = função do relógio). */
  sim?: { route: LatLng[]; speedMs: number } | null;
}

export interface StoredNotification {
  id: ID;
  userId: ID;
  type: NotificationType;
  actorId: ID;
  postId: ID | null;
  commentText: string | null;
  createdAt: ISODate;
  read: boolean;
  pending: boolean;
}

export interface StoredCredential {
  email: string;
  /** Digest NÃO criptográfico — é só um mock; o Supabase Auth cuida de senha de verdade. */
  digest: string;
  userId: ID;
}

export interface MockDb {
  version: number;
  seedAt: number;
  touchedAt: number;
  profiles: Profile[];
  places: StoredPlace[];
  posts: StoredPost[];
  comments: StoredComment[];
  likes: { postId: ID; userId: ID }[];
  saves: { postId: ID; userId: ID }[];
  follows: StoredFollow[];
  reviews: StoredReview[];
  savedPlaces: { placeId: ID; userId: ID }[];
  trips: StoredTrip[];
  points: Record<ID, TripPoint[]>;
  moments: TripMoment[];
  notifications: StoredNotification[];
  unlocked: Record<ID, Partial<Record<AchievementId, string>>>;
  credentials: StoredCredential[];
}

export const DB_VERSION = 1;
