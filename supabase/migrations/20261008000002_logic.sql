-- =====================================================================================
-- WaySocial · funções de privacidade, triggers e notificações
--
-- As regras de privacidade moram AQUI (e em RLS), no servidor — o cliente nunca é confiável.
-- Espelham src/domain/privacy.ts; qualquer mudança precisa ser feita nos dois lados.
-- =====================================================================================

-- ---------------------------------------------------------------- helpers de visibilidade
-- SECURITY DEFINER: leem profiles/follows sem disparar RLS recursivo.

create or replace function public.wy_follows(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.follows f
    where f.follower_id = auth.uid() and f.followee_id = target and f.status = 'accepted'
  );
$$;

-- Conteúdo de um perfil é visível para: o dono, qualquer um (se público) ou seguidores aprovados.
create or replace function public.wy_can_see_profile(owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select owner = auth.uid()
      or exists (select 1 from public.profiles p where p.id = owner and not p.is_private)
      or public.wy_follows(owner);
$$;

-- Visibilidade de viagem. "Pública" de conta privada vale como "seguidores".
-- Viagem ATIVA só é visível a terceiros se estiver com compartilhamento ao vivo ligado.
create or replace function public.wy_can_see_trip(
  t_owner uuid, t_visibility public.trip_visibility, t_status public.trip_status, t_share_live boolean
) returns boolean language sql stable security definer set search_path = public as $$
  select t_owner = auth.uid()
      or (
        (t_status = 'finished' or t_share_live)
        and case t_visibility
              when 'public'    then public.wy_can_see_profile(t_owner)
              when 'followers' then public.wy_follows(t_owner)
              else false
            end
      );
$$;

create or replace function public.wy_can_see_trip_id(p_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trips t
    where t.id = p_trip and public.wy_can_see_trip(t.owner_id, t.visibility, t.status, t.share_live)
  );
$$;

create or replace function public.wy_can_see_post(p_post uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.posts p where p.id = p_post and public.wy_can_see_profile(p.author_id)
  );
$$;

-- Busca sem acento/caixa: "balneario camboriu" acha "Balneário Camboriú"
create or replace function public.wy_norm(t text)
returns text language sql immutable parallel safe as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, '')));
$$;

-- ---------------------------------------------------------------- cadastro → perfil
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_username text;
  candidate text;
  n integer := 0;
begin
  base_username := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1), 'viajante'), '[^a-z0-9._]', '', 'gi'));
  if char_length(base_username) < 3 then base_username := base_username || 'way'; end if;
  base_username := left(base_username, 20);
  candidate := base_username;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1;
    candidate := base_username || n::text;
  end loop;

  insert into public.profiles (id, username, display_name, avatar_seed)
  values (
    new.id,
    candidate,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), initcap(base_username)),
    floor(random() * 9000)::int + 100
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- publicação: precisão da localização
-- Garantia central do produto, aplicada no servidor:
--   place  → grava as coordenadas do LUGAR (ignora qualquer lat/lng enviado)
--   approx → arredonda para 2 casas (~1 km)
--   none   → sem lugar e sem coordenadas
--   exact  → só se o usuário escolheu explicitamente
create or replace function public.posts_enforce_location()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  loc record;
begin
  if new.location_precision = 'none' then
    new.location_id := null; new.lat := null; new.lng := null;
  elsif new.location_precision = 'place' then
    select l.lat, l.lng into loc from public.locations l where l.id = new.location_id;
    if not found then
      raise exception 'Lugar inexistente para localização do tipo "place"' using errcode = '23514';
    end if;
    new.lat := loc.lat; new.lng := loc.lng;
  elsif new.location_precision = 'approx' then
    if new.lat is null or new.lng is null then
      raise exception 'Localização aproximada exige coordenadas' using errcode = '23514';
    end if;
    new.lat := round(new.lat::numeric, 2); new.lng := round(new.lng::numeric, 2);
  end if;
  return new;
end $$;

create trigger posts_enforce_location_biu
  before insert or update of location_id, lat, lng, location_precision on public.posts
  for each row execute function public.posts_enforce_location();

-- Viagem privada não compartilha; viagem finalizada não compartilha mais.
create or replace function public.trips_enforce_sharing()
returns trigger language plpgsql as $$
begin
  if new.visibility = 'private' or new.status = 'finished' then new.share_live := false; end if;
  return new;
