import type { FeedScope, NewMomentInput, ProfilePatch, ProfileView, WayRepository } from '../repository';
import {
  type MockDb,
  type StoredNotification,
  type StoredPlace,
  type StoredPost,
  type StoredTrip,
  DB_VERSION,
} from './db';
import { DEMO_EMAILS, U, buildSeed } from './seed';
import { computeActivityMetrics, evaluateAchievements } from '@/domain/achievements';
import {
  type ViewerContext,
  canSeeLiveTrip,
  canSeeProfileContent,
  canSeeTrip,
  resolvePostLocation,
} from '@/domain/privacy';
import { computeTripStats, defaultTripTitle } from '@/domain/tripStats';
import type {
  AchievementProgress,
  CommentView,
  FinishTripInput,
  FollowState,
  ID,
  ISODate,
  MapFilter,
  MapItem,
  NewPostInput,
  NotificationView,
  Place,
  PlacePulse,
  PlaceRef,
  PlaceReview,
  PostView,
  Profile,
  ProfilePreview,
  SearchResults,
  StartTripInput,
  Trip,
  TripDetail,
  TripMoment,
  TripPoint,
  TripVisibility,
} from '@/domain/types';
import { normalize } from '@/lib/format';
import { type LatLng, downsample, haversine, pointAlong, pathLength } from '@/lib/geo';
import { localId, mulberry32 } from '@/lib/random';

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface MockRepositoryDeps {
  storage: KeyValueStorage;
  now?: () => number;
  storageKey?: string;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
/** Depois deste intervalo sem uso, o "relógio" dos dados de demonstração é avançado. */
const STALE_AFTER_MS = 6 * HOUR;
const NOW_WINDOW_MS = 120 * MIN;
const MAP_POST_WINDOW_MS = 7 * 24 * HOUR;

function stripPlace(p: StoredPlace, ratingAvg: number, ratingCount: number): Place {
  const { baseRatingAvg: _a, baseRatingCount: _b, ambientPeople: _c, ambientPostsToday: _d, ...place } = p;
  return { ...place, ratingAvg, ratingCount };
}

/**
 * Repositório de demonstração: todo o app funciona offline, sem backend.
 * Persiste em AsyncStorage (injetado) e notifica a UI a cada mutação.
 */
export class MockRepository implements WayRepository {
  readonly mode = 'mock' as const;

  private db!: MockDb;
  private viewer: ID | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly ready: Promise<void>;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private newlyUnlocked: AchievementProgress[] = [];
  private readonly key: string;
  private readonly clock: () => number;

  constructor(private readonly deps: MockRepositoryDeps) {
    this.key = deps.storageKey ?? 'waysocial.mock.db.v1';
    this.clock = deps.now ?? Date.now;
    this.ready = this.load();
  }

  // --- ciclo de vida ------------------------------------------------------------------------

  private async load(): Promise<void> {
    const now = this.clock();
    let db: MockDb | null = null;
    try {
      const raw = await this.deps.storage.getItem(this.key);
      if (raw) {
        const parsed = JSON.parse(raw) as MockDb;
        if (parsed.version === DB_VERSION) db = parsed;
      }
    } catch {
      db = null;
    }
    if (!db) {
      db = buildSeed(now);
    } else if (now - db.touchedAt > STALE_AFTER_MS) {
      shiftTimes(db, now - db.touchedAt);
    }
    db.touchedAt = now;
    this.db = db;
    this.persistSoon();
  }

  async whenReady(): Promise<void> {
    await this.ready;
  }

  private persistSoon() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, 120);
  }

  async flush(): Promise<void> {
    await this.ready;
    this.db.touchedAt = this.clock();
    try {
      await this.deps.storage.setItem(this.key, JSON.stringify(this.db));
    } catch {
      // armazenamento cheio/indisponível: o app segue em memória
    }
  }

  private emit() {
    this.persistSoon();
    for (const l of [...this.listeners]) l();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setViewer(userId: ID | null): void {
    if (this.viewer === userId) return;
    this.viewer = userId;
    for (const l of [...this.listeners]) l();
  }

  viewerId(): ID | null {
    return this.viewer;
  }

  private me(): ID {
    if (!this.viewer) throw new Error('Faça login para continuar.');
    return this.viewer;
  }

  // --- helpers internos ---------------------------------------------------------------------

  private profile(id: ID): Profile | undefined {
    return this.db.profiles.find((p) => p.id === id);
  }

  private preview(id: ID): ProfilePreview {
    const p = this.profile(id);
    if (!p) return { id, username: 'removido', displayName: 'Usuário removido', avatarSeed: 0, isPrivate: false, avatarUrl: null };
    return {
      id: p.id,
      username: p.username,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
      avatarSeed: p.avatarSeed,
      isPrivate: p.isPrivate,
    };
  }

  private followingOf(userId: ID | null): Set<ID> {
    if (!userId) return new Set();
    return new Set(this.db.follows.filter((f) => f.followerId === userId && f.status === 'accepted').map((f) => f.followeeId));
  }

  private ctx(): ViewerContext {
    return { viewerId: this.viewer, following: this.followingOf(this.viewer) };
  }

  private canSeeUser(userId: ID, ctx = this.ctx()): boolean {
    const owner = this.profile(userId);
    return owner ? canSeeProfileContent(ctx, owner) : false;
  }

  private canSeePost(post: StoredPost, ctx = this.ctx()): boolean {
    return this.canSeeUser(post.authorId, ctx);
  }

  private placeOf(id: ID | null | undefined): StoredPlace | undefined {
    return id ? this.db.places.find((p) => p.id === id) : undefined;
  }

  private ratingOf(place: StoredPlace): { avg: number; count: number } {
    const reviews = this.db.reviews.filter((r) => r.placeId === place.id);
    const count = place.baseRatingCount + reviews.length;
    if (count === 0) return { avg: 0, count: 0 };
    const sum = place.baseRatingAvg * place.baseRatingCount + reviews.reduce((a, r) => a + r.stars, 0);
    return { avg: Math.round((sum / count) * 10) / 10, count };
  }

  private publicPlace(p: StoredPlace): Place {
    const { avg, count } = this.ratingOf(p);
    return stripPlace(p, avg, count);
  }

  private placeRef(p: StoredPlace | undefined): PlaceRef | null {
    return p ? { id: p.id, name: p.name, cityName: p.cityName, category: p.category } : null;
  }

  private hydratePost(sp: StoredPost): PostView {
    const likes = this.db.likes.filter((l) => l.postId === sp.id);
    const me = this.viewer;
    return {
      id: sp.id,
      author: this.preview(sp.authorId),
      caption: sp.caption,
      createdAt: sp.createdAt,
      place: this.placeRef(this.placeOf(sp.placeId)),
      lat: sp.lat,
      lng: sp.lng,
      precision: sp.precision,
      media: sp.media,
      tripId: sp.tripId,
      likeCount: likes.length + sp.demoLikeBoost,
      commentCount: this.db.comments.filter((c) => c.postId === sp.id).length,
      likedByMe: me ? likes.some((l) => l.userId === me) : false,
      savedByMe: me ? this.db.saves.some((s) => s.postId === sp.id && s.userId === me) : false,
    };
  }

  private visiblePostsDesc(filter?: (p: StoredPost) => boolean): StoredPost[] {
    const ctx = this.ctx();
    return this.db.posts
      .filter((p) => this.canSeePost(p, ctx) && (!filter || filter(p)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private notify(n: Omit<StoredNotification, 'id' | 'createdAt' | 'read' | 'pending'> & { pending?: boolean }) {
    if (n.userId === n.actorId) return;
    const dup = this.db.notifications.find(
      (x) => x.userId === n.userId && x.actorId === n.actorId && x.type === n.type && x.postId === n.postId && n.type !== 'comment',
    );
    if (dup) return;
    this.db.notifications.push({
      id: localId('n'),
      createdAt: new Date(this.clock()).toISOString(),
      read: false,
      pending: false,
      ...n,
    });
  }

  private unnotify(match: Partial<StoredNotification>) {
    this.db.notifications = this.db.notifications.filter(
      (n) => !(Object.entries(match) as [keyof StoredNotification, unknown][]).every(([k, v]) => n[k] === v),
    );
  }

  private refreshAchievements(userId: ID): AchievementProgress[] {
    const posts = this.db.posts
      .filter((p) => p.authorId === userId)
      .map((p) => {
        const place = this.placeOf(p.placeId);
        return { createdAt: p.createdAt, placeId: p.placeId, cityName: place?.cityName, category: place?.category };
      });
    const finished = this.db.trips.filter((t) => t.ownerId === userId && t.status === 'finished').length;
    const known = this.db.unlocked[userId] ?? {};
    const progress = evaluateAchievements(computeActivityMetrics(posts, finished, this.clock()), known, this.clock());
    const next = { ...known };
    for (const a of progress) {
      if (a.unlocked && !next[a.id]) {
        next[a.id] = a.unlockedAt ?? new Date(this.clock()).toISOString();
        if (userId === this.viewer) this.newlyUnlocked.push(a);
      }
    }
    this.db.unlocked[userId] = next;
    return progress;
  }

  async popNewAchievements(): Promise<AchievementProgress[]> {
    await this.ready;
    const out = this.newlyUnlocked;
    this.newlyUnlocked = [];
    return out;
  }

  // --- credenciais (usado pelo MockAuth) ----------------------------------------------------

  async findCredential(email: string): Promise<{ digest: string; userId: ID } | null> {
    await this.ready;
    const c = this.db.credentials.find((x) => x.email === email.trim().toLowerCase());
    return c ? { digest: c.digest, userId: c.userId } : null;
  }

  async isUsernameTaken(username: string): Promise<boolean> {
    await this.ready;
    return this.db.profiles.some((p) => p.username.toLowerCase() === username.trim().toLowerCase());
  }

  async registerUser(input: { email: string; digest: string; username: string; displayName: string }): Promise<ID> {
    await this.ready;
    const id = localId('u');
    const now = new Date(this.clock()).toISOString();
    this.db.profiles.push({
      id,
      username: input.username.trim().toLowerCase(),
      displayName: input.displayName.trim(),
      bio: '',
      avatarUrl: null,
      avatarSeed: Math.floor(Math.random() * 9000) + 100,
      isPrivate: false,
      homeCity: null,
      // privacidade em primeiro lugar: nada de localização compartilhada sem o usuário escolher
      defaultTripVisibility: 'private',
      shareLocationByDefault: false,
      createdAt: now,
    });
    this.db.credentials.push({ email: input.email.trim().toLowerCase(), digest: input.digest, userId: id });
    this.emit();
    return id;
  }

  demoUserId(): ID {
    return U.lucas;
  }

  // --- perfis & social ----------------------------------------------------------------------

  async getProfileView(userId: ID): Promise<ProfileView | null> {
    await this.ready;
    const profile = this.profile(userId);
    if (!profile) return null;
    const ctx = this.ctx();
    const isMe = ctx.viewerId === userId;
    const visiblePlaces = new Set(this.db.posts.filter((p) => p.authorId === userId && p.placeId).map((p) => p.placeId));
    return {
      profile,
      isMe,
      canViewContent: canSeeProfileContent(ctx, profile),
      followState: isMe ? 'none' : this.followStateOf(userId),
      stats: {
        posts: this.db.posts.filter((p) => p.authorId === userId).length,
        trips: this.db.trips.filter(
          (t) => t.ownerId === userId && t.status === 'finished' && canSeeTrip(ctx, { ownerId: t.ownerId, ownerIsPrivate: profile.isPrivate, visibility: t.visibility }),
        ).length,
        places: visiblePlaces.size,
        followers: this.db.follows.filter((f) => f.followeeId === userId && f.status === 'accepted').length,
        following: this.db.follows.filter((f) => f.followerId === userId && f.status === 'accepted').length,
      },
    };
  }

  private followStateOf(userId: ID): FollowState {
    const rel = this.db.follows.find((f) => f.followerId === this.viewer && f.followeeId === userId);
    if (!rel) return 'none';
    return rel.status === 'accepted' ? 'following' : 'requested';
  }

  async getMyProfile(): Promise<Profile | null> {
    await this.ready;
    return this.viewer ? (this.profile(this.viewer) ?? null) : null;
  }

  async updateProfile(patch: ProfilePatch): Promise<Profile> {
    await this.ready;
    const p = this.profile(this.me());
    if (!p) throw new Error('Perfil não encontrado.');
    Object.assign(p, patch);
    if (patch.isPrivate === false) {
      // tornar o perfil público aprova automaticamente os pedidos pendentes
      for (const f of this.db.follows) {
        if (f.followeeId === p.id && f.status === 'pending') f.status = 'accepted';
      }
      this.db.notifications = this.db.notifications.filter((n) => !(n.userId === p.id && n.type === 'follow_request'));
    }
    this.emit();
    return p;
  }

  async follow(userId: ID): Promise<FollowState> {
    await this.ready;
    const me = this.me();
    if (me === userId) throw new Error('Você não pode seguir a si mesmo.');
    const target = this.profile(userId);
    if (!target) throw new Error('Perfil não encontrado.');
    const existing = this.db.follows.find((f) => f.followerId === me && f.followeeId === userId);
    if (existing) return existing.status === 'accepted' ? 'following' : 'requested';
    const status = target.isPrivate ? 'pending' : 'accepted';
    this.db.follows.push({ followerId: me, followeeId: userId, status, createdAt: new Date(this.clock()).toISOString() });
    this.notify({
      userId,
      actorId: me,
      type: status === 'pending' ? 'follow_request' : 'follow',
      postId: null,
      commentText: null,
      pending: status === 'pending',
    });
    this.emit();
    return status === 'accepted' ? 'following' : 'requested';
  }

  async unfollow(userId: ID): Promise<void> {
    await this.ready;
    const me = this.me();
    this.db.follows = this.db.follows.filter((f) => !(f.followerId === me && f.followeeId === userId));
    this.unnotify({ userId, actorId: me, type: 'follow' });
    this.unnotify({ userId, actorId: me, type: 'follow_request' });
    this.emit();
  }

  async respondFollowRequest(requesterId: ID, accept: boolean): Promise<void> {
    await this.ready;
    const me = this.me();
    const rel = this.db.follows.find((f) => f.followerId === requesterId && f.followeeId === me && f.status === 'pending');
    if (!rel) return;
    const req = this.db.notifications.find((n) => n.userId === me && n.actorId === requesterId && n.type === 'follow_request');
    if (accept) {
      rel.status = 'accepted';
      if (req) {
        req.type = 'follow';
        req.pending = false;
        req.read = true;
      }
      this.notify({ userId: requesterId, actorId: me, type: 'follow_accepted', postId: null, commentText: null });
    } else {
      this.db.follows = this.db.follows.filter((f) => f !== rel);
      this.unnotify({ userId: me, actorId: requesterId, type: 'follow_request' });
    }
    this.emit();
  }

  async listFollowers(userId: ID): Promise<ProfilePreview[]> {
    await this.ready;
    if (!this.canSeeUser(userId)) return [];
    return this.db.follows.filter((f) => f.followeeId === userId && f.status === 'accepted').map((f) => this.preview(f.followerId));
  }

  async listFollowing(userId: ID): Promise<ProfilePreview[]> {
    await this.ready;
    if (!this.canSeeUser(userId)) return [];
    return this.db.follows.filter((f) => f.followerId === userId && f.status === 'accepted').map((f) => this.preview(f.followeeId));
  }

  async suggestedProfiles(): Promise<ProfilePreview[]> {
    await this.ready;
    const me = this.viewer;
    const related = new Set(this.db.follows.filter((f) => f.followerId === me).map((f) => f.followeeId));
    return this.db.profiles.filter((p) => p.id !== me && !related.has(p.id)).map((p) => this.preview(p.id));
  }

  // --- publicações --------------------------------------------------------------------------

  async getFeed(scope: FeedScope): Promise<PostView[]> {
    await this.ready;
    const following = this.followingOf(this.viewer);
    const posts = this.visiblePostsDesc(scope === 'following' ? (p) => p.authorId === this.viewer || following.has(p.authorId) : undefined);
    return posts.map((p) => this.hydratePost(p));
  }

  async getPost(id: ID): Promise<PostView | null> {
    await this.ready;
    const p = this.db.posts.find((x) => x.id === id);
    return p && this.canSeePost(p) ? this.hydratePost(p) : null;
  }

  async listPostsByUser(userId: ID): Promise<PostView[]> {
    await this.ready;
    return this.visiblePostsDesc((p) => p.authorId === userId).map((p) => this.hydratePost(p));
  }

  async listPostsByPlace(placeId: ID, limit = 60): Promise<PostView[]> {
    await this.ready;
    const place = this.placeOf(placeId);
    const isCity = place?.kind === 'city';
    return this.visiblePostsDesc((p) => (isCity ? this.placeOf(p.placeId)?.cityName === place?.name : p.placeId === placeId))
      .slice(0, limit)
      .map((p) => this.hydratePost(p));
  }

  async listSavedPosts(): Promise<PostView[]> {
    await this.ready;
    const me = this.viewer;
    const saved = new Set(this.db.saves.filter((s) => s.userId === me).map((s) => s.postId));
    return this.visiblePostsDesc((p) => saved.has(p.id)).map((p) => this.hydratePost(p));
  }

  async createPost(input: NewPostInput): Promise<PostView> {
    await this.ready;
    const me = this.me();
    if (input.media.length === 0) throw new Error('Adicione uma foto ou vídeo.');
    const place = this.placeOf(input.placeId ?? null);
    const loc = resolvePostLocation(input, place ?? null);
    const id = localId('po');
    const post: StoredPost = {
      id,
      authorId: me,
      caption: input.caption.trim(),
      createdAt: new Date(this.clock()).toISOString(),
      placeId: loc.placeId,
      lat: loc.lat,
      lng: loc.lng,
      precision: loc.precision,
      media: input.media.map((m, i) => ({ ...m, id: `${id}_m${i + 1}` })),
      tripId: input.tripId ?? null,
      demoLikeBoost: 0,
    };
    this.db.posts.push(post);
    this.refreshAchievements(me);
    this.emit();
    return this.hydratePost(post);
  }

  async deletePost(id: ID): Promise<void> {
    await this.ready;
    const post = this.db.posts.find((p) => p.id === id);
    if (!post || post.authorId !== this.me()) throw new Error('Você só pode excluir suas publicações.');
    this.db.posts = this.db.posts.filter((p) => p.id !== id);
    this.db.comments = this.db.comments.filter((c) => c.postId !== id);
    this.db.likes = this.db.likes.filter((l) => l.postId !== id);
    this.db.saves = this.db.saves.filter((s) => s.postId !== id);
    this.db.notifications = this.db.notifications.filter((n) => n.postId !== id);
    this.emit();
  }

  async removePostLocation(id: ID): Promise<PostView> {
    await this.ready;
    const post = this.db.posts.find((p) => p.id === id);
    if (!post || post.authorId !== this.me()) throw new Error('Você só pode editar suas publicações.');
    post.placeId = null;
    post.lat = null;
    post.lng = null;
    post.precision = 'none';
    this.emit();
    return this.hydratePost(post);
  }

  async toggleLike(postId: ID): Promise<{ liked: boolean; count: number }> {
    await this.ready;
    const me = this.me();
    const post = this.db.posts.find((p) => p.id === postId);
    if (!post || !this.canSeePost(post)) throw new Error('Publicação indisponível.');
    const idx = this.db.likes.findIndex((l) => l.postId === postId && l.userId === me);
    let liked: boolean;
    if (idx >= 0) {
      this.db.likes.splice(idx, 1);
      this.unnotify({ userId: post.authorId, actorId: me, type: 'like', postId });
      liked = false;
    } else {
      this.db.likes.push({ postId, userId: me });
      this.notify({ userId: post.authorId, actorId: me, type: 'like', postId, commentText: null });
      liked = true;
    }
    this.emit();
    return { liked, count: this.db.likes.filter((l) => l.postId === postId).length + post.demoLikeBoost };
  }

  async toggleSave(postId: ID): Promise<boolean> {
    await this.ready;
    const me = this.me();
    const post = this.db.posts.find((p) => p.id === postId);
    if (!post || !this.canSeePost(post)) throw new Error('Publicação indisponível.');
    const idx = this.db.saves.findIndex((s) => s.postId === postId && s.userId === me);
    let saved: boolean;
    if (idx >= 0) {
      this.db.saves.splice(idx, 1);
      this.unnotify({ userId: post.authorId, actorId: me, type: 'save', postId });
      saved = false;
    } else {
      this.db.saves.push({ postId, userId: me });
      this.notify({ userId: post.authorId, actorId: me, type: 'save', postId, commentText: null });
      saved = true;
    }
    this.emit();
    return saved;
  }

  async listComments(postId: ID): Promise<CommentView[]> {
    await this.ready;
    const post = this.db.posts.find((p) => p.id === postId);
    if (!post || !this.canSeePost(post)) return [];
    return this.db.comments
      .filter((c) => c.postId === postId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => ({ id: c.id, postId: c.postId, author: this.preview(c.authorId), text: c.text, createdAt: c.createdAt }));
  }

  async addComment(postId: ID, text: string): Promise<CommentView> {
    await this.ready;
    const me = this.me();
    const clean = text.trim();
    if (!clean) throw new Error('Escreva um comentário.');
    const post = this.db.posts.find((p) => p.id === postId);
    if (!post || !this.canSeePost(post)) throw new Error('Publicação indisponível.');
    const c = { id: localId('c'), postId, authorId: me, text: clean.slice(0, 500), createdAt: new Date(this.clock()).toISOString() };
    this.db.comments.push(c);
    this.notify({ userId: post.authorId, actorId: me, type: 'comment', postId, commentText: c.text });
    this.emit();
    return { id: c.id, postId, author: this.preview(me), text: c.text, createdAt: c.createdAt };
  }

  // --- lugares ------------------------------------------------------------------------------

  async getPlace(id: ID): Promise<Place | null> {
    await this.ready;
    const p = this.placeOf(id);
    return p ? this.publicPlace(p) : null;
  }

  async listPlaces(opts: { cityName?: string; limit?: number } = {}): Promise<Place[]> {
    await this.ready;
    const city = opts.cityName ? normalize(opts.cityName) : null;
    const list = this.db.places
      .filter((p) => p.kind !== 'city' && (!city || normalize(p.cityName) === city))
      .sort((a, b) => this.ratingOf(b).count - this.ratingOf(a).count)
      .map((p) => this.publicPlace(p));
    return opts.limit ? list.slice(0, opts.limit) : list;
  }

  private pulseOf(place: StoredPlace): PlacePulse {
    const now = this.clock();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const posts = this.visiblePostsDesc((p) => p.placeId === place.id);
    const today = posts.filter((p) => new Date(p.createdAt).getTime() >= startOfDay.getTime());
    const nowAuthors = new Set(posts.filter((p) => now - new Date(p.createdAt).getTime() <= NOW_WINDOW_MS).map((p) => p.authorId));
    const last = posts[0];
    return {
      placeId: place.id,
      postsToday: place.ambientPostsToday + today.length,
      peopleNow: place.ambientPeople + nowAuthors.size,
      lastPost: last ? { authorName: this.preview(last.authorId).displayName.split(' ')[0], createdAt: last.createdAt } : null,
    };
  }

  async getPlacePulse(placeId: ID): Promise<PlacePulse> {
    await this.ready;
    const place = this.placeOf(placeId);
    if (!place) return { placeId, postsToday: 0, peopleNow: 0, lastPost: null };
    return this.pulseOf(place);
  }

  async listPlaceVisitors(placeId: ID): Promise<{ profile: ProfilePreview; at: ISODate }[]> {
    await this.ready;
    const seen = new Set<ID>();
    const out: { profile: ProfilePreview; at: ISODate }[] = [];
    for (const p of this.visiblePostsDesc((x) => x.placeId === placeId)) {
      if (seen.has(p.authorId)) continue;
      seen.add(p.authorId);
      out.push({ profile: this.preview(p.authorId), at: p.createdAt });
    }
    return out.slice(0, 12);
  }

  async listPlaceReviews(placeId: ID): Promise<PlaceReview[]> {
    await this.ready;
    return this.db.reviews
      .filter((r) => r.placeId === placeId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({ id: r.id, placeId, author: this.preview(r.userId), stars: r.stars, text: r.text, createdAt: r.createdAt }));
  }

  async getMyPlaceRating(placeId: ID): Promise<number | null> {
    await this.ready;
    return this.db.reviews.find((r) => r.placeId === placeId && r.userId === this.viewer)?.stars ?? null;
  }

  async ratePlace(placeId: ID, stars: number, text?: string | null): Promise<Place> {
    await this.ready;
    const me = this.me();
    const place = this.placeOf(placeId);
    if (!place || place.kind === 'city') throw new Error('Lugar não encontrado.');
    const s = Math.max(1, Math.min(5, Math.round(stars)));
    const existing = this.db.reviews.find((r) => r.placeId === placeId && r.userId === me);
    if (existing) {
      existing.stars = s;
      existing.text = text?.trim() || existing.text;
    } else {
      this.db.reviews.push({ id: localId('rv'), placeId, userId: me, stars: s, text: text?.trim() || null, createdAt: new Date(this.clock()).toISOString() });
    }
    this.emit();
    return this.publicPlace(place);
  }

  async isPlaceSaved(placeId: ID): Promise<boolean> {
    await this.ready;
    return this.db.savedPlaces.some((s) => s.placeId === placeId && s.userId === this.viewer);
  }

  async toggleSavePlace(placeId: ID): Promise<boolean> {
    await this.ready;
    const me = this.me();
    const idx = this.db.savedPlaces.findIndex((s) => s.placeId === placeId && s.userId === me);
    if (idx >= 0) this.db.savedPlaces.splice(idx, 1);
    else this.db.savedPlaces.push({ placeId, userId: me });
    this.emit();
    return idx < 0;
  }

  async listVisitedPlaces(userId: ID): Promise<Place[]> {
    await this.ready;
    const seen = new Set<ID>();
    const out: Place[] = [];
    for (const p of this.visiblePostsDesc((x) => x.authorId === userId && !!x.placeId)) {
      const place = this.placeOf(p.placeId);
      if (!place || seen.has(place.id)) continue;
      seen.add(place.id);
      out.push(this.publicPlace(place));
    }
    return out;
  }

  // --- mapa ---------------------------------------------------------------------------------

  async getMapItems(opts: { center: LatLng; radiusM: number; filter: MapFilter }): Promise<MapItem[]> {
    await this.ready;
    const { center, radiusM, filter } = opts;
    const now = this.clock();
    const within = (p: LatLng) => haversine(center, p) <= radiusM;
    const items: MapItem[] = [];
    const postPlaceIds = new Set<ID>();

    if (filter === 'all' || filter === 'posts') {
      const groups = new Map<string, StoredPost[]>();
      for (const p of this.visiblePostsDesc((x) => x.lat !== null && x.lng !== null && now - new Date(x.createdAt).getTime() <= MAP_POST_WINDOW_MS)) {
        if (!within({ lat: p.lat!, lng: p.lng! })) continue;
        const key = p.placeId ?? `${p.lat!.toFixed(3)},${p.lng!.toFixed(3)}`;
        groups.set(key, [...(groups.get(key) ?? []), p]);
      }
      for (const group of groups.values()) {
        const latest = group[0];
        if (latest.placeId) postPlaceIds.add(latest.placeId);
        const placeOfPost = this.placeOf(latest.placeId);
        items.push({ type: 'post', id: latest.id, lat: latest.lat!, lng: latest.lng!, post: this.hydratePost(latest), count: group.length, pulse: placeOfPost ? this.pulseOf(placeOfPost) : null });
      }
    }

    const placeFilter = (p: StoredPlace): boolean => {
      switch (filter) {
        case 'places':
          return p.kind === 'place';
        case 'food':
          return p.category === 'restaurant' || p.category === 'cafe' || p.category === 'bar';
        case 'events':
          return p.kind === 'event';
        case 'all':
          return p.kind === 'event' || (p.kind === 'place' && !postPlaceIds.has(p.id));
        default:
          return false;
      }
    };
    for (const p of this.db.places) {
      if (p.kind === 'city' || !placeFilter(p) || !within(p)) continue;
      const pub = this.publicPlace(p);
      const pulse = this.pulseOf(p);
      items.push(p.kind === 'event' ? { type: 'event', id: p.id, lat: p.lat, lng: p.lng, place: pub, pulse } : { type: 'place', id: p.id, lat: p.lat, lng: p.lng, place: pub, pulse });
    }

    if (filter === 'all' || filter === 'trips') {
      const ctx = this.ctx();
      for (const t of this.db.trips) {
        if (t.status !== 'active' || t.ownerId === this.viewer) continue;
        const owner = this.profile(t.ownerId);
        if (!owner || !canSeeLiveTrip(ctx, { ownerId: t.ownerId, ownerIsPrivate: owner.isPrivate, visibility: t.visibility, shareLive: t.shareLive, status: t.status })) continue;
        const trip = this.hydrateTrip(t);
        if (trip.lastLat == null || trip.lastLng == null) continue;
        if (!within({ lat: trip.lastLat, lng: trip.lastLng })) continue;
        items.push({ type: 'live', id: trip.id, lat: trip.lastLat, lng: trip.lastLng, trip });
      }
    }
    return items;
  }

  // --- viagens ------------------------------------------------------------------------------

  /** Estado "agora" de uma viagem ao vivo da demonstração (posição = função do relógio). */
  private liveState(t: StoredTrip): { lat: number; lng: number; distanceM: number; durationS: number } | null {
    if (!t.sim) return null;
    const total = pathLength(t.sim.route);
    const elapsedS = (this.clock() - new Date(t.startedAt).getTime()) / 1000;
    const travelled = (t.sim.speedMs * elapsedS) % total;
    const pos = pointAlong(t.sim.route, travelled);
    return { lat: pos.lat, lng: pos.lng, distanceM: travelled, durationS: Math.round(elapsedS) };
  }

  private hydrateTrip(t: StoredTrip): Trip {
    const live = this.liveState(t);
    const { sim: _sim, ownerId, ...rest } = t;
    return {
      ...rest,
      owner: this.preview(ownerId),
      distanceM: live?.distanceM ?? t.distanceM,
      durationS: live?.durationS ?? t.durationS,
      lastLat: live?.lat ?? t.lastLat,
      lastLng: live?.lng ?? t.lastLng,
      lastPointAt: live ? new Date(this.clock()).toISOString() : t.lastPointAt,
      routePreview: downsample(t.sim ? t.sim.route : (this.db.points[t.id] ?? []), 48),
    };
  }

  private tripDetail(t: StoredTrip): TripDetail {
    let points = this.db.points[t.id] ?? [];
    const live = this.liveState(t);
    if (live && t.sim) {
      // trajeto "até agora" para a viagem simulada
      const travelled = live.distanceM;
      let acc = 0;
      const drawn: TripPoint[] = [];
      const startMs = new Date(t.startedAt).getTime();
      for (let i = 0; i < t.sim.route.length; i++) {
        if (i > 0) acc += haversine(t.sim.route[i - 1], t.sim.route[i]);
        if (acc > travelled) break;
        drawn.push({ lat: t.sim.route[i].lat, lng: t.sim.route[i].lng, t: new Date(startMs + (acc / t.sim.speedMs) * 1000).toISOString(), speed: t.sim.speedMs, accuracy: 8, kind: 'track' });
      }
      drawn.push({ lat: live.lat, lng: live.lng, t: new Date(this.clock()).toISOString(), speed: t.sim.speedMs, accuracy: 8, kind: 'track' });
      points = drawn;
    }
    return { ...this.hydrateTrip(t), points, moments: this.db.moments.filter((m) => m.tripId === t.id).sort((a, b) => a.takenAt.localeCompare(b.takenAt)) };
  }

  private tripVisible(t: StoredTrip): boolean {
    const owner = this.profile(t.ownerId);
    if (!owner) return false;
    return canSeeTrip(this.ctx(), { ownerId: t.ownerId, ownerIsPrivate: owner.isPrivate, visibility: t.visibility });
  }

  private ownTrip(id: ID): StoredTrip {
    const t = this.db.trips.find((x) => x.id === id);
    if (!t || t.ownerId !== this.me()) throw new Error('Viagem não encontrada.');
    return t;
  }

  async getActiveTrip(): Promise<TripDetail | null> {
    await this.ready;
    const t = this.db.trips.find((x) => x.ownerId === this.viewer && x.status === 'active' && !x.sim);
    return t ? this.tripDetail(t) : null;
  }

  async startTrip(input: StartTripInput): Promise<TripDetail> {
    await this.ready;
    const me = this.me();
    if (this.db.trips.some((t) => t.ownerId === me && t.status === 'active' && !t.sim)) throw new Error('Você já tem uma viagem ativa.');
    const now = new Date(this.clock()).toISOString();
    const id = localId('tr');
    const trip: StoredTrip = {
      id,
      ownerId: me,
      title: defaultTripTitle(input.originName, input.plannedDestination),
      status: 'active',
      visibility: input.visibility,
      shareLive: input.shareLive && input.visibility !== 'private',
      simulated: input.simulated,
      originName: input.originName,
      destinationName: null,
      plannedDestination: input.plannedDestination?.trim() || null,
      startedAt: now,
      endedAt: null,
      distanceM: 0,
      durationS: 0,
      stopCount: 0,
      photoCount: 0,
      videoCount: 0,
      summary: null,
      lastLat: input.origin.lat,
      lastLng: input.origin.lng,
      lastPointAt: now,
      sim: null,
    };
    this.db.trips.push(trip);
    this.db.points[id] = [{ lat: input.origin.lat, lng: input.origin.lng, t: now, speed: 0, accuracy: null, kind: 'track' }];
    this.emit();
    return this.tripDetail(trip);
  }

  async appendTripPoints(tripId: ID, points: TripPoint[]): Promise<void> {
    await this.ready;
    const t = this.ownTrip(tripId);
    if (t.status !== 'active' || points.length === 0) return;
    const all = (this.db.points[tripId] ??= []);
    all.push(...points);
    const last = all[all.length - 1];
    const stats = computeTripStats(all, this.db.moments.filter((m) => m.tripId === tripId), t.startedAt, last.t);
    t.distanceM = stats.distanceM;
    t.durationS = stats.durationS;
    t.stopCount = stats.stopCount;
    t.lastLat = last.lat;
    t.lastLng = last.lng;
    t.lastPointAt = last.t;
    this.emit();
  }

  async addTripMoment(tripId: ID, input: NewMomentInput): Promise<TripMoment> {
    await this.ready;
    const t = this.ownTrip(tripId);
    const id = localId('mo');
    let postId: ID | null = null;
    if (input.publishToFeed) {
      // no feed, um momento de viagem só leva a posição APROXIMADA (~1 km): não vira rastreador em tempo real
      const post = await this.createPost({
        media: [input.media],
        caption: input.caption ?? '',
        deviceLocation: { lat: input.lat, lng: input.lng },
        precision: 'approx',
        tripId,
      });
      postId = post.id;
    }
    const moment: TripMoment = {
      id,
      tripId,
      media: { ...input.media, id: `${id}_m` },
      caption: input.caption?.trim() || null,
      lat: input.lat,
      lng: input.lng,
      takenAt: input.takenAt,
      postId,
    };
    this.db.moments.push(moment);
    if (input.media.type === 'video') t.videoCount += 1;
    else t.photoCount += 1;
    this.emit();
    return moment;
  }

  async setTripShareLive(tripId: ID, shareLive: boolean): Promise<Trip> {
    await this.ready;
    const t = this.ownTrip(tripId);
    t.shareLive = shareLive && t.visibility !== 'private';
    this.emit();
    return this.hydrateTrip(t);
  }

  async finishTrip(input: FinishTripInput): Promise<TripDetail> {
    await this.ready;
    const t = this.ownTrip(input.tripId);
    if (t.status !== 'active') return this.tripDetail(t);
    if (input.points.length) (this.db.points[t.id] ??= []).push(...input.points);
    const points = this.db.points[t.id] ?? [];
    const moments = this.db.moments.filter((m) => m.tripId === t.id);
    const endedAtMs = new Date(t.startedAt).getTime() + input.durationS * 1000;
    const stats = computeTripStats(points, moments, t.startedAt, new Date(endedAtMs).toISOString());
    t.status = 'finished';
    t.shareLive = false;
    t.endedAt = new Date(endedAtMs).toISOString();
    t.distanceM = stats.distanceM || input.distanceM;
    t.durationS = input.durationS;
    t.stopCount = stats.stopCount;
    t.photoCount = stats.photoCount;
    t.videoCount = stats.videoCount;
    t.destinationName = input.destinationName ?? t.plannedDestination ?? null;
    t.title = defaultTripTitle(t.originName, t.destinationName);
    t.summary = input.summary ?? null;
    const last = points[points.length - 1];
    if (last) {
      t.lastLat = last.lat;
      t.lastLng = last.lng;
      t.lastPointAt = last.t;
    }
    this.refreshAchievements(t.ownerId);
    this.emit();
    return this.tripDetail(t);
  }

  async cancelTrip(tripId: ID): Promise<void> {
    await this.ready;
    const t = this.ownTrip(tripId);
    this.db.trips = this.db.trips.filter((x) => x.id !== t.id);
    delete this.db.points[t.id];
    this.db.moments = this.db.moments.filter((m) => m.tripId !== t.id);
    this.emit();
  }

  async getTrip(id: ID): Promise<TripDetail | null> {
    await this.ready;
    const t = this.db.trips.find((x) => x.id === id);
    if (!t) return null;
    const owner = this.profile(t.ownerId);
    const visible = t.status === 'active' ? owner && (t.ownerId === this.viewer || canSeeLiveTrip(this.ctx(), { ownerId: t.ownerId, ownerIsPrivate: owner.isPrivate, visibility: t.visibility, shareLive: t.shareLive, status: t.status })) : this.tripVisible(t);
    return visible ? this.tripDetail(t) : null;
  }

  async listTrips(userId: ID): Promise<Trip[]> {
    await this.ready;
    return this.db.trips
      .filter((t) => t.ownerId === userId && t.status === 'finished' && this.tripVisible(t))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((t) => this.hydrateTrip(t));
  }

  async listTripFeed(): Promise<Trip[]> {
    await this.ready;
    return this.db.trips
      .filter((t) => t.ownerId !== this.viewer && t.status === 'finished' && this.tripVisible(t))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((t) => this.hydrateTrip(t));
  }

  async updateTrip(id: ID, patch: { title?: string; visibility?: TripVisibility; summary?: string | null }): Promise<Trip> {
    await this.ready;
    const t = this.ownTrip(id);
    if (patch.title !== undefined) t.title = patch.title.trim() || t.title;
    if (patch.visibility) {
      t.visibility = patch.visibility;
      if (patch.visibility === 'private') t.shareLive = false;
    }
    if (patch.summary !== undefined) t.summary = patch.summary;
    this.emit();
    return this.hydrateTrip(t);
  }

  async deleteTrip(id: ID): Promise<void> {
    await this.cancelTrip(id);
  }

  // --- busca --------------------------------------------------------------------------------

  async search(query: string): Promise<SearchResults> {
    await this.ready;
    const q = normalize(query);
    const empty: SearchResults = { query, cities: [], places: [], people: [], posts: [], cityHub: null };
    if (q.length < 2) return empty;
    const has = (s: string | null | undefined) => !!s && normalize(s).includes(q);

    const cities = this.db.places.filter((p) => p.kind === 'city' && has(p.name)).map((p) => this.publicPlace(p));
    const places = this.db.places
      .filter((p) => p.kind !== 'city' && (has(p.name) || has(p.category) || has(p.cityName)))
      .sort((a, b) => this.ratingOf(b).count - this.ratingOf(a).count)
      .map((p) => this.publicPlace(p));
    const people = this.db.profiles
      .filter((p) => has(p.username) || has(p.displayName) || has(p.homeCity))
      .map((p) => this.preview(p.id));
    const posts = this.visiblePostsDesc((p) => {
      const place = this.placeOf(p.placeId);
      return has(p.caption) || has(place?.name) || has(place?.cityName);
    })
      .slice(0, 30)
      .map((p) => this.hydratePost(p));

    let cityHub: SearchResults['cityHub'] = null;
    const exact = cities.find((c) => normalize(c.name) === q) ?? cities[0];
    if (exact) {
      const cityPosts = this.visiblePostsDesc((p) => this.placeOf(p.placeId)?.cityName === exact.name);
      const authorIds = new Set(cityPosts.map((p) => p.authorId));
      for (const p of this.db.profiles) if (p.homeCity === exact.name && this.canSeeUser(p.id)) authorIds.add(p.id);
      cityHub = {
        city: exact,
        topPlaces: await this.listPlaces({ cityName: exact.name, limit: 6 }),
        recentPosts: cityPosts.slice(0, 9).map((p) => this.hydratePost(p)),
        people: [...authorIds].map((id) => this.preview(id)),
      };
    }
    return { query, cities, places, people, posts, cityHub };
  }

  // --- notificações -------------------------------------------------------------------------

  async listNotifications(): Promise<NotificationView[]> {
    await this.ready;
    const me = this.viewer;
    return this.db.notifications
      .filter((n) => n.userId === me)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((n) => {
        const post = n.postId ? this.db.posts.find((p) => p.id === n.postId) : undefined;
        return {
          id: n.id,
          type: n.type,
          actor: this.preview(n.actorId),
          createdAt: n.createdAt,
          read: n.read,
          post: post ? { id: post.id, media: post.media[0] ?? null } : null,
          commentText: n.commentText,
          pending: n.pending,
        };
      });
  }

  async unreadNotificationCount(): Promise<number> {
    await this.ready;
    return this.db.notifications.filter((n) => n.userId === this.viewer && !n.read).length;
  }

  async markNotificationsRead(): Promise<void> {
    await this.ready;
    let changed = false;
    for (const n of this.db.notifications) {
      if (n.userId === this.viewer && !n.read && !n.pending) {
        n.read = true;
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  // --- conquistas ---------------------------------------------------------------------------

  async listAchievements(userId: ID): Promise<AchievementProgress[]> {
    await this.ready;
    if (!this.canSeeUser(userId)) return [];
    const result = this.refreshAchievements(userId);
    return result;
  }

  // --- demonstração -------------------------------------------------------------------------

  async resetDemoData(): Promise<void> {
    await this.ready;
    const keepViewer = this.viewer;
    this.db = buildSeed(this.clock());
    this.newlyUnlocked = [];
    if (keepViewer && !this.profile(keepViewer)) this.viewer = null;
    this.emit();
  }

  /** Faz um dos usuários fictícios interagir com o viewer — para ver notificações chegando. Sempre gera algo novo. */
  async simulateIncomingActivity(): Promise<string> {
    await this.ready;
    const me = this.me();
    const rand = mulberry32((this.clock() ^ this.db.notifications.length * 7919) & 0xffffff);
    const others = this.db.profiles.filter((p) => p.id !== me && DEMO_EMAILS[p.id]);
    const myPosts = this.db.posts.filter((p) => p.authorId === me).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const now = new Date(this.clock()).toISOString();
    const pickOne = <T,>(list: T[]): T | undefined => list[Math.floor(rand() * list.length)];
    const first = (id: ID) => this.preview(id).displayName.split(' ')[0];

    type Option = () => string;
    const options: Option[] = [];

    // novo seguidor
    const notFollowing = others.filter((o) => !this.db.follows.some((f) => f.followerId === o.id && f.followeeId === me));
    const follower = pickOne(notFollowing);
    if (follower) {
      options.push(() => {
        const status = this.profile(me)?.isPrivate ? 'pending' : 'accepted';
        this.db.follows.push({ followerId: follower.id, followeeId: me, status, createdAt: now });
        this.notify({ userId: me, actorId: follower.id, type: status === 'pending' ? 'follow_request' : 'follow', postId: null, commentText: null, pending: status === 'pending' });
        return status === 'pending' ? `${first(follower.id)} quer seguir você` : `${first(follower.id)} começou a seguir você`;
      });
    }

    if (myPosts.length) {
      const target = myPosts[Math.floor(rand() * Math.min(3, myPosts.length))];
      // curtida nova (de quem ainda não curtiu)
      const likers = others.filter((o) => !this.db.likes.some((l) => l.postId === target.id && l.userId === o.id));
      const liker = pickOne(likers);
      if (liker) {
        options.push(() => {
          this.db.likes.push({ postId: target.id, userId: liker.id });
          this.notify({ userId: me, actorId: liker.id, type: 'like', postId: target.id, commentText: null });
          return `${first(liker.id)} curtiu sua publicação`;
        });
      }
      // comentário (sempre possível)
      options.push(() => {
        const actor = pickOne(others)!;
        const texts = ['Que lugar incrível! 😍', 'Preciso ir aí!', 'Foto linda!', 'Boa dica, valeu!', 'Esse pôr do sol 🔥'];
        const text = texts[Math.floor(rand() * texts.length)];
        this.db.comments.push({ id: localId('c'), postId: target.id, authorId: actor.id, text, createdAt: now });
        this.notify({ userId: me, actorId: actor.id, type: 'comment', postId: target.id, commentText: text });
        return `${first(actor.id)} comentou: “${text}”`;
      });
    }

    const run = pickOne(options);
    if (!run) return 'Publique algo para receber interações.';
    const message = run();
    this.emit();
    return message;
  }
}

// --- rebase do relógio da demonstração ---------------------------------------------------------

const shiftIso = (value: string | null | undefined, delta: number): string | null =>
  value ? new Date(new Date(value).getTime() + delta).toISOString() : (value ?? null);

function shiftTimes(db: MockDb, delta: number): void {
  const s = (v: string | null | undefined) => shiftIso(v, delta);
  for (const p of db.posts) p.createdAt = s(p.createdAt)!;
  for (const c of db.comments) c.createdAt = s(c.createdAt)!;
  for (const f of db.follows) f.createdAt = s(f.createdAt)!;
  for (const r of db.reviews) r.createdAt = s(r.createdAt)!;
  for (const n of db.notifications) n.createdAt = s(n.createdAt)!;
  for (const m of db.moments) m.takenAt = s(m.takenAt)!;
  for (const pl of db.places) {
    pl.startsAt = s(pl.startsAt);
    pl.endsAt = s(pl.endsAt);
  }
  for (const t of db.trips) {
    t.startedAt = s(t.startedAt)!;
    t.endedAt = s(t.endedAt);
    t.lastPointAt = s(t.lastPointAt);
  }
  for (const list of Object.values(db.points)) for (const pt of list) pt.t = s(pt.t)!;
  for (const map of Object.values(db.unlocked)) for (const k of Object.keys(map) as (keyof typeof map)[]) map[k] = s(map[k])!;
  db.seedAt += delta;
}
