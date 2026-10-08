-- =====================================================================================
-- WaySocial · schema base
--
-- users ........ auth.users (Supabase Auth) — credenciais NUNCA ficam em tabelas públicas.
--                public.users é uma view só com colunas públicas.
-- profiles ..... 1:1 com auth.users (criado por trigger no cadastro)
-- locations .... cidades, lugares e eventos
-- posts / post_media / comments / likes / saved_posts
-- follows ...... status pending|accepted (perfil privado exige aprovação)
-- trips / trip_points / trip_media
-- notifications, achievements, user_achievements
-- place_reviews, saved_places
--
-- Convenções: PK uuid; created_at timestamptz; lat/lng double precision (WGS84).
-- Pronto para PostGIS no futuro: basta adicionar uma coluna geography e um índice GiST.
-- =====================================================================================

create extension if not exists citext with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- tipos
create type public.trip_visibility    as enum ('public', 'followers', 'private');
create type public.trip_status        as enum ('active', 'finished');
create type public.follow_status      as enum ('pending', 'accepted');
create type public.location_precision as enum ('place', 'exact', 'approx', 'none');
create type public.media_type         as enum ('image', 'video');
create type public.place_kind         as enum ('city', 'place', 'event');
create type public.place_category     as enum ('city', 'beach', 'restaurant', 'cafe', 'bar', 'park', 'viewpoint', 'landmark', 'shop', 'event');
create type public.point_kind         as enum ('track', 'stop');
create type public.notification_type  as enum ('like', 'comment', 'follow', 'follow_request', 'follow_accepted', 'save');

-- ---------------------------------------------------------------- perfis
create table public.profiles (
  id                       uuid primary key references auth.users (id) on delete cascade,
  username                 extensions.citext not null unique,
  display_name             text not null,
  bio                      text not null default '',
  avatar_url               text,
  avatar_seed              integer not null default 0,
  is_private               boolean not null default false,
  home_city                text,
  default_trip_visibility  public.trip_visibility not null default 'private',
  share_location_by_default boolean not null default false,
  created_at               timestamptz not null default now(),
  constraint profiles_username_format check (username::text ~ '^[a-z0-9._]{3,24}$'),
  constraint profiles_bio_len check (char_length(bio) <= 160)
);

-- view "users": só o que é público (sem e-mail)
create view public.users with (security_invoker = on) as
  select id, username, display_name, avatar_url, created_at from public.profiles;

-- ---------------------------------------------------------------- lugares
create table public.locations (
  id                 uuid primary key default gen_random_uuid(),
  kind               public.place_kind not null default 'place',
  category           public.place_category not null default 'landmark',
  name               text not null,
  city_name          text not null,
  city_id            uuid references public.locations (id) on delete set null,
  lat                double precision not null check (lat between -90 and 90),
  lng                double precision not null check (lng between -180 and 180),
  address            text,
  description        text,
  cover_url          text,
  scene              jsonb,                       -- ilustração de demonstração (sem foto real)
  rating_base_avg    numeric(3, 2) not null default 0,
  rating_base_count  integer not null default 0,
  starts_at          timestamptz,
  ends_at            timestamptz,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now()
);
create index locations_geo_idx   on public.locations (lat, lng);
create index locations_city_idx  on public.locations (city_name);
create index locations_kind_idx  on public.locations (kind);

