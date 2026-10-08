-- Testes de privacidade/RLS. Roda com:  supabase/tests/run-tests.sh
-- Cada bloco usa ASSERT; qualquer falha aborta com a mensagem do teste.
\set ON_ERROR_STOP on
\set QUIET on

-- ---------------------------------------------------------------- fixtures (como superusuário)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@t.dev',  '{"username":"ana.priv","display_name":"Ana Privada"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bia@t.dev',  '{"username":"bia.pub","display_name":"Bia Pública"}'),
  ('00000000-0000-0000-0000-00000000000c', 'caio@t.dev', '{"username":"caio","display_name":"Caio Estranho"}'),
  ('00000000-0000-0000-0000-00000000000d', 'bia2@t.dev', '{"username":"bia.pub","display_name":"Outra Bia"}');
update public.profiles set is_private = true where id = '00000000-0000-0000-0000-00000000000a';

insert into public.locations (id, kind, category, name, city_name, lat, lng) values
  ('10000000-0000-0000-0000-000000000001', 'place', 'beach', 'Praia Central', 'Balneário Camboriú', -26.9935, -48.627),
  ('10000000-0000-0000-0000-000000000002', 'place', 'park', 'Parque das Águas', 'Jaraguá do Sul', -26.492, -49.087);

-- helpers de sessão
create or replace function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
end $$;
grant execute on function pg_temp.login(text), pg_temp.logout() to public;

-- ---------------------------------------------------------------- 1. cadastro cria perfil
do $$
declare n int; u text;
begin
  select count(*) into n from public.profiles;
  assert n = 4, format('esperava 4 perfis, vi %s', n);
  select username into u from public.profiles where id = '00000000-0000-0000-0000-00000000000d';
  assert u = 'bia.pub1', format('username duplicado deveria ganhar sufixo, veio %s', u);
  raise notice 'ok 1  cadastro cria perfil e resolve colisão de @usuário';
end $$;

-- ---------------------------------------------------------------- 2. posts + perfil privado
select pg_temp.login('00000000-0000-0000-0000-00000000000a') \gset
insert into public.posts (id, author_id, caption, location_id, location_precision, lat, lng)
  values ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'post da Ana (privada)',
          '10000000-0000-0000-0000-000000000001', 'place', 0, 0);
insert into public.post_media (post_id, url) values ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a/foto.jpg');
select pg_temp.login('00000000-0000-0000-0000-00000000000b') \gset
insert into public.posts (id, author_id, caption) values ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'post da Bia (pública)');
select pg_temp.logout() \gset

do $$
declare n int; lat_ double precision;
begin
  -- servidor ignora lat/lng enviados com precision=place
  select lat into lat_ from public.posts where id = '20000000-0000-0000-0000-00000000000a';
  assert lat_ = -26.9935, format('precision=place deveria usar as coordenadas do LUGAR, veio %s', lat_);

  perform pg_temp.login('00000000-0000-0000-0000-00000000000c');
  select count(*) into n from public.posts;
  assert n = 1, format('estranho deveria ver só o post público, viu %s', n);
  select count(*) into n from public.v_posts where author_id = '00000000-0000-0000-0000-00000000000a';
  assert n = 0, 'view v_posts vazou post de perfil privado';
  select count(*) into n from public.post_media;
  assert n = 0, 'mídia de perfil privado vazou';
  perform pg_temp.logout();
  raise notice 'ok 2  perfil privado: posts e mídia ocultos para não-seguidores; coordenadas do lugar vêm do servidor';
end $$;

-- ---------------------------------------------------------------- 3. seguir: servidor decide o status
select pg_temp.login('00000000-0000-0000-0000-00000000000c') \gset
-- o cliente tenta "forçar" accepted; o trigger deve ignorar
insert into public.follows (follower_id, followee_id, status) values
  ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 'accepted'),
  ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000b', 'pending');
select pg_temp.logout() \gset

