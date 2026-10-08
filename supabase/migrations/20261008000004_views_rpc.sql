-- =====================================================================================
-- WaySocial · views e funções de leitura usadas pelo app (SupabaseRepository)
-- Todas as views são security_invoker: o RLS de quem consulta continua valendo.
-- =====================================================================================

create view public.v_locations with (security_invoker = on) as
select
  l.id, l.kind, l.category, l.name, l.city_name, l.city_id, l.lat, l.lng, l.address, l.description,
  l.cover_url, l.scene, l.starts_at, l.ends_at,
  coalesce(r.n, 0) + l.rating_base_count as rating_count,
  case when coalesce(r.n, 0) + l.rating_base_count = 0 then 0
       else round(((l.rating_base_avg * l.rating_base_count + coalesce(r.s, 0)) / (l.rating_base_count + r.n))::numeric, 1)
  end as rating_avg
from public.locations l
left join lateral (
  select count(*)::int as n, coalesce(sum(stars), 0)::int as s from public.place_reviews pr where pr.location_id = l.id
) r on true;

create view public.v_posts with (security_invoker = on) as
select
  p.id, p.author_id, p.caption, p.created_at, p.location_id, p.lat, p.lng, p.location_precision, p.trip_id,
  a.username, a.display_name, a.avatar_url, a.avatar_seed, a.is_private,
  l.name as place_name, l.city_name as place_city, l.category as place_category,
  coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'type', m.type, 'url', m.url, 'scene', m.scene,
                                        'width', m.width, 'height', m.height, 'durationMs', m.duration_ms) order by m.position)
    from public.post_media m where m.post_id = p.id
  ), '[]'::jsonb) as media,
  (select count(*) from public.likes x where x.post_id = p.id)::int    as like_count,
  (select count(*) from public.comments c where c.post_id = p.id)::int as comment_count,
  exists (select 1 from public.likes x where x.post_id = p.id and x.user_id = auth.uid())       as liked_by_me,
  exists (select 1 from public.saved_posts s where s.post_id = p.id and s.user_id = auth.uid()) as saved_by_me
from public.posts p
join public.profiles a on a.id = p.author_id
left join public.locations l on l.id = p.location_id;

create view public.v_comments with (security_invoker = on) as
select c.id, c.post_id, c.body, c.created_at, c.author_id,
       a.username, a.display_name, a.avatar_url, a.avatar_seed, a.is_private
from public.comments c join public.profiles a on a.id = c.author_id;

create view public.v_reviews with (security_invoker = on) as
select r.id, r.location_id, r.stars, r.body, r.created_at, r.user_id,
       a.username, a.display_name, a.avatar_url, a.avatar_seed, a.is_private
from public.place_reviews r join public.profiles a on a.id = r.user_id;

create view public.v_trips with (security_invoker = on) as
select t.*,
       o.username as owner_username, o.display_name as owner_display_name, o.avatar_url as owner_avatar_url,
       o.avatar_seed as owner_avatar_seed, o.is_private as owner_is_private
from public.trips t join public.profiles o on o.id = t.owner_id;

create view public.v_notifications with (security_invoker = on) as
select n.id, n.user_id, n.type, n.post_id, n.comment_body, n.pending, n.read_at, n.created_at, n.actor_id,
       a.username, a.display_name, a.avatar_url, a.avatar_seed, a.is_private,
       (select jsonb_build_object('id', m.id, 'type', m.type, 'url', m.url, 'scene', m.scene, 'width', m.width, 'height', m.height)
          from public.post_media m where m.post_id = n.post_id order by m.position limit 1) as post_media
from public.notifications n join public.profiles a on a.id = n.actor_id;

revoke all on public.users, public.v_locations, public.v_posts, public.v_comments, public.v_reviews,
                public.v_trips, public.v_notifications from anon, authenticated;
grant select on public.users, public.v_locations, public.v_posts, public.v_comments, public.v_reviews,
                public.v_trips, public.v_notifications to authenticated;

-- ---------------------------------------------------------------- pulso dos lugares
create or replace function public.place_pulse(p_ids uuid[], p_tz text default 'America/Sao_Paulo')
returns table (location_id uuid, posts_today integer, people_now integer, last_author text, last_post_at timestamptz)
language sql stable security invoker as $$
  select l.id,
    (select count(*) from public.posts p
       where p.location_id = l.id and p.created_at >= (date_trunc('day', now() at time zone p_tz) at time zone p_tz))::int,
    (select count(distinct p.author_id) from public.posts p
       where p.location_id = l.id and p.created_at > now() - interval '2 hours')::int,
    (select split_part(a.display_name, ' ', 1) from public.posts p join public.profiles a on a.id = p.author_id
       where p.location_id = l.id order by p.created_at desc limit 1),
    (select max(p.created_at) from public.posts p where p.location_id = l.id)
  from public.locations l where l.id = any (p_ids);
$$;

-- ---------------------------------------------------------------- busca
create or replace function public.search_all(q text)
returns jsonb language plpgsql stable security invoker as $$
declare
  needle text := '%' || public.wy_norm(btrim(q)) || '%';
