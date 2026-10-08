-- =====================================================================================
-- WaySocial · Realtime: notificações novas chegam ao app sem polling.
-- (No Supabase a publicação supabase_realtime já existe; em um Postgres comum este bloco não faz nada.)
-- =====================================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