do $$
declare s1 public.follow_status; s2 public.follow_status; n int; t text;
begin
  select status into s1 from public.follows where followee_id = '00000000-0000-0000-0000-00000000000a';
  select status into s2 from public.follows where followee_id = '00000000-0000-0000-0000-00000000000b';
  assert s1 = 'pending',  'seguir perfil privado deve ficar pendente mesmo se o cliente mandar accepted';
  assert s2 = 'accepted', 'seguir perfil público deve ser aceito na hora';

  perform pg_temp.login('00000000-0000-0000-0000-00000000000c');
  select count(*) into n from public.posts where author_id = '00000000-0000-0000-0000-00000000000a';
  assert n = 0, 'pedido pendente NÃO dá acesso';
  perform pg_temp.login('00000000-0000-0000-0000-00000000000a');
  select type::text into t from public.notifications where actor_id = '00000000-0000-0000-0000-00000000000c';
  assert t = 'follow_request', format('Ana deveria receber follow_request, veio %s', t);
  -- Ana aprova
  update public.follows set status = 'accepted' where follower_id = '00000000-0000-0000-0000-00000000000c';
  perform pg_temp.login('00000000-0000-0000-0000-00000000000c');
  select count(*) into n from public.posts where author_id = '00000000-0000-0000-0000-00000000000a';
  assert n = 1, 'após aprovação o seguidor vê os posts';
  select count(*) into n from public.post_media;
  assert n = 1, 'após aprovação o seguidor vê a mídia';
  select count(*) into n from public.notifications where type = 'follow_accepted';
  assert n = 1, 'quem pediu recebe "aceitou seu pedido"';
  perform pg_temp.logout();
  raise notice 'ok 3  seguir: status decidido no servidor, aprovação libera conteúdo e notifica';
end $$;

-- ---------------------------------------------------------------- 4. curtidas, comentários e notificações
do $$
declare n int;
begin
  -- Caio não segue... espere: já segue Ana (aprovado) e Bia
  perform pg_temp.login('00000000-0000-0000-0000-00000000000c');
  insert into public.likes (post_id, user_id) values ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c');
  insert into public.comments (post_id, author_id, body) values ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c', 'Que lindo!');
  insert into public.saved_posts (post_id, user_id) values ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c');
  perform pg_temp.login('00000000-0000-0000-0000-00000000000b');
  select count(*) into n from public.notifications where type in ('like', 'comment', 'save');
  assert n = 3, format('Bia deveria ter 3 notificações (like/comment/save), tem %s', n);
  select count(*) into n from public.v_posts where id = '20000000-0000-0000-0000-00000000000b' and like_count = 1 and comment_count = 1;
  assert n = 1, 'contadores da view';
  -- descurtir remove a notificação
  perform pg_temp.login('00000000-0000-0000-0000-00000000000c');
  delete from public.likes where post_id = '20000000-0000-0000-0000-00000000000b';
  perform pg_temp.login('00000000-0000-0000-0000-00000000000b');
  select count(*) into n from public.notifications where type = 'like';
  assert n = 0, 'descurtir remove a notificação';
  perform pg_temp.logout();
  raise notice 'ok 4  curtir/comentar/salvar geram notificação no servidor; desfazer remove';
end $$;

-- um estranho não curte nem comenta o que não pode ver
select pg_temp.login('00000000-0000-0000-0000-00000000000d') \gset
do $$
begin
  begin
    insert into public.likes (post_id, user_id) values ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d');
    assert false, 'curtida em post de perfil privado deveria ser bloqueada pelo RLS';
  exception when insufficient_privilege or others then
    if sqlerrm like 'curtida em post%' then raise; end if;
  end;
end $$;
select pg_temp.logout() \gset
do $$ begin raise notice 'ok 5  RLS bloqueia curtir/comentar em conteúdo invisível'; end $$;

