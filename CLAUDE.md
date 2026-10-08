# WaySocial — guia para desenvolver neste repositório

Rede social do mundo real (feed + mapa + localização + viagens). App Expo/React Native + Supabase.
Leia primeiro: `README.md`, `docs/ARCHITECTURE.md`, `docs/PRIVACY.md`. As regras gerais de Expo estão em `AGENTS.md` (o Expo muda a cada SDK: consulte `https://docs.expo.dev/llms.txt`).

## Comandos

```bash
npm install && npx expo start      # dev (Expo Go / "w" para web)
npm run typecheck                  # tsc (app + scripts)
npm run lint                       # eslint — deve ficar com 0 erros
npm test                           # jest (domínio, repositório mock, gravação de viagem, IA, clusters)
npm run db:test                    # RLS em Postgres 16 descartável (usuário `postgres` do sistema; sem Docker)
npm run db:integration             # SupabaseRepository × Postgres × PostgREST
npm run test:e2e                   # Playwright no Expo web (suba `npx expo start --web --port 8081` antes)
npm run db:seed-sql                # regenera supabase/seed.sql a partir de src/data/mock/seed.ts
```

## Regras do projeto

1. **A UI só fala com contratos**: `WayRepository`, `AuthService`, `SocialMap`, `AiProvider`, `GeocodingProvider`. Nunca importe `MockRepository`/`SupabaseRepository` em tela.
2. **Mudou o contrato `WayRepository`?** Implemente nos DOIS repositórios, cubra no `MockRepository.test.ts` e no `scripts/supabase-integration.mts`.
3. **Privacidade vive no servidor.** Mudou uma regra em `src/domain/privacy.ts`? Espelhe em `supabase/migrations` e em `supabase/tests/10_privacy_rls.sql` (e vice-versa). Nunca confie em coordenadas, `status` de follow ou notificações vindos do cliente.
4. **Localização:** nunca peça permissão na abertura do app; peça no momento do uso. Publicar com um lugar grava as coordenadas do lugar, não as do aparelho. Momento de viagem publicado no feed é sempre `approx`.
5. **Dados de demonstração** moram em `src/data/mock/seed.ts` (fonte única; o SQL é gerado). Nomes de estabelecimentos são fictícios.
6. **Estilo:** TypeScript estrito, tokens em `src/theme`, texto da interface em pt-BR, comentários explicam o *porquê*. React Compiler está ligado — evite ler/escrever `ref.current` durante o render e `setState` direto em efeitos (o lint avisa).
7. **Web:** `Alert` não funciona — use `ActionSheet`/`Sheet`. Evite `Pressable` com `accessibilityRole="button"` aninhado (gera `<button>` dentro de `<button>`).
8. Migrations são **append-only**: crie um arquivo novo `supabase/migrations/<timestamp>_<nome>.sql`.

## Mapa do código

```
src/domain        tipos e regras puras        src/map        SocialMap (contrato), RasterMap, marcadores
src/data          contratos + mock + supabase src/features   compose, map, profile, trip
src/services      auth, ai, geocoding         src/state      providers, TripSession, useQuery
src/app           rotas Expo Router           e2e/ scripts/ supabase/  testes ponta a ponta, geradores, banco
```

## Armadilhas já resolvidas (não reintroduza)

- `process.env.EXPO_PUBLIC_*` só é inlinado com o nome literal — não use `process.env[chave]`.
- Metro em modo `CI=1` não observa arquivos novos; rode sem `CI` para desenvolver.
- `innerText` no web inclui os glifos do Ionicons (caracteres de uso privado): ao testar, remova o intervalo U+E000–U+F8FF.
- Persistência do mock é *debounced*; há *flush* em `pagehide`/`AppState` (`ServicesProvider`). Testes que recarregam a página logo após uma ação devem esperar ~600 ms.
- `.env.local` e `.env` são ignorados pelo git. Nunca versionar chaves (a `anon key` é pública por desenho; a `service_role` jamais vai ao app).