begin
  if char_length(btrim(q)) < 2 then
    return jsonb_build_object('cities', '[]'::jsonb, 'places', '[]'::jsonb, 'people', '[]'::jsonb, 'post_ids', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'cities', coalesce((select jsonb_agg(to_jsonb(v)) from public.v_locations v
                         where v.kind = 'city' and public.wy_norm(v.name) like needle), '[]'::jsonb),
    'places', coalesce((select jsonb_agg(to_jsonb(v) order by v.rating_count desc) from public.v_locations v
                         where v.kind <> 'city' and (public.wy_norm(v.name) like needle
                           or public.wy_norm(v.category::text) like needle or public.wy_norm(v.city_name) like needle)), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name,
                                                             'avatar_url', p.avatar_url, 'avatar_seed', p.avatar_seed, 'is_private', p.is_private))
                          from public.profiles p
                         where public.wy_norm(p.username::text) like needle or public.wy_norm(p.display_name) like needle
                            or public.wy_norm(coalesce(p.home_city, '')) like needle), '[]'::jsonb),
    'post_ids', coalesce((select jsonb_agg(x.id) from (
                            select po.id from public.posts po left join public.locations l on l.id = po.location_id
                             where public.wy_norm(po.caption) like needle or public.wy_norm(coalesce(l.name, '')) like needle
                                or public.wy_norm(coalesce(l.city_name, '')) like needle
                             order by po.created_at desc limit 30) x), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------- estatísticas do perfil
create or replace function public.profile_stats(p_user uuid)
returns table (posts integer, trips integer, places integer, followers integer, following integer)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.posts where author_id = p_user)::int,
    (select count(*) from public.trips t where t.owner_id = p_user and t.status = 'finished'
        and public.wy_can_see_trip(t.owner_id, t.visibility, t.status, t.share_live))::int,
    (select count(distinct location_id) from public.posts where author_id = p_user and location_id is not null)::int,
    (select count(*) from public.follows where followee_id = p_user and status = 'accepted')::int,
    (select count(*) from public.follows where follower_id = p_user and status = 'accepted')::int;
$$;

-- ---------------------------------------------------------------- conquistas
create or replace function public.wy_activity_metrics(p_user uuid, p_tz text default 'America/Sao_Paulo')
returns table (post_count integer, places integer, cities integer, beaches integer, finished_trips integer, streak_days integer)
language sql stable security definer set search_path = public as $$
  with d as (
    select distinct (created_at at time zone p_tz)::date as day from public.posts where author_id = p_user
  ), ranked as (
    select day, day - (row_number() over (order by day))::int as grp from d
  ), islands as (
    select max(day) as end_day, count(*)::int as len from ranked group by grp
  )
  select
    (select count(*) from public.posts where author_id = p_user)::int,
    (select count(distinct location_id) from public.posts where author_id = p_user and location_id is not null)::int,
    (select count(distinct l.city_name) from public.posts p join public.locations l on l.id = p.location_id where p.author_id = p_user)::int,
    (select count(distinct l.id) from public.posts p join public.locations l on l.id = p.location_id
       where p.author_id = p_user and l.category = 'beach')::int,
    (select count(*) from public.trips where owner_id = p_user and status = 'finished')::int,
    coalesce((select max(len) from islands where end_day >= (now() at time zone p_tz)::date - 1), 0)::int;
$$;

create or replace function public.achievement_progress(p_user uuid)
returns table (id text, title text, description text, emoji text, goal integer, progress integer, unlocked boolean, unlocked_at timestamptz)
language sql stable security definer set search_path = public as $$
  with m as (select * from public.wy_activity_metrics(p_user))
  select a.id, a.title, a.description, a.emoji, a.goal,
         case when ua.unlocked_at is not null then a.goal else least(a.goal, case a.id
           when 'first_post' then m.post_count
           when 'first_place' then m.places
           when 'first_trip' then m.finished_trips
           when 'ten_places_photographed' then m.places
           when 'five_cities' then m.cities
           when 'streak_7' then m.streak_days
           when 'ten_beaches' then m.beaches
           else 0 end) end::int,
         ua.unlocked_at is not null,
         ua.unlocked_at
  from public.achievements a
  cross join m
  left join public.user_achievements ua on ua.achievement_id = a.id and ua.user_id = p_user
  where public.wy_can_see_profile(p_user)
  order by a.sort_order;
$$;

-- Desbloqueia o que o usuário logado conquistou e devolve só as NOVAS (para a UI celebrar).
create or replace function public.refresh_achievements()
returns setof public.achievements language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then return; end if;
  return query
    with progress as (
      select a.id, a.goal,
             case a.id
               when 'first_post' then m.post_count when 'first_place' then m.places when 'first_trip' then m.finished_trips
               when 'ten_places_photographed' then m.places when 'five_cities' then m.cities
               when 'streak_7' then m.streak_days when 'ten_beaches' then m.beaches else 0 end as value
      from public.achievements a cross join public.wy_activity_metrics(me) m
    ), ins as (
      insert into public.user_achievements (user_id, achievement_id)
      select me, p.id from progress p where p.value >= p.goal
      on conflict do nothing
      returning achievement_id
    )
    select a.* from public.achievements a join ins on ins.achievement_id = a.id order by a.sort_order;
end $$;

grant execute on function public.place_pulse(uuid[], text), public.search_all(text), public.profile_stats(uuid),
  public.achievement_progress(uuid), public.refresh_achievements() to authenticated;
revoke execute on function public.wy_activity_metrics(uuid, text), public.wy_notify(uuid, public.notification_type, uuid, uuid, text, boolean) from public, anon, authenticated;