-- ---------------------------------------------------------------- 6. localização: servidor impõe a precisão
select pg_temp.login('00000000-0000-0000-0000-00000000000b') \gset
insert into public.posts (id, author_id, caption, location_precision, lat, lng) values
  ('20000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'aprox', 'approx', -26.99306, -48.62714),
  ('20000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-00000000000b', 'exata', 'exact', -26.99306, -48.62714),
  ('20000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-00000000000b', 'nenhuma', 'none', -26.99306, -48.62714);
select pg_temp.logout() \gset
do $$
declare r record;
begin
  select lat, lng into r from public.posts where id = '20000000-0000-0000-0000-0000000000b1';
  assert r.lat = -26.99 and r.lng = -48.63, format('approx deveria arredondar, veio %s,%s', r.lat, r.lng);
  select lat, lng into r from public.posts where id = '20000000-0000-0000-0000-0000000000b2';
  assert r.lat = -26.99306, 'exact preserva';
  select lat, lng, location_id into r from public.posts where id = '20000000-0000-0000-0000-0000000000b3';
  assert r.lat is null and r.lng is null and r.location_id is null, 'none apaga tudo, mesmo que o cliente mande coordenadas';

  -- excluir localização depois de publicar
  perform pg_temp.login('00000000-0000-0000-0000-00000000000b');
  update public.posts set location_precision = 'none', location_id = null, lat = null, lng = null where id = '20000000-0000-0000-0000-0000000000b2';
  perform pg_temp.logout();
  select lat into r from public.posts where id = '20000000-0000-0000-0000-0000000000b2';
  assert r.lat is null, 'excluir localização limpa as coordenadas';
  raise notice 'ok 6  precisão da localização imposta no servidor (place/approx/exact/none) e remoção funciona';
end $$;

-- ---------------------------------------------------------------- 7. viagens
select pg_temp.login('00000000-0000-0000-0000-00000000000b') \gset
insert into public.trips (id, owner_id, title, status, visibility, share_live, origin_name, ended_at) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'privada', 'finished', 'private',   false, 'A', now()),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'seguidores', 'finished', 'followers', false, 'A', now()),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', 'pública', 'finished', 'public',   false, 'A', now());
insert into public.trip_points (trip_id, recorded_at, lat, lng) values ('30000000-0000-0000-0000-000000000002', now(), -26.9, -48.6);
select pg_temp.logout() \gset

do $$
declare n int;
begin
  perform pg_temp.login('00000000-0000-0000-0000-00000000000d');   -- não segue a Bia
  select count(*) into n from public.trips;
  assert n = 1, format('estranho vê só a viagem pública, viu %s', n);
  select count(*) into n from public.trip_points;
  assert n = 0, 'pontos de viagem de seguidores vazaram';
  perform pg_temp.login('00000000-0000-0000-0000-00000000000c');   -- segue a Bia
  select count(*) into n from public.trips;
  assert n = 2, format('seguidor vê pública + seguidores, viu %s', n);
  select count(*) into n from public.trip_points;
  assert n = 1, 'seguidor vê os pontos';
  perform pg_temp.logout();
  raise notice 'ok 7  viagem: privada/seguidores/pública respeitadas (inclusive pontos do trajeto)';
end $$;

