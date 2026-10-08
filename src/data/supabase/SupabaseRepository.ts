import type { SupabaseClient } from '@supabase/supabase-js';

import type { FeedScope, NewMomentInput, ProfilePatch, ProfileView, WayRepository } from '../repository';
import { computeTripStats, defaultTripTitle } from '@/domain/tripStats';
import { canSeeProfileContent } from '@/domain/privacy';
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
  SearchResults,
  StartTripInput,
  Trip,
  TripDetail,
  TripMoment,
  TripPoint,
  TripVisibility,
} from '@/domain/types';
import { normalize } from '@/lib/format';
import { type LatLng, downsample } from '@/lib/geo';

import { type MediaUploader, SupabaseMediaUploader } from './media';

type Row = Record<string, any>;

const DAY_MS = 24 * 3600_000;

function fail(error: { message: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback);
}

/** PostgREST devolve `{ data, error }`; centraliza a checagem de erro. */
function ok<T>(res: { data: T | null; error: { message: string } | null }, fallback = 'Falha ao falar com o servidor.'): T {
  if (res.error) fail(res.error, fallback);
  return res.data as T;
}

/** `idKey` diz de qual coluna vem o ID da pessoa (as views trazem o ID do post/comentário em `id`). */
const preview = (r: Row, idKey = 'id', p = ''): ProfilePreview => ({
  id: r[idKey],
  username: r[`${p}username`],
  displayName: r[`${p}display_name`],
  avatarUrl: r[`${p}avatar_url`] ?? null,
  avatarSeed: r[`${p}avatar_seed`] ?? 0,
  isPrivate: !!r[`${p}is_private`],
});

function toProfile(r: Row): Profile {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    bio: r.bio ?? '',
    avatarUrl: r.avatar_url ?? null,
    avatarSeed: r.avatar_seed ?? 0,
    isPrivate: !!r.is_private,
    homeCity: r.home_city ?? null,
    defaultTripVisibility: r.default_trip_visibility,
    shareLocationByDefault: !!r.share_location_by_default,
    createdAt: r.created_at,
  };
}

function toPlace(r: Row): Place {
  return {
    id: r.id,
    kind: r.kind,
    category: r.category,
    name: r.name,
    cityName: r.city_name,
    cityId: r.city_id ?? null,
    lat: r.lat,
    lng: r.lng,
    address: r.address ?? null,
    description: r.description ?? null,
    scene: r.scene ?? { kind: 'city', seed: 1 },
    ratingAvg: Number(r.rating_avg ?? 0),
    ratingCount: r.rating_count ?? 0,
    startsAt: r.starts_at ?? null,
    endsAt: r.ends_at ?? null,
  };
}

function toMedia(m: Row): Media {
  return { id: m.id, type: m.type, uri: m.url ?? null, scene: m.scene ?? null, width: m.width ?? null, height: m.height ?? null, durationMs: m.durationMs ?? m.duration_ms ?? null };
}

function toTrip(r: Row): Trip {
  return {
    id: r.id,
    owner: preview(r, 'owner_id', 'owner_'),
    title: r.title,
    status: r.status,
    visibility: r.visibility,
    shareLive: !!r.share_live,
    simulated: !!r.simulated,
    originName: r.origin_name,
    destinationName: r.destination_name ?? null,
    plannedDestination: r.planned_destination ?? null,
    startedAt: r.started_at,
    endedAt: r.ended_at ?? null,
    distanceM: r.distance_m ?? 0,
    durationS: r.duration_s ?? 0,
    stopCount: r.stop_count ?? 0,
    photoCount: r.photo_count ?? 0,
    videoCount: r.video_count ?? 0,
    summary: r.summary ?? null,
    lastLat: r.last_lat ?? null,
    lastLng: r.last_lng ?? null,
    lastPointAt: r.last_point_at ?? null,
    routePreview: r.route_preview ?? [],
  };
}

const toPoint = (r: Row): TripPoint => ({ lat: r.lat, lng: r.lng, t: r.recorded_at, speed: r.speed ?? null, accuracy: r.accuracy ?? null, kind: r.kind });

/**
 * Implementação do `WayRepository` sobre Supabase (Postgres + RLS + Storage).
 *
 * Toda regra de privacidade é aplicada pelo BANCO (RLS, triggers, constraints — ver supabase/migrations).
 * Este arquivo só traduz linhas ⇄ tipos do domínio e orquestra as chamadas; ele não decide quem pode ver o quê.
 */
export class SupabaseRepository implements WayRepository {
  readonly mode = 'supabase' as const;

  private viewer: ID | null = null;
  private readonly listeners = new Set<() => void>();
  private newlyUnlocked: AchievementProgress[] = [];
  private realtime: { unsubscribe: () => unknown } | null = null;
  /** Acumuladores da viagem em andamento (distância/paradas), para atualizar o servidor sem reler tudo. */
  private readonly tripAcc = new Map<ID, { last: TripPoint | null; distanceM: number; stops: number; ready: Promise<void> }>();

