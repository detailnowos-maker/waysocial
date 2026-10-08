# Banco de dados (Supabase / Postgres)

## Tabelas

`users` é o `auth.users` do Supabase (credenciais nunca ficam em tabelas públicas); `public.users` é uma *view* só com colunas públicas.

| Tabela | Papel | Observações |
|---|---|---|
| `profiles` | 1:1 com `auth.users` (criado por trigger no cadastro) | `username` único (citext), `is_private`, `default_trip_visibility`, `share_location_by_default` |
| `locations` | cidades, lugares e eventos | `kind` (`city`/`place`/`event`), `category`, lat/lng, `scene` (ilustração demo) ou `cover_url`, janela de tempo p/ eventos |
| `posts` | publicações | `location_precision` (`place`/`exact`/`approx`/`none`), `lat/lng` conforme a precisão, `trip_id` opcional |
| `post_media` | fotos/vídeos de uma publicação | `url` = caminho no Storage (ou `scene` na demo) |
| `comments`, `likes`, `saved_posts` | interações | `likes`/`saved_posts` com PK composta |
| `follows` | seguir | `status` `pending` (perfil privado) / `accepted` — **decidido por trigger** |
| `trips` | viagens | `status`, `visibility`, `share_live`, estatísticas, `route_preview` (≤48 pontos) |
| `trip_points` | trajeto | `recorded_at`, lat/lng, `kind` (`track`/`stop`) |
| `trip_media` | momentos da viagem | foto/vídeo + posição + `post_id` opcional (se publicado no feed) |
| `place_reviews`, `saved_places` | avaliações e lugares salvos | uma avaliação por pessoa/lugar |
| `notifications` | notificações | **só triggers inserem**; `read_at`, `pending` p/ pedidos de seguir |
| `achievements`, `user_achievements` | conquistas | catálogo semeado na migration; desbloqueio só por função |

Expansão futura: PostGIS (`geography`) em `posts`/`locations`, `locations.owner_id` (estabelecimentos), `ads`, `events_rsvp`, `blocks`/`reports`.

## Migrations (`supabase/migrations`)

| Arquivo | Conteúdo |
|---|---|
| `…01_schema.sql` | extensões, tipos, tabelas, índices, constraints, catálogo de conquistas |
| `…02_logic.sql` | funções de visibilidade (`wy_can_see_*`), trigger de cadastro, precisão da localização, status de follow, notificações |
| `…03_rls.sql` | RLS em todas as tabelas + `GRANT` mínimos (sem acesso `anon`) |
| `…04_views_rpc.sql` | views `v_posts`, `v_trips`, `v_locations`… (`security_invoker`), `place_pulse`, `search_all`, `profile_stats`, `achievement_progress`, `refresh_achievements` |
| `…05_storage.sql` | bucket privado `media` + policies de leitura/escrita |
| `…06_realtime.sql` | `notifications` na publicação `supabase_realtime` |

`supabase/seed.sql` é **gerado** (`npm run db:seed-sql`) a partir do mesmo mundo do modo demonstração. Contas: `lucas|marina|pedro|ana|gabriel@waysocial.demo` / senha `waysocial`.

## Subindo um projeto

```bash
# 1. crie o projeto em supabase.com (ou use `supabase start` para rodar local com Docker)
supabase link --project-ref <ref>
supabase db push                       # aplica as 6 migrations
# 2. (opcional, só dev) carregue os dados de demonstração:
psql "$DATABASE_URL" -f supabase/seed.sql      # ou: supabase db reset  (apenas local)
# 3. Auth → Providers → Email: ligue "Confirm email" em produção
# 4. variáveis do app
cp .env.example .env.local   # EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
```

> O seed insere em `auth.users` e `auth.identities` usando as colunas do GoTrue atual. Se uma versão futura exigir outras, crie as contas pelo painel e rode só as partes de `public.*`.

## Regras de acesso (RLS) em uma tabela

| | quem lê | quem escreve |
|---|---|---|
| `profiles` | todo autenticado (existência é pública) | só o dono; **sem** `username`/`avatar_seed` |
| `posts`, `post_media`, `comments`, `likes` | `wy_can_see_profile(autor)`: dono, público ou seguidor aprovado | autor; `likes`/`comments` exigem poder ver o post |
| `follows` | as duas pontas (+ aceitos de perfis visíveis) | quem segue (status é do servidor); só o seguido aprova |
| `trips`, `trip_points`, `trip_media` | `wy_can_see_trip`: dono, ou (finalizada **ou** `share_live`) + visibilidade | dono |
| `notifications` | só o destinatário | **ninguém direto** (triggers) |
| `user_achievements` | quem pode ver o perfil | **ninguém direto** (`refresh_achievements()`) |
| `storage.objects` (`media`) | `wy_can_read_media`: dono da pasta ou quem pode ver a publicação/viagem | usuário na própria pasta `<uid>/…` |

## Testando o banco (sem Docker)

```bash
npm run db:test          # Postgres 16 descartável + 13 testes de privacidade/RLS (ASSERT em PL/pgSQL)
npm run db:integration   # + PostgREST: 22 testes do SupabaseRepository com JWTs por usuário
supabase/tests/local-pg.sh up      # cluster local para explorar com psql  (… down para apagar)
```

`supabase/tests/00_supabase_stubs.sql` imita o mínimo do Supabase (`auth`, `storage`, roles) só para validar as migrations num Postgres comum — **nunca** rode em um projeto real. Para provar que os testes pegam regressões, enfraqueça uma policy e veja falhar (foi assim que validamos).

O que esses testes **não** cobrem: GoTrue (login/cadastro por HTTP), Storage por HTTP, Realtime. O `SupabaseAuth`, o upload/URL assinada (`data/supabase/media.ts`) e o canal Realtime estão implementados, mas precisam ser exercitados em um projeto Supabase de verdade.
