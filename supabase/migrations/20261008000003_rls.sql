-- =====================================================================================
-- WaySocial · Row Level Security + permissões mínimas
--
-- Princípios:
--   • anon não acessa nada (o app exige login);
--   • authenticated só tem os GRANTs de que precisa — sem UPDATE em colunas sensíveis;
--   • perfil privado / viagem privada / viagem ativa sem compartilhamento ficam invisíveis
--     para terceiros NO BANCO, não só na interface.
-- =====================================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','locations','place_reviews','saved_places','trips','trip_points','posts','post_media',
    'comments','likes','saved_posts','trip_media','follows','notifications','achievements','user_achievements'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- profiles
grant select on public.profiles to authenticated;
grant update (display_name, bio, avatar_url, is_private, home_city, default_trip_visibility, share_location_by_default)
  on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------- locations / reviews / saved places
grant select, insert on public.locations to authenticated;
create policy locations_select on public.locations for select to authenticated using (true);
create policy locations_insert on public.locations for insert to authenticated
  with check (created_by = auth.uid() and kind = 'place');

grant select, insert, update, delete on public.place_reviews to authenticated;
create policy reviews_select on public.place_reviews for select to authenticated using (true);
create policy reviews_insert on public.place_reviews for insert to authenticated with check (user_id = auth.uid());
create policy reviews_update on public.place_reviews for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reviews_delete on public.place_reviews for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.saved_places to authenticated;
create policy saved_places_all on public.saved_places for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- posts
grant select, insert, delete on public.posts to authenticated;
grant update (caption, location_id, lat, lng, location_precision) on public.posts to authenticated;
create policy posts_select on public.posts for select to authenticated using (public.wy_can_see_profile(author_id));
create policy posts_insert on public.posts for insert to authenticated with check (author_id = auth.uid());
create policy posts_update on public.posts for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy posts_delete on public.posts for delete to authenticated using (author_id = auth.uid());

grant select, insert, delete on public.post_media to authenticated;
create policy post_media_select on public.post_media for select to authenticated using (public.wy_can_see_post(post_id));
create policy post_media_insert on public.post_media for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));
create policy post_media_delete on public.post_media for delete to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));

grant select, insert, delete on public.comments to authenticated;
create policy comments_select on public.comments for select to authenticated using (public.wy_can_see_post(post_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and public.wy_can_see_post(post_id));
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = auth.uid() or exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));

grant select, insert, delete on public.likes to authenticated;
create policy likes_select on public.likes for select to authenticated using (public.wy_can_see_post(post_id));
create policy likes_insert on public.likes for insert to authenticated
  with check (user_id = auth.uid() and public.wy_can_see_post(post_id));
create policy likes_delete on public.likes for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.saved_posts to authenticated;
create policy saved_posts_select on public.saved_posts for select to authenticated using (user_id = auth.uid());
create policy saved_posts_insert on public.saved_posts for insert to authenticated
  with check (user_id = auth.uid() and public.wy_can_see_post(post_id));
create policy saved_posts_delete on public.saved_posts for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------- follows
grant select, insert, delete on public.follows to authenticated;
grant update (status) on public.follows to authenticated;
create policy follows_select on public.follows for select to authenticated
  using (follower_id = auth.uid() or followee_id = auth.uid()
         or (status = 'accepted' and public.wy_can_see_profile(followee_id)));
create policy follows_insert on public.follows for insert to authenticated with check (follower_id = auth.uid());
create policy follows_accept on public.follows for update to authenticated
  using (followee_id = auth.uid()) with check (followee_id = auth.uid() and status = 'accepted');
create policy follows_delete on public.follows for delete to authenticated
  using (follower_id = auth.uid() or followee_id = auth.uid());

-- ---------------------------------------------------------------- notifications (inseridas só por triggers)
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------- trips
grant select, insert, delete on public.trips to authenticated;
grant update (title, status, visibility, share_live, destination_name, ended_at, distance_m, duration_s, stop_count,
              photo_count, video_count, summary, last_lat, last_lng, last_point_at, route_preview)
  on public.trips to authenticated;
create policy trips_select on public.trips for select to authenticated
  using (public.wy_can_see_trip(owner_id, visibility, status, share_live));
create policy trips_insert on public.trips for insert to authenticated with check (owner_id = auth.uid());
create policy trips_update on public.trips for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy trips_delete on public.trips for delete to authenticated using (owner_id = auth.uid());

grant select, insert, delete on public.trip_points to authenticated;
create policy trip_points_select on public.trip_points for select to authenticated using (public.wy_can_see_trip_id(trip_id));
create policy trip_points_insert on public.trip_points for insert to authenticated
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid()));
create policy trip_points_delete on public.trip_points for delete to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid()));

grant select, insert, delete on public.trip_media to authenticated;
create policy trip_media_select on public.trip_media for select to authenticated using (public.wy_can_see_trip_id(trip_id));
create policy trip_media_insert on public.trip_media for insert to authenticated
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid()));
create policy trip_media_delete on public.trip_media for delete to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid()));

-- ---------------------------------------------------------------- conquistas
grant select on public.achievements to authenticated;
create policy achievements_select on public.achievements for select to authenticated using (true);
grant select on public.user_achievements to authenticated;
create policy user_achievements_select on public.user_achievements for select to authenticated
  using (public.wy_can_see_profile(user_id));

-- as funções helper precisam ser executáveis por quem consulta
grant execute on function public.wy_follows(uuid), public.wy_can_see_profile(uuid),
  public.wy_can_see_trip(uuid, public.trip_visibility, public.trip_status, boolean),
  public.wy_can_see_trip_id(uuid), public.wy_can_see_post(uuid), public.wy_norm(text) to authenticated;