  constructor(
    private readonly sb: SupabaseClient,
    private readonly uploader: MediaUploader = new SupabaseMediaUploader(sb),
    private readonly options: { realtime?: boolean } = {},
  ) {}

  // --- ciclo de vida ------------------------------------------------------------------------

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    for (const l of [...this.listeners]) l();
  }

  setViewer(userId: ID | null): void {
    if (this.viewer === userId) return;
    this.viewer = userId;
    void this.realtime?.unsubscribe();
    this.realtime = null;
    if (userId && this.options.realtime !== false) {
      // notificações novas chegam por Realtime (a tabela precisa estar na publicação supabase_realtime)
      this.realtime = this.sb
        .channel(`notifications:${userId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => this.emit())
        .subscribe();
    }
    this.emit();
  }

  viewerId(): ID | null {
    return this.viewer;
  }

  async flush(): Promise<void> {
    // nada pendente: cada mutação já foi gravada no servidor
  }

  private me(): ID {
    if (!this.viewer) throw new Error('Faça login para continuar.');
    return this.viewer;
  }

  // --- helpers ------------------------------------------------------------------------------

  private async followingIds(): Promise<Set<ID>> {
    if (!this.viewer) return new Set();
    const rows = ok(await this.sb.from('follows').select('followee_id').eq('follower_id', this.viewer).eq('status', 'accepted')) as Row[];
    return new Set(rows.map((r) => r.followee_id));
  }

  private async toPostViews(rows: Row[]): Promise<PostView[]> {
    await this.uploader.resolve(rows.flatMap((r) => r.media as Row[]));
    return rows.map((r) => ({
      id: r.id,
      author: preview(r, 'author_id'),
      caption: r.caption,
      createdAt: r.created_at,
      place: r.location_id ? { id: r.location_id, name: r.place_name, cityName: r.place_city, category: r.place_category } : null,
      lat: r.lat ?? null,
      lng: r.lng ?? null,
      precision: r.location_precision,
      media: (r.media as Row[]).map(toMedia),
      tripId: r.trip_id ?? null,
      likeCount: r.like_count,
      commentCount: r.comment_count,
      likedByMe: !!r.liked_by_me,
      savedByMe: !!r.saved_by_me,
    }));
  }

  private async posts(build: (q: any) => any): Promise<PostView[]> {
    const rows = ok(await build(this.sb.from('v_posts').select('*'))) as Row[];
    return this.toPostViews(rows);
  }

  private async refreshAchievements(): Promise<void> {
    const { data, error } = await this.sb.rpc('refresh_achievements');
    if (error || !Array.isArray(data)) return;
    for (const a of data as Row[]) {
      this.newlyUnlocked.push({ id: a.id, title: a.title, description: a.description, emoji: a.emoji, goal: a.goal, progress: a.goal, unlocked: true, unlockedAt: new Date().toISOString() });
    }
  }

  async popNewAchievements(): Promise<AchievementProgress[]> {
    const out = this.newlyUnlocked;
    this.newlyUnlocked = [];
    return out;
  }

  // --- perfis & social ----------------------------------------------------------------------

  async getProfileView(userId: ID): Promise<ProfileView | null> {
    const row = ok(await this.sb.from('profiles').select('*').eq('id', userId).maybeSingle()) as Row | null;
    if (!row) return null;
    const profile = toProfile(row);
    const isMe = this.viewer === userId;
    const [statsRes, relRes] = await Promise.all([
      this.sb.rpc('profile_stats', { p_user: userId }),
      this.viewer && !isMe ? this.sb.from('follows').select('status').eq('follower_id', this.viewer).eq('followee_id', userId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    const s = (ok(statsRes as any) as Row[])[0] ?? {};
    const rel = ok(relRes as any) as Row | null;
    const followState: FollowState = !rel ? 'none' : rel.status === 'accepted' ? 'following' : 'requested';
    return {
      profile,
      isMe,
      followState,
      canViewContent: canSeeProfileContent({ viewerId: this.viewer, following: new Set(followState === 'following' ? [userId] : []) }, profile),
      stats: { posts: s.posts ?? 0, trips: s.trips ?? 0, places: s.places ?? 0, followers: s.followers ?? 0, following: s.following ?? 0 },
    };
  }

  async getMyProfile(): Promise<Profile | null> {
    if (!this.viewer) return null;
    const row = ok(await this.sb.from('profiles').select('*').eq('id', this.viewer).maybeSingle()) as Row | null;
    return row ? toProfile(row) : null;
  }

  async updateProfile(patch: ProfilePatch): Promise<Profile> {
    const map: Record<string, string> = {
      displayName: 'display_name',
      bio: 'bio',
      avatarUrl: 'avatar_url',
      isPrivate: 'is_private',
      homeCity: 'home_city',
      defaultTripVisibility: 'default_trip_visibility',
      shareLocationByDefault: 'share_location_by_default',
    };
    const update: Row = {};
    for (const [k, v] of Object.entries(patch)) if (k in map && v !== undefined) update[map[k]] = v;
    const row = ok(await this.sb.from('profiles').update(update).eq('id', this.me()).select('*').single()) as Row;
    this.emit();
    return toProfile(row);
  }

  async follow(userId: ID): Promise<FollowState> {
    const me = this.me();
    const existing = ok(await this.sb.from('follows').select('status').eq('follower_id', me).eq('followee_id', userId).maybeSingle()) as Row | null;
    if (existing) return existing.status === 'accepted' ? 'following' : 'requested';
    // o status é decidido pelo servidor (perfil privado ⇒ pending)
    ok(await this.sb.from('follows').insert({ follower_id: me, followee_id: userId }));
    const rel = ok(await this.sb.from('follows').select('status').eq('follower_id', me).eq('followee_id', userId).single()) as Row;
    this.emit();
    return rel.status === 'accepted' ? 'following' : 'requested';
  }

  async unfollow(userId: ID): Promise<void> {
    ok(await this.sb.from('follows').delete().eq('follower_id', this.me()).eq('followee_id', userId));
    this.emit();
  }

  async respondFollowRequest(requesterId: ID, accept: boolean): Promise<void> {
    const me = this.me();
    if (accept) ok(await this.sb.from('follows').update({ status: 'accepted' }).eq('follower_id', requesterId).eq('followee_id', me));
    else ok(await this.sb.from('follows').delete().eq('follower_id', requesterId).eq('followee_id', me));
    this.emit();
  }

  async listFollowers(userId: ID): Promise<ProfilePreview[]> {
    const rows = ok(await this.sb.from('follows').select('p:profiles!follows_follower_id_fkey(id,username,display_name,avatar_url,avatar_seed,is_private)').eq('followee_id', userId).eq('status', 'accepted')) as Row[];
    return rows.map((r) => preview(r.p));
  }

  async listFollowing(userId: ID): Promise<ProfilePreview[]> {
    const rows = ok(await this.sb.from('follows').select('p:profiles!follows_followee_id_fkey(id,username,display_name,avatar_url,avatar_seed,is_private)').eq('follower_id', userId).eq('status', 'accepted')) as Row[];
    return rows.map((r) => preview(r.p));
  }

  async suggestedProfiles(): Promise<ProfilePreview[]> {
    const me = this.viewer;
    const rel = me ? (ok(await this.sb.from('follows').select('followee_id').eq('follower_id', me)) as Row[]).map((r) => r.followee_id) : [];
    const exclude = [...rel, ...(me ? [me] : [])];
    let q = this.sb.from('profiles').select('id,username,display_name,avatar_url,avatar_seed,is_private').limit(12);
    if (exclude.length) q = q.not('id', 'in', `(${exclude.join(',')})`);
    return (ok(await q) as Row[]).map((r) => preview(r));
  }

  // --- publicações --------------------------------------------------------------------------

  async getFeed(scope: FeedScope): Promise<PostView[]> {
    if (scope === 'following') {
      const ids = [...(await this.followingIds()), this.me()];
      return this.posts((q) => q.in('author_id', ids).order('created_at', { ascending: false }).limit(60));
    }
    return this.posts((q) => q.order('created_at', { ascending: false }).limit(60));
  }

  async getPost(id: ID): Promise<PostView | null> {
    const rows = ok(await this.sb.from('v_posts').select('*').eq('id', id)) as Row[];
    return (await this.toPostViews(rows))[0] ?? null;
  }

  listPostsByUser(userId: ID): Promise<PostView[]> {
    return this.posts((q) => q.eq('author_id', userId).order('created_at', { ascending: false }).limit(120));
  }

  async listPostsByPlace(placeId: ID, limit = 60): Promise<PostView[]> {
    const place = await this.getPlace(placeId);
    if (!place) return [];
    return this.posts((q) => (place.kind === 'city' ? q.eq('place_city', place.name) : q.eq('location_id', placeId)).order('created_at', { ascending: false }).limit(limit));
  }

  async listSavedPosts(): Promise<PostView[]> {
    const rows = ok(await this.sb.from('saved_posts').select('post_id,created_at').eq('user_id', this.me()).order('created_at', { ascending: false })) as Row[];
    if (rows.length === 0) return [];
    const posts = await this.posts((q) => q.in('id', rows.map((r) => r.post_id)));
    const order = new Map(rows.map((r, i) => [r.post_id, i]));
    return posts.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  async createPost(input: NewPostInput): Promise<PostView> {
    const me = this.me();
    if (input.media.length === 0) throw new Error('Adicione uma foto ou vídeo.');
    const uploaded = await Promise.all(input.media.map((m) => this.uploader.upload(me, m)));

    const wantsPlace = input.precision === 'place' && input.placeId;
    const wantsDevice = (input.precision === 'exact' || input.precision === 'approx') && input.deviceLocation;
    const precision = wantsPlace ? 'place' : wantsDevice ? input.precision : 'none';
    const row = ok(
      await this.sb
        .from('posts')
        .insert({
          author_id: me,
          caption: input.caption.trim(),
          location_precision: precision,
          location_id: precision === 'place' || (wantsDevice && input.placeId) ? input.placeId : null,
          lat: wantsDevice ? input.deviceLocation!.lat : null,
          lng: wantsDevice ? input.deviceLocation!.lng : null,
          trip_id: input.tripId ?? null,
        })
        .select('id')
        .single(),
    ) as Row;
    const mediaRes = await this.sb.from('post_media').insert(
      uploaded.map((m, i) => ({ post_id: row.id, position: i, type: m.type, url: m.uri ?? null, scene: m.scene ?? null, width: m.width ?? null, height: m.height ?? null, duration_ms: m.durationMs ?? null })),
    );
    if (mediaRes.error) {
      await this.sb.from('posts').delete().eq('id', row.id);
      fail(mediaRes.error, 'Não foi possível salvar a mídia.');
    }
    await this.refreshAchievements();
    this.emit();
    const post = await this.getPost(row.id);
    if (!post) throw new Error('Publicação criada, mas não foi possível carregá-la.');
    return post;
  }

  async deletePost(id: ID): Promise<void> {
    ok(await this.sb.from('posts').delete().eq('id', id).eq('author_id', this.me()));
    this.emit();
  }

  async removePostLocation(id: ID): Promise<PostView> {
    ok(await this.sb.from('posts').update({ location_precision: 'none', location_id: null, lat: null, lng: null }).eq('id', id).eq('author_id', this.me()));
    this.emit();
    const post = await this.getPost(id);
    if (!post) throw new Error('Publicação não encontrada.');
    return post;
  }

  async toggleLike(postId: ID): Promise<{ liked: boolean; count: number }> {
    const me = this.me();
    const existing = ok(await this.sb.from('likes').select('post_id').eq('post_id', postId).eq('user_id', me).maybeSingle()) as Row | null;
    if (existing) ok(await this.sb.from('likes').delete().eq('post_id', postId).eq('user_id', me));
    else ok(await this.sb.from('likes').insert({ post_id: postId, user_id: me }));
    const row = ok(await this.sb.from('v_posts').select('like_count').eq('id', postId).single()) as Row;
    this.emit();
    return { liked: !existing, count: row.like_count };
  }

  async toggleSave(postId: ID): Promise<boolean> {
    const me = this.me();
    const existing = ok(await this.sb.from('saved_posts').select('post_id').eq('post_id', postId).eq('user_id', me).maybeSingle()) as Row | null;
    if (existing) ok(await this.sb.from('saved_posts').delete().eq('post_id', postId).eq('user_id', me));
    else ok(await this.sb.from('saved_posts').insert({ post_id: postId, user_id: me }));
    this.emit();
    return !existing;
  }

  async listComments(postId: ID): Promise<CommentView[]> {
    const rows = ok(await this.sb.from('v_comments').select('*').eq('post_id', postId).order('created_at', { ascending: true })) as Row[];
    return rows.map((r) => ({ id: r.id, postId: r.post_id, author: preview(r, 'author_id'), text: r.body, createdAt: r.created_at }));
  }

  async addComment(postId: ID, text: string): Promise<CommentView> {
    const me = this.me();
    const clean = text.trim();
    if (!clean) throw new Error('Escreva um comentário.');
    const ins = ok(await this.sb.from('comments').insert({ post_id: postId, author_id: me, body: clean.slice(0, 500) }).select('id').single()) as Row;
    const r = ok(await this.sb.from('v_comments').select('*').eq('id', ins.id).single()) as Row;
    this.emit();
    return { id: r.id, postId: r.post_id, author: preview(r, 'author_id'), text: r.body, createdAt: r.created_at };
  }

  // --- lugares ------------------------------------------------------------------------------

  async getPlace(id: ID): Promise<Place | null> {
    const row = ok(await this.sb.from('v_locations').select('*').eq('id', id).maybeSingle()) as Row | null;
    return row ? toPlace(row) : null;
  }

  async listPlaces(opts: { cityName?: string; limit?: number } = {}): Promise<Place[]> {
    let q = this.sb.from('v_locations').select('*').neq('kind', 'city').order('rating_count', { ascending: false });
    if (opts.cityName) q = q.ilike('city_name', opts.cityName);
    if (opts.limit) q = q.limit(opts.limit);
    return (ok(await q) as Row[]).map(toPlace);
  }

  async getPlacePulse(placeId: ID): Promise<PlacePulse> {
    const rows = ok(await this.sb.rpc('place_pulse', { p_ids: [placeId] })) as Row[];
    const r = rows[0];
    if (!r) return { placeId, postsToday: 0, peopleNow: 0, lastPost: null };
    return { placeId, postsToday: r.posts_today, peopleNow: r.people_now, lastPost: r.last_post_at ? { authorName: r.last_author, createdAt: r.last_post_at } : null };
  }

  async listPlaceVisitors(placeId: ID): Promise<{ profile: ProfilePreview; at: ISODate }[]> {
    const rows = ok(await this.sb.from('v_posts').select('author_id,username,display_name,avatar_url,avatar_seed,is_private,created_at').eq('location_id', placeId).order('created_at', { ascending: false }).limit(80)) as Row[];
    const seen = new Set<ID>();
    const out: { profile: ProfilePreview; at: ISODate }[] = [];
    for (const r of rows) {
      if (seen.has(r.author_id)) continue;
      seen.add(r.author_id);
      out.push({ profile: preview(r, 'author_id'), at: r.created_at });
    }
    return out.slice(0, 12);
  }

  async listPlaceReviews(placeId: ID): Promise<PlaceReview[]> {
    const rows = ok(await this.sb.from('v_reviews').select('*').eq('location_id', placeId).order('created_at', { ascending: false }).limit(30)) as Row[];
    return rows.map((r) => ({ id: r.id, placeId, author: preview(r, 'user_id'), stars: r.stars, text: r.body ?? null, createdAt: r.created_at }));
  }

  async getMyPlaceRating(placeId: ID): Promise<number | null> {
    const r = ok(await this.sb.from('place_reviews').select('stars').eq('location_id', placeId).eq('user_id', this.me()).maybeSingle()) as Row | null;
    return r?.stars ?? null;
  }

  async ratePlace(placeId: ID, stars: number, text?: string | null): Promise<Place> {
    const s = Math.max(1, Math.min(5, Math.round(stars)));
    ok(await this.sb.from('place_reviews').upsert({ location_id: placeId, user_id: this.me(), stars: s, body: text?.trim() || null }, { onConflict: 'location_id,user_id' }));
    this.emit();
    const place = await this.getPlace(placeId);
    if (!place) throw new Error('Lugar não encontrado.');
    return place;
  }

  async isPlaceSaved(placeId: ID): Promise<boolean> {
    if (!this.viewer) return false;
    const r = ok(await this.sb.from('saved_places').select('location_id').eq('location_id', placeId).eq('user_id', this.viewer).maybeSingle()) as Row | null;
    return !!r;
  }

  async toggleSavePlace(placeId: ID): Promise<boolean> {
    const was = await this.isPlaceSaved(placeId);
    if (was) ok(await this.sb.from('saved_places').delete().eq('location_id', placeId).eq('user_id', this.me()));
    else ok(await this.sb.from('saved_places').insert({ location_id: placeId, user_id: this.me() }));
    this.emit();
    return !was;
  }

  async listVisitedPlaces(userId: ID): Promise<Place[]> {
    const rows = ok(await this.sb.from('v_posts').select('location_id,created_at').eq('author_id', userId).not('location_id', 'is', null).order('created_at', { ascending: false }).limit(300)) as Row[];
    const ids = [...new Set(rows.map((r) => r.location_id as string))];
    if (ids.length === 0) return [];
    const places = (ok(await this.sb.from('v_locations').select('*').in('id', ids)) as Row[]).map(toPlace);
    const order = new Map(ids.map((id, i) => [id, i]));
    return places.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  // --- mapa ---------------------------------------------------------------------------------

  async getMapItems(opts: { center: LatLng; radiusM: number; filter: MapFilter }): Promise<MapItem[]> {
    const { center, radiusM, filter } = opts;
    const dLat = radiusM / 111_320;
    const dLng = radiusM / (111_320 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)));
    const box = { minLat: center.lat - dLat, maxLat: center.lat + dLat, minLng: center.lng - dLng, maxLng: center.lng + dLng };
    const items: MapItem[] = [];
    const postPlaceIds = new Set<ID>();

    if (filter === 'all' || filter === 'posts') {
      const since = new Date(Date.now() - 7 * DAY_MS).toISOString();
      const rows = ok(
        await this.sb.from('v_posts').select('*').gte('lat', box.minLat).lte('lat', box.maxLat).gte('lng', box.minLng).lte('lng', box.maxLng).gte('created_at', since).order('created_at', { ascending: false }).limit(250),
      ) as Row[];
      const views = await this.toPostViews(rows);
      const groups = new Map<string, PostView[]>();
      for (const p of views) {
        const key = p.place?.id ?? `${p.lat!.toFixed(3)},${p.lng!.toFixed(3)}`;
        groups.set(key, [...(groups.get(key) ?? []), p]);
      }
      const placeIds = [...new Set(views.map((p) => p.place?.id).filter(Boolean) as ID[])];
      const pulses = await this.pulses(placeIds);
      for (const group of groups.values()) {
        const latest = group[0];
        if (latest.place) postPlaceIds.add(latest.place.id);
        items.push({ type: 'post', id: latest.id, lat: latest.lat!, lng: latest.lng!, post: latest, count: group.length, pulse: latest.place ? (pulses.get(latest.place.id) ?? null) : null });
      }
    }

    const wantsPlaces = filter === 'all' || filter === 'places' || filter === 'food' || filter === 'events';
    if (wantsPlaces) {
      let q = this.sb.from('v_locations').select('*').neq('kind', 'city').gte('lat', box.minLat).lte('lat', box.maxLat).gte('lng', box.minLng).lte('lng', box.maxLng).limit(300);
      if (filter === 'places') q = q.eq('kind', 'place');
      if (filter === 'food') q = q.in('category', ['restaurant', 'cafe', 'bar']);
      if (filter === 'events') q = q.eq('kind', 'event');
      const places = (ok(await q) as Row[]).map(toPlace).filter((p) => (filter === 'all' ? p.kind === 'event' || !postPlaceIds.has(p.id) : true));
      const pulses = await this.pulses(places.map((p) => p.id));
      for (const p of places) {
        const pulse = pulses.get(p.id) ?? { placeId: p.id, postsToday: 0, peopleNow: 0, lastPost: null };
        items.push(p.kind === 'event' ? { type: 'event', id: p.id, lat: p.lat, lng: p.lng, place: p, pulse } : { type: 'place', id: p.id, lat: p.lat, lng: p.lng, place: p, pulse });
      }
    }

    if (filter === 'all' || filter === 'trips') {
      // o RLS só devolve viagens ativas com compartilhamento ligado que o viewer pode ver
      const rows = ok(
        await this.sb.from('v_trips').select('*').eq('status', 'active').eq('share_live', true).neq('owner_id', this.me()).gte('last_lat', box.minLat).lte('last_lat', box.maxLat).gte('last_lng', box.minLng).lte('last_lng', box.maxLng),
      ) as Row[];
      for (const r of rows) {
        const trip = toTrip(r);
        items.push({ type: 'live', id: trip.id, lat: trip.lastLat!, lng: trip.lastLng!, trip });
      }
    }
    return items;
  }

  private async pulses(ids: ID[]): Promise<Map<ID, PlacePulse>> {
    const out = new Map<ID, PlacePulse>();
    if (ids.length === 0) return out;
    const rows = ok(await this.sb.rpc('place_pulse', { p_ids: ids })) as Row[];
    for (const r of rows) out.set(r.location_id, { placeId: r.location_id, postsToday: r.posts_today, peopleNow: r.people_now, lastPost: r.last_post_at ? { authorName: r.last_author, createdAt: r.last_post_at } : null });
    return out;
  }

  // --- viagens ------------------------------------------------------------------------------

  private async tripDetail(r: Row): Promise<TripDetail> {
    const trip = toTrip(r);
    const [pointsRows, momentRows] = await Promise.all([
      this.fetchAllPoints(trip.id),
      this.sb.from('trip_media').select('*').eq('trip_id', trip.id).order('taken_at', { ascending: true }),
    ]);
    const moments = ok(momentRows as any) as Row[];
    await this.uploader.resolve(moments);
    return {
      ...trip,
      points: pointsRows.map(toPoint),
      moments: moments.map<TripMoment>((m) => ({
        id: m.id,
        tripId: m.trip_id,
        media: toMedia({ id: m.id, type: m.type, url: m.url, scene: m.scene, width: m.width, height: m.height, duration_ms: m.duration_ms }),
        caption: m.caption ?? null,
        lat: m.lat,
        lng: m.lng,
        takenAt: m.taken_at,
        postId: m.post_id ?? null,
      })),
    };
  }

  /** PostgREST limita linhas por requisição (padrão 1000): pagina para trajetos longos. */
  private async fetchAllPoints(tripId: ID): Promise<Row[]> {
    const out: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const page = ok(await this.sb.from('trip_points').select('lat,lng,recorded_at,speed,accuracy,kind').eq('trip_id', tripId).order('recorded_at', { ascending: true }).order('id', { ascending: true }).range(from, from + 999)) as Row[];
      out.push(...page);
      if (page.length < 1000) break;
    }
    return out;
  }

  async getActiveTrip(): Promise<TripDetail | null> {
    if (!this.viewer) return null;
    const r = ok(await this.sb.from('v_trips').select('*').eq('owner_id', this.viewer).eq('status', 'active').maybeSingle()) as Row | null;
    return r ? this.tripDetail(r) : null;
  }

  async startTrip(input: StartTripInput): Promise<TripDetail> {
    const me = this.me();
    const now = new Date().toISOString();
    const row = ok(
      await this.sb
        .from('trips')
        .insert({
          owner_id: me,
          title: defaultTripTitle(input.originName, input.plannedDestination),
          status: 'active',
          visibility: input.visibility,
          share_live: input.shareLive && input.visibility !== 'private',
          simulated: input.simulated,
          origin_name: input.originName,
          planned_destination: input.plannedDestination?.trim() || null,
          started_at: now,
          last_lat: input.origin.lat,
          last_lng: input.origin.lng,
          last_point_at: now,
        })
        .select('id')
        .single(),
    ) as Row;
    ok(await this.sb.from('trip_points').insert({ trip_id: row.id, recorded_at: now, lat: input.origin.lat, lng: input.origin.lng, speed: 0, kind: 'track' }));
    this.emit();
    const detail = await this.getTrip(row.id);
    if (!detail) throw new Error('Viagem criada, mas não foi possível carregá-la.');
    return detail;
  }

  private async accumulator(tripId: ID) {
    let acc = this.tripAcc.get(tripId);
    if (!acc) {
      const state = { last: null as TripPoint | null, distanceM: 0, stops: 0 };
      const ready = (async () => {
        const pts = (await this.fetchAllPoints(tripId)).map(toPoint);
        const stats = computeTripStats(pts, [], pts[0]?.t ?? new Date().toISOString(), null);
        state.last = pts[pts.length - 1] ?? null;
        state.distanceM = stats.distanceM;
        state.stops = stats.stopCount;
      })();
      acc = Object.assign(state, { ready });
      this.tripAcc.set(tripId, acc);
    }
    await acc.ready;
    return acc;
  }

  async appendTripPoints(tripId: ID, points: TripPoint[]): Promise<void> {
    if (points.length === 0) return;
    this.me();
    const acc = await this.accumulator(tripId);
    ok(await this.sb.from('trip_points').insert(points.map((p) => ({ trip_id: tripId, recorded_at: p.t, lat: p.lat, lng: p.lng, speed: p.speed ?? null, accuracy: p.accuracy ?? null, kind: p.kind }))));
    const added = computeTripStats([...(acc.last ? [acc.last] : []), ...points], [], (acc.last ?? points[0]).t, null);
    acc.distanceM += added.distanceM;
    acc.stops += points.filter((p) => p.kind === 'stop').length;
    acc.last = points[points.length - 1];
    const startedAt = ok(await this.sb.from('trips').select('started_at').eq('id', tripId).single()) as Row;
    ok(
      await this.sb.from('trips').update({
        distance_m: acc.distanceM,
        stop_count: acc.stops,
        duration_s: Math.max(0, Math.round((new Date(acc.last.t).getTime() - new Date(startedAt.started_at).getTime()) / 1000)),
        last_lat: acc.last.lat,
        last_lng: acc.last.lng,
        last_point_at: acc.last.t,
      }).eq('id', tripId).eq('owner_id', this.me()),
    );
    this.emit();
  }

  async addTripMoment(tripId: ID, input: NewMomentInput): Promise<TripMoment> {
    const me = this.me();
    const uploaded = await this.uploader.upload(me, input.media);
    let postId: ID | null = null;
    if (input.publishToFeed) {
      // no feed, um momento de viagem só leva a posição APROXIMADA (~1 km)
      const post = await this.createPost({ media: [input.media], caption: input.caption ?? '', deviceLocation: { lat: input.lat, lng: input.lng }, precision: 'approx', tripId });
      postId = post.id;
    }
    const row = ok(
      await this.sb
        .from('trip_media')
        .insert({ trip_id: tripId, post_id: postId, type: uploaded.type, url: uploaded.uri ?? null, scene: uploaded.scene ?? null, width: uploaded.width ?? null, height: uploaded.height ?? null, duration_ms: uploaded.durationMs ?? null, caption: input.caption?.trim() || null, lat: input.lat, lng: input.lng, taken_at: input.takenAt })
        .select('*')
        .single(),
    ) as Row;
    const counts = ok(await this.sb.from('trips').select('photo_count,video_count').eq('id', tripId).single()) as Row;
    ok(await this.sb.from('trips').update(uploaded.type === 'video' ? { video_count: counts.video_count + 1 } : { photo_count: counts.photo_count + 1 }).eq('id', tripId));
    this.emit();
    await this.uploader.resolve([row]);
    return { id: row.id, tripId, media: toMedia({ id: row.id, type: row.type, url: row.url, scene: row.scene, width: row.width, height: row.height, duration_ms: row.duration_ms }), caption: row.caption ?? null, lat: row.lat, lng: row.lng, takenAt: row.taken_at, postId };
  }

  async setTripShareLive(tripId: ID, shareLive: boolean): Promise<Trip> {
    ok(await this.sb.from('trips').update({ share_live: shareLive }).eq('id', tripId).eq('owner_id', this.me()));
    const r = ok(await this.sb.from('v_trips').select('*').eq('id', tripId).single()) as Row;
    this.emit();
    return toTrip(r);
  }

  async finishTrip(input: FinishTripInput): Promise<TripDetail> {
    const me = this.me();
    if (input.points.length) await this.appendTripPoints(input.tripId, input.points);
    const trip = ok(await this.sb.from('trips').select('*').eq('id', input.tripId).eq('owner_id', me).single()) as Row;
    const pts = (await this.fetchAllPoints(input.tripId)).map(toPoint);
    const endedAt = new Date(new Date(trip.started_at).getTime() + input.durationS * 1000).toISOString();
    const stats = computeTripStats(pts, [], trip.started_at, endedAt);
    const destination = input.destinationName ?? trip.planned_destination ?? null;
    ok(
      await this.sb.from('trips').update({
        status: 'finished',
        share_live: false,
        ended_at: endedAt,
        distance_m: stats.distanceM || input.distanceM,
        duration_s: input.durationS,
        stop_count: stats.stopCount,
        destination_name: destination,
        title: defaultTripTitle(trip.origin_name, destination),
        summary: input.summary ?? null,
        route_preview: downsample(pts, 48),
        last_lat: pts[pts.length - 1]?.lat ?? trip.last_lat,
        last_lng: pts[pts.length - 1]?.lng ?? trip.last_lng,
      }).eq('id', input.tripId),
    );
    this.tripAcc.delete(input.tripId);
    await this.refreshAchievements();
    this.emit();
    const detail = await this.getTrip(input.tripId);
    if (!detail) throw new Error('Viagem finalizada, mas não foi possível carregá-la.');
    return detail;
  }

  async cancelTrip(tripId: ID): Promise<void> {
    ok(await this.sb.from('trips').delete().eq('id', tripId).eq('owner_id', this.me()));
    this.tripAcc.delete(tripId);
    this.emit();
  }

  async getTrip(id: ID): Promise<TripDetail | null> {
    const r = ok(await this.sb.from('v_trips').select('*').eq('id', id).maybeSingle()) as Row | null;
    return r ? this.tripDetail(r) : null;
  }

  async listTrips(userId: ID): Promise<Trip[]> {
    return (ok(await this.sb.from('v_trips').select('*').eq('owner_id', userId).eq('status', 'finished').order('started_at', { ascending: false }).limit(60)) as Row[]).map(toTrip);
  }

  async listTripFeed(): Promise<Trip[]> {
    return (ok(await this.sb.from('v_trips').select('*').eq('status', 'finished').neq('owner_id', this.me()).order('started_at', { ascending: false }).limit(40)) as Row[]).map(toTrip);
  }

  async updateTrip(id: ID, patch: { title?: string; visibility?: TripVisibility; summary?: string | null }): Promise<Trip> {
    const update: Row = {};
    if (patch.title !== undefined) update.title = patch.title.trim();
    if (patch.visibility) update.visibility = patch.visibility;
    if (patch.summary !== undefined) update.summary = patch.summary;
    ok(await this.sb.from('trips').update(update).eq('id', id).eq('owner_id', this.me()));
    const r = ok(await this.sb.from('v_trips').select('*').eq('id', id).single()) as Row;
    this.emit();
    return toTrip(r);
  }

  async deleteTrip(id: ID): Promise<void> {
    await this.cancelTrip(id);
  }

  // --- busca --------------------------------------------------------------------------------

  async search(query: string): Promise<SearchResults> {
    const empty: SearchResults = { query, cities: [], places: [], people: [], posts: [], cityHub: null };
    if (query.trim().length < 2) return empty;
    const res = ok(await this.sb.rpc('search_all', { q: query })) as Row;
    const cities = (res.cities as Row[]).map(toPlace);
    const places = (res.places as Row[]).map(toPlace);
    const people = (res.people as Row[]).map((r) => preview(r));
    const postIds = res.post_ids as string[];
    const posts = postIds.length ? await this.posts((q) => q.in('id', postIds).order('created_at', { ascending: false })) : [];

    let cityHub: SearchResults['cityHub'] = null;
    const q = normalize(query);
    const city = cities.find((c) => normalize(c.name) === q) ?? cities[0];
    if (city) {
      const [topPlaces, recent] = await Promise.all([this.listPlaces({ cityName: city.name, limit: 6 }), this.posts((b) => b.eq('place_city', city.name).order('created_at', { ascending: false }).limit(9))]);
      const authorIds = [...new Set(recent.map((p) => p.author.id))];
      const homeRows = ok(await this.sb.from('profiles').select('id,username,display_name,avatar_url,avatar_seed,is_private').ilike('home_city', city.name).limit(10)) as Row[];
      const hubPeople = new Map<ID, ProfilePreview>();
      for (const p of recent) hubPeople.set(p.author.id, p.author);
      for (const r of homeRows) hubPeople.set(r.id, preview(r));
      void authorIds;
      cityHub = { city, topPlaces, recentPosts: recent, people: [...hubPeople.values()] };
    }
    return { query, cities, places, people, posts, cityHub };
  }

  // --- notificações -------------------------------------------------------------------------

  async listNotifications(): Promise<NotificationView[]> {
    const rows = ok(await this.sb.from('v_notifications').select('*').eq('user_id', this.me()).order('created_at', { ascending: false }).limit(80)) as Row[];
    const media = rows.map((r) => r.post_media).filter(Boolean) as Row[];
    await this.uploader.resolve(media);
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      actor: preview(r, 'actor_id'),
      createdAt: r.created_at,
      read: !!r.read_at,
      post: r.post_id ? { id: r.post_id, media: r.post_media ? toMedia(r.post_media) : null } : null,
      commentText: r.comment_body ?? null,
      pending: !!r.pending,
    }));
  }

  async unreadNotificationCount(): Promise<number> {
    if (!this.viewer) return 0;
    const res = await this.sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', this.viewer).is('read_at', null);
    if (res.error) return 0;
    return res.count ?? 0;
  }

  async markNotificationsRead(): Promise<void> {
    ok(await this.sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', this.me()).is('read_at', null).eq('pending', false));
    this.emit();
  }

  // --- conquistas ---------------------------------------------------------------------------

  async listAchievements(userId: ID): Promise<AchievementProgress[]> {
    const rows = ok(await this.sb.rpc('achievement_progress', { p_user: userId })) as Row[];
    return rows.map((r) => ({ id: r.id, title: r.title, description: r.description, emoji: r.emoji, goal: r.goal, progress: r.progress, unlocked: r.unlocked, unlockedAt: r.unlocked_at ?? null }));
  }
}
