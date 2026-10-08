# Arquitetura

## Princípio: a UI só conhece contratos

```
┌─────────────────────────── src/app + components (React Native) ───────────────────────────┐
│  telas, navegação (Expo Router), hooks de consulta (useQuery)                              │
└───────┬───────────────────────┬───────────────────────┬───────────────────────┬────────────┘
        │ WayRepository         │ AuthService           │ SocialMap             │ AiProvider / GeocodingProvider
        ▼                       ▼                       ▼                       ▼
 MockRepository ◄─ demo   MockAuth ◄─ demo        RasterMap (hoje)        MockAiProvider ◄─ padrão
 SupabaseRepository       SupabaseAuth            MapLibre/Mapbox (futuro) HttpAiProvider (seu endpoint)
```

`src/services/index.ts` escolhe a implementação **uma vez**, pela presença de `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY`. Nenhuma tela faz `if (supabase)`.

## Camadas

| Camada | Pasta | Regra |
|---|---|---|
| Domínio | `src/domain` | Tipos e regras **puras** (sem React, sem rede): privacidade, conquistas, estatísticas de viagem, resumo. Testadas em Node. |
| Dados | `src/data` | `repository.ts` é o contrato. Toda leitura já vem filtrada por privacidade; mutações disparam `subscribe`. |
| Serviços | `src/services` | Auth, IA, geocodificação. Cada um é interface + implementação simulada + implementação real/HTTP. |
| Estado | `src/state` | `ServicesProvider` (serviços + sessão), `TripSession` (viagem viva), `useQuery`. |
| UI | `src/app`, `src/components`, `src/features` | Telas finas; lógica de feature em `features/*`. |

### `useQuery`: stale-while-revalidate sem biblioteca

`useQuery(fetcher, deps)` mantém o dado anterior enquanto recarrega e recarrega sozinho quando o repositório emite uma mutação. Não há cache global: cada tela consulta o que precisa. Para um backend maior, troque por TanStack Query sem mexer nas telas (o formato `{ data, loading, error, refresh }` é o mesmo).

## Dois repositórios, um contrato

- **MockRepository** — banco JSON em AsyncStorage, semeado por `data/mock/seed.ts`. Reproduz as regras de privacidade em memória e inclui coisas de demonstração: viagens "ao vivo" que andam sozinhas pela rota (posição = função do relógio), contadores "ambiente" (pessoas agora/curtidas de contas que não existem) e *rebase* do relógio (se o app ficou parado > 6 h, "há 5 min" continua "há 5 min").
- **SupabaseRepository** — traduz linhas ⇄ domínio. **Não decide privacidade**: confia no RLS, nos triggers e nas constraints do banco. Mídia vai para o bucket privado e volta como URL assinada (`data/supabase/media.ts`).

O mesmo mundo de demonstração vira SQL com `npm run db:seed-sql` (uma fonte de verdade).

## Viagem: gravação, estado e simulação

```
LocationSource ──► TripRecorder ──► repo.appendTripPoints (lotes de 8)
 ├ DeviceLocationSource (expo-location)      │ filtra precisão ruim, ignora micro-movimento,
 └ SimulatedLocationSource (rota + relógio   │ soma distância, detecta parada (≥3 min a <35 m)
   virtual ×60)                              ▼
                                      TripSessionProvider (React): cronômetro, distância, paradas,
                                      momentos, compartilhar/parar, finalizar → resumo (IA) → repo.finishTrip
```

- A viagem **sobrevive à navegação** (o provider fica na raiz) e é **restaurada** ao reabrir o app.
- Hoje a gravação é em **primeiro plano** (documentado na UI: "mantenha o app aberto"). Para gravar com a tela bloqueada: `expo-task-manager` + `Location.startLocationUpdatesAsync` + permissão "sempre" (+ aviso de privacidade reforçado). `TripRecorder` já é independente de React, então só muda a fonte.
- O simulador existe para **testar sem dirigir** e para demos: o mesmo caminho do GPS real (fonte → recorder → repositório).

## Decisões que valem registrar

1. **Mapa sem módulo nativo.** `react-native-maps` não roda na web e pede chave no Android; MapLibre RN exige *development build*. Para um MVP que o usuário abre no Expo Go e no navegador, um motor Web Mercator em JS (~600 linhas) resolve — e o contrato `SocialMapProps` deixa a troca para MapLibre/Mapbox isolada em um arquivo.
2. **Cenas ilustradas no lugar de fotos de demonstração.** Fotos de terceiros trazem licença, rede e links quebrados. `SceneArt` gera imagens SVG determinísticas (praia, mirante, comida...) a partir de uma semente. Mídia real do usuário usa `expo-image`/`expo-video` normalmente.
3. **Privacidade no servidor.** O cliente pode errar ou ser adulterado; RLS + triggers garantem as promessas do produto ([PRIVACY.md](PRIVACY.md)). O código do cliente espelha as regras só para a UI e o mock.
4. **`React Compiler` ligado.** O lint do compilador está habilitado e limpo; exceções são comentadas caso a caso.
5. **Tema claro apenas** por ora (`userInterfaceStyle: light`). Os tokens estão em `src/theme`; o modo escuro é adicionar uma segunda paleta e um hook.

## Como estender

| Quero... | Faça |
|---|---|
| Nova tabela/consulta | migration em `supabase/migrations`, método no contrato `WayRepository`, implemente nos **dois** repositórios, teste no mock e na integração |
| Novo provedor de mapa | componente com `SocialMapProps` → exporte em `src/map/index.ts` ([MAPS.md](MAPS.md)) |
| IA real | endpoint seu → `EXPO_PUBLIC_AI_ENDPOINT` ([AI.md](AI.md)) |
| Nova conquista | `domain/achievements.ts` + linha em `achievements` + caso em `achievement_progress`/`refresh_achievements` |
| Gravar viagem em segundo plano | nova `LocationSource` com `expo-task-manager` |
