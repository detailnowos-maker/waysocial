# Roadmap pós-MVP

A arquitetura já deixa o caminho aberto para cada item — a coluna "ponto de partida" diz onde mexer.

| Tema | O que fazer | Ponto de partida |
|---|---|---|
| **Vídeos** | Gravar/enviar/tocar já existe (`expo-video`, `media_type = video`). Falta: transcodificação/miniaturas no servidor, limite de duração/tamanho, player no feed com autoplay silencioso | `components/MediaView.tsx`, Storage + Edge Function |
| **Vídeo automático da viagem (IA)** | job assíncrono, ver [AI.md](AI.md) | `AiProvider.createTripVideo` |
| **Eventos** | `locations.kind = 'event'` com janela de tempo já aparece no mapa com "N aqui agora". Falta: criar/editar evento, RSVP, check-in | tabela `locations`, `place_pulse` |
| **Estabelecimentos** | contas de negócio que reivindicam um lugar, cardápio, horário, resposta a avaliações | novo `locations.owner_id` + RLS |
| **Publicidade / monetização** | posts/lugares patrocinados no feed e no mapa; cupons por check-in | `getFeed` (slot de anúncio), `MapItem` novo tipo |
| **Recomendações** | ranking do feed "Explorar" por proximidade + afinidade; "lugares para você" | RPC `rank_feed(lat,lng)`; hoje é cronológico |
| **Gamificação avançada** | níveis, desafios semanais, ranking entre amigos, conquistas por viagem/estrada | `domain/achievements.ts` + `achievement_progress` |
| **Viagem em segundo plano** | `expo-task-manager` + permissão "sempre" + aviso persistente | `features/trip/locationSources.ts` |
| **Mapa vetorial** | MapLibre/Mapbox | [MAPS.md](MAPS.md) |
| **Push notifications** | `expo-notifications` + Edge Function disparada pelos triggers de notificação | `wy_notify` |
| **Conta** | recuperação de senha, login social (Apple/Google), exclusão de conta (LGPD), bloquear/denunciar | `SupabaseAuth`, novas tabelas |
| **Modo escuro e acessibilidade** | segunda paleta + `useColorScheme`; revisão de contraste/leitor de tela | `src/theme` |
| **Escala** | contadores denormalizados (likes/comentários), paginação por cursor, cache (TanStack Query), PostGIS | `v_posts`, `useQuery` |