create table public.place_reviews (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references public.locations (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  stars        smallint not null check (stars between 1 and 5),
  body         text,
  created_at   timestamptz not null default now(),
  unique (location_id, user_id)
);

create table public.saved_places (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  location_id  uuid not null references public.locations (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, location_id)
);

-- ---------------------------------------------------------------- viagens
create table public.trips (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references public.profiles (id) on delete cascade,
  title                 text not null,
  status                public.trip_status not null default 'active',
  visibility            public.trip_visibility not null default 'private',
  share_live            boolean not null default false,
  simulated             boolean not null default false,
  origin_name           text not null,
  destination_name      text,
  planned_destination   text,
  started_at            timestamptz not null default now(),
  ended_at              timestamptz,
  distance_m            double precision not null default 0,
  duration_s            integer not null default 0,
  stop_count            integer not null default 0,
  photo_count           integer not null default 0,
  video_count           integer not null default 0,
  summary               text,
  last_lat              double precision,
  last_lng              double precision,
  last_point_at         timestamptz,
  route_preview         jsonb,                    -- ≤ ~48 pontos, para miniaturas
  created_at            timestamptz not null default now(),
  -- compartilhar ao vivo só faz sentido se a viagem não é privada
  constraint trips_live_requires_visibility check (not share_live or visibility <> 'private'),
  constraint trips_finished_has_end check (status = 'active' or ended_at is not null)
);
create index trips_owner_idx  on public.trips (owner_id, started_at desc);
create index trips_live_idx   on public.trips (status, share_live) where status = 'active';
-- no máximo UMA viagem ativa por pessoa
create unique index trips_one_active_per_owner on public.trips (owner_id) where status = 'active';

create table public.trip_points (
  id           bigint generated always as identity primary key,
  trip_id      uuid not null references public.trips (id) on delete cascade,
  recorded_at  timestamptz not null,
  lat          double precision not null check (lat between -90 and 90),
  lng          double precision not null check (lng between -180 and 180),
  speed        real,
  accuracy     real,
  kind         public.point_kind not null default 'track'
);
create index trip_points_trip_idx on public.trip_points (trip_id, recorded_at);

-- ---------------------------------------------------------------- publicações
create table public.posts (
  id                  uuid primary key default gen_random_uuid(),
  author_id           uuid not null references public.profiles (id) on delete cascade,
  caption             text not null default '' check (char_length(caption) <= 2200),
  location_id         uuid references public.locations (id) on delete set null,
  lat                 double precision check (lat between -90 and 90),
  lng                 double precision check (lng between -180 and 180),
  location_precision  public.location_precision not null default 'none',
  trip_id             uuid references public.trips (id) on delete set null,
  created_at          timestamptz not null default now(),
  constraint posts_precision_consistent check (
       (location_precision = 'none'  and location_id is null and lat is null and lng is null)
    or (location_precision = 'place' and location_id is not null and lat is not null and lng is not null)
    or (location_precision in ('exact', 'approx') and lat is not null and lng is not null)
  )
);
create index posts_author_idx   on public.posts (author_id, created_at desc);
create index posts_created_idx  on public.posts (created_at desc);
create index posts_location_idx on public.posts (location_id, created_at desc);
create index posts_geo_idx      on public.posts (lat, lng) where lat is not null;

create table public.post_media (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.posts (id) on delete cascade,
  position     smallint not null default 0,
  type         public.media_type not null default 'image',
  url          text,                              -- caminho no Storage (bucket "media") ou URL externa
  scene        jsonb,                             -- demonstração
  width        integer,
  height       integer,
  duration_ms  integer,
  constraint post_media_has_source check (url is not null or scene is not null)
);
create index post_media_post_idx on public.post_media (post_id, position);

create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 500),
  created_at  timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, created_at);

create table public.likes (
  post_id     uuid not null references public.posts (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.saved_posts (
  post_id     uuid not null references public.posts (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.trip_media (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips (id) on delete cascade,
  post_id      uuid references public.posts (id) on delete set null,
  type         public.media_type not null default 'image',
  url          text,
  scene        jsonb,
  width        integer,
  height       integer,
  duration_ms  integer,
  caption      text,
  lat          double precision not null,
  lng          double precision not null,
  taken_at     timestamptz not null default now(),
  constraint trip_media_has_source check (url is not null or scene is not null)
);
create index trip_media_trip_idx on public.trip_media (trip_id, taken_at);

-- ---------------------------------------------------------------- social
create table public.follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  followee_id  uuid not null references public.profiles (id) on delete cascade,
  status       public.follow_status not null default 'accepted',
  created_at   timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_not_self check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id, status);

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,   -- quem recebe
  type          public.notification_type not null,
  actor_id      uuid not null references public.profiles (id) on delete cascade,
  post_id       uuid references public.posts (id) on delete cascade,
  comment_body  text,
  pending       boolean not null default false,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------- conquistas
create table public.achievements (
  id           text primary key,
  title        text not null,
  description  text not null,
  emoji        text not null,
  goal         integer not null check (goal > 0),
  sort_order   integer not null default 0
);

create table public.user_achievements (
  user_id         uuid not null references public.profiles (id) on delete cascade,
  achievement_id  text not null references public.achievements (id) on delete cascade,
  unlocked_at     timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

insert into public.achievements (id, title, description, emoji, goal, sort_order) values
  ('first_post',              'Primeiro registro',          'Publique sua primeira foto.',               '📸', 1, 1),
  ('first_place',             'Primeiro lugar visitado',    'Publique em um lugar pela primeira vez.',   '🏆', 1, 2),
  ('first_trip',              'Primeira viagem',            'Finalize sua primeira viagem.',             '🚗', 1, 3),
  ('ten_places_photographed', '10 lugares fotografados',    'Publique em 10 lugares diferentes.',        '📍', 10, 4),
  ('five_cities',             '5 cidades visitadas',        'Publique em 5 cidades diferentes.',         '🌎', 5, 5),
  ('streak_7',                '7 dias publicando',          'Publique 7 dias seguidos.',                 '🔥', 7, 6),
  ('ten_beaches',             '10 praias visitadas',        'Publique em 10 praias diferentes.',         '🏝️', 10, 7)
on conflict (id) do nothing;