end $$;

create trigger trips_enforce_sharing_biu
  before insert or update on public.trips
  for each row execute function public.trips_enforce_sharing();

-- ---------------------------------------------------------------- seguir
-- O servidor decide o status: perfil privado ⇒ pending; ignora o que o cliente mandar.
create or replace function public.follows_set_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.status := case when exists (select 1 from public.profiles p where p.id = new.followee_id and p.is_private)
                     then 'pending'::public.follow_status else 'accepted'::public.follow_status end;
  return new;
end $$;

create trigger follows_set_status_bi
  before insert on public.follows
  for each row execute function public.follows_set_status();

-- Perfil que deixa de ser privado aprova os pedidos pendentes.
create or replace function public.profiles_on_unprivate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.is_private and not new.is_private then
    update public.follows set status = 'accepted' where followee_id = new.id and status = 'pending';
    delete from public.notifications where user_id = new.id and type = 'follow_request';
  end if;
  return new;
end $$;

create trigger profiles_on_unprivate_au
  after update of is_private on public.profiles
  for each row execute function public.profiles_on_unprivate();

-- ---------------------------------------------------------------- notificações (somente servidor)
create or replace function public.wy_notify(
  p_user uuid, p_type public.notification_type, p_actor uuid, p_post uuid default null, p_body text default null, p_pending boolean default false
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user = p_actor then return; end if;
  -- evita duplicar curtida/salvo/seguir do mesmo ator
  if p_type <> 'comment' and exists (
    select 1 from public.notifications n
    where n.user_id = p_user and n.actor_id = p_actor and n.type = p_type and n.post_id is not distinct from p_post
  ) then return; end if;
  insert into public.notifications (user_id, type, actor_id, post_id, comment_body, pending)
  values (p_user, p_type, p_actor, p_post, p_body, p_pending);
end $$;

create or replace function public.on_like_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.wy_notify((select author_id from public.posts where id = new.post_id), 'like', new.user_id, new.post_id);
  return new;
end $$;
create trigger likes_notify_ai after insert on public.likes for each row execute function public.on_like_insert();

create or replace function public.on_like_delete() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.notifications where type = 'like' and actor_id = old.user_id and post_id = old.post_id;
  return old;
end $$;
create trigger likes_unnotify_ad after delete on public.likes for each row execute function public.on_like_delete();

create or replace function public.on_save_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.wy_notify((select author_id from public.posts where id = new.post_id), 'save', new.user_id, new.post_id);
  return new;
end $$;
create trigger saved_posts_notify_ai after insert on public.saved_posts for each row execute function public.on_save_insert();

create or replace function public.on_save_delete() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.notifications where type = 'save' and actor_id = old.user_id and post_id = old.post_id;
  return old;
end $$;
create trigger saved_posts_unnotify_ad after delete on public.saved_posts for each row execute function public.on_save_delete();

create or replace function public.on_comment_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.wy_notify((select author_id from public.posts where id = new.post_id), 'comment', new.author_id, new.post_id, left(new.body, 140));
  return new;
end $$;
create trigger comments_notify_ai after insert on public.comments for each row execute function public.on_comment_insert();

create or replace function public.on_follow_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' then
    perform public.wy_notify(new.followee_id, 'follow_request', new.follower_id, null, null, true);
  else
    perform public.wy_notify(new.followee_id, 'follow', new.follower_id);
  end if;
  return new;
end $$;
create trigger follows_notify_ai after insert on public.follows for each row execute function public.on_follow_insert();

create or replace function public.on_follow_update() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'pending' and new.status = 'accepted' then
    -- o pedido vira "começou a seguir" e quem pediu é avisado
    update public.notifications set type = 'follow', pending = false, read_at = coalesce(read_at, now())
      where user_id = new.followee_id and actor_id = new.follower_id and type = 'follow_request';
    perform public.wy_notify(new.follower_id, 'follow_accepted', new.followee_id);
  end if;
  return new;
end $$;
create trigger follows_update_au after update of status on public.follows for each row execute function public.on_follow_update();

create or replace function public.on_follow_delete() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.notifications where user_id = old.followee_id and actor_id = old.follower_id and type in ('follow', 'follow_request');
  return old;
end $$;
create trigger follows_delete_ad after delete on public.follows for each row execute function public.on_follow_delete();