do $$
declare n int;
begin
  -- viagem ATIVA: posição só aparece com compartilhamento ao vivo ligado
  perform pg_temp.login('00000000-0000-0000-0000-00000000000b');
  insert into public.trips (id, owner_id, title, status, visibility, share_live, origin_name, last_lat, last_lng)
    values ('30000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000b', 'ao vivo', 'active', 'followers', false, 'A', -26.9, -48.7);
  perform pg_temp.login('00000000-0000-0000-0000-00000000000c');
  select count(*) into n from public.trips where status = 'active';
  assert n = 0, 'viagem ativa SEM compartilhamento não pode aparecer para seguidor';
  perform pg_temp.login('00000000-0000-0000-0000-00000000000b');
  update public.trips set share_live = true where id = '30000000-0000-0000-0000-000000000009';
  perform pg_temp.login('00000000-0000-0000-0000-00000000000c');
  select count(*) into n from public.v_trips where status = 'active' and last_lat is not null;
  assert n = 1, 'com compartilhamento ligado, o seguidor vê a posição';
  perform pg_temp.login('00000000-0000-0000-0000-00000000000d');
  select count(*) into n from public.trips where status = 'active';
  assert n = 0, 'quem não segue não vê viagem "seguidores"';
  -- parar de compartilhar some na hora
  perform pg_temp.login('00000000-0000-0000-0000-00000000000b');
  update public.trips set share_live = false where id = '30000000-0000-0000-0000-000000000009';
  perform pg_temp.login('00000000-0000-0000-0000-00000000000c');
  select count(*) into n from public.trips where status = 'active';
  assert n = 0, 'parar de compartilhar remove a viagem do mapa dos outros';
  -- privada não compartilha (constraint) e finalizar zera o compartilhamento (trigger)
  perform pg_temp.login('00000000-0000-0000-0000-00000000000b');
  begin
    update public.trips set visibility = 'private', share_live = true where id = '30000000-0000-0000-0000-000000000009';
    -- o trigger corrige share_live=false antes do CHECK, então não deve falhar nem ficar true
  end;
  select count(*) into n from public.trips where id = '30000000-0000-0000-0000-000000000009' and share_live;
  assert n = 0, 'viagem privada nunca fica com share_live=true';
  -- no máximo uma viagem ativa por pessoa
  begin
    insert into public.trips (owner_id, title, status, visibility, origin_name) values ('00000000-0000-0000-0000-00000000000b', 'segunda', 'active', 'private', 'B');
    assert false, 'duas viagens ativas deveriam falhar';
  exception when unique_violation then null; end;
  perform pg_temp.logout();
  raise notice 'ok 8  viagem ativa: posição só com compartilhamento ligado; parar some na hora; uma ativa por pessoa';
end $$;

-- ---------------------------------------------------------------- 9. colunas protegidas
do $$
declare n int;
begin
  perform pg_temp.login('00000000-0000-0000-0000-00000000000b');
  begin
    update public.profiles set username = 'roubado' where id = '00000000-0000-0000-0000-00000000000b';
    assert false, 'username não deve ser editável pelo cliente';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.notifications (user_id, type, actor_id) values ('00000000-0000-0000-0000-00000000000b', 'like', '00000000-0000-0000-0000-00000000000c');
    assert false, 'cliente não pode forjar notificações';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set is_private = true where id = '00000000-0000-0000-0000-00000000000c';
    get diagnostics n = row_count;
    assert n = 0, 'não pode editar o perfil de outra pessoa';
  end;
  begin
    insert into public.user_achievements (user_id, achievement_id) values ('00000000-0000-0000-0000-00000000000b', 'streak_7');
    assert false, 'conquista não pode ser concedida pelo cliente';
  exception when insufficient_privilege then null; end;
  perform pg_temp.logout();
  raise notice 'ok 9  colunas/tabelas protegidas (username, notificações, conquistas, perfil alheio)';
end $$;

-- ---------------------------------------------------------------- 10. tornar público aprova pendências
do $$
declare n int;
begin
  perform pg_temp.login('00000000-0000-0000-0000-00000000000d');
  insert into public.follows (follower_id, followee_id) values ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000a');
  perform pg_temp.login('00000000-0000-0000-0000-00000000000a');
  update public.profiles set is_private = false where id = '00000000-0000-0000-0000-00000000000a';
  select count(*) into n from public.follows where follower_id = '00000000-0000-0000-0000-00000000000d' and status = 'accepted';
  assert n = 1, 'virar público aprova pedidos pendentes';
  select count(*) into n from public.notifications where type = 'follow_request';
  assert n = 0, 'pedidos pendentes somem das notificações';
  perform pg_temp.logout();
  update public.profiles set is_private = true where id = '00000000-0000-0000-0000-00000000000a';
  raise notice 'ok 10 perfil que deixa de ser privado aprova pedidos pendentes';
