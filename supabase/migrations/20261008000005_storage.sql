-- =====================================================================================
-- WaySocial · Storage (bucket PRIVADO "media")
--
-- Arquivos ficam em  media/<user_id>/<uuid>.<ext>  e são servidos por URL ASSINADA.
-- Quem pode ler um arquivo segue a mesma regra da publicação/viagem a que ele pertence:
-- foto de perfil privado não vaza para quem não é seguidor, mesmo conhecendo o caminho.
-- =====================================================================================

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

create or replace function public.wy_can_read_media(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select (storage.foldername(p_path))[1] = auth.uid()::text
      or exists (select 1 from public.post_media m where m.url = p_path and public.wy_can_see_post(m.post_id))
      or exists (select 1 from public.trip_media m where m.url = p_path and public.wy_can_see_trip_id(m.trip_id));
$$;
grant execute on function public.wy_can_read_media(text) to authenticated;

create policy "media_read" on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.wy_can_read_media(name));
create policy "media_insert_own_folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media_delete_own_folder" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