end $$;

-- ---------------------------------------------------------------- 11. Storage
do $$
declare ok boolean;
begin
  update public.profiles set is_private = true where id = '00000000-0000-0000-0000-00000000000a';
  -- Caio (seguidor aprovado da Ana) pode ler; Outra Bia (d) não
  perform pg_temp.login('00000000-0000-0000-0000-00000000000c');
  select public.wy_can_read_media('00000000-0000-0000-0000-00000000000a/foto.jpg') into ok;
  assert ok, 'seguidor aprovado lê a mídia';
  perform pg_temp.login('00000000-0000-0000-0000-00000000000d');
  delete from public.follows where follower_id = '00000000-0000-0000-0000-00000000000d';
  select public.wy_can_read_media('00000000-0000-0000-0000-00000000000a/foto.jpg') into ok;
  assert not ok, 'quem não segue NÃO lê a mídia de perfil privado, mesmo sabendo o caminho';
  perform pg_temp.login('00000000-0000-0000-0000-00000000000a');
  select public.wy_can_read_media('00000000-0000-0000-0000-00000000000a/qualquer.jpg') into ok;
  assert ok, 'dono lê a própria pasta';
  perform pg_temp.logout();
  raise notice 'ok 11 Storage: leitura segue a visibilidade da publicação (URL assinada só para quem pode)';
end $$;

-- ---------------------------------------------------------------- 12. conquistas, busca, pulso
do $$
declare n int; r record;
begin
  perform pg_temp.login('00000000-0000-0000-0000-00000000000b');
  insert into public.posts (author_id, caption, location_id, location_precision) values
    ('00000000-0000-0000-0000-00000000000b', 'na praia', '10000000-0000-0000-0000-000000000001', 'place'),
    ('00000000-0000-0000-0000-00000000000b', 'no parque', '10000000-0000-0000-0000-000000000002', 'place');
  select count(*) into n from public.refresh_achievements();
  assert n >= 3, format('esperava ≥3 conquistas novas (primeiro registro/lugar + ...), vi %s', n);
  select count(*) into n from public.refresh_achievements();
  assert n = 0, 'segunda chamada não repete conquistas';
  select progress, unlocked into r from public.achievement_progress('00000000-0000-0000-0000-00000000000b') where id = 'ten_places_photographed';
  assert r.progress = 2 and not r.unlocked, format('progresso 2/10, veio %s', r.progress);
  select progress, unlocked into r from public.achievement_progress('00000000-0000-0000-0000-00000000000b') where id = 'streak_7';
  assert r.progress = 1, 'sequência: hoje conta 1';

  -- busca sem acento
  select jsonb_array_length(public.search_all('balneario camboriu') -> 'places') into n;
  assert n = 1, format('busca sem acento deveria achar a praia, achou %s', n);
  select jsonb_array_length(public.search_all('PRAIA') -> 'places') into n;
  assert n >= 1, 'busca por categoria/nome em maiúsculas';

  select posts_today, people_now into r from public.place_pulse(array['10000000-0000-0000-0000-000000000001'::uuid]);
  assert r.posts_today >= 1 and r.people_now >= 1, 'pulso do lugar conta publicações de hoje e pessoas agora';

  select posts, followers, following into r from public.profile_stats('00000000-0000-0000-0000-00000000000b');
  assert r.posts >= 5 and r.followers = 1, format('estatísticas do perfil: %s posts, %s seguidores', r.posts, r.followers);
  perform pg_temp.logout();
  raise notice 'ok 12 conquistas, busca sem acento, pulso do lugar e estatísticas do perfil';
end $$;

-- anon não acessa nada
do $$
declare n int;
begin
  execute 'set role anon';
  begin
    select count(*) into n from public.posts;
    assert false, 'anon não deveria ler posts';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  raise notice 'ok 13 anon não tem acesso';
end $$;
\echo TODOS OS TESTES DE RLS PASSARAM
