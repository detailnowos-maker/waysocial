# Privacidade — promessas e onde cada uma é garantida

O WaySocial trabalha com localização. As regras abaixo são **do produto**; cada uma é aplicada **no banco** (a barreira que vale) e espelhada no cliente (para a interface e o mock). Os testes em `supabase/tests/10_privacy_rls.sql` e `scripts/supabase-integration.mts` provam cada linha.

| Promessa | Como é garantida | Teste |
|---|---|---|
| **A localização exata nunca é compartilhada sem a pessoa escolher.** | Publicar com um *lugar* grava as coordenadas **do lugar**; a posição do aparelho só é gravada em `exact` ou `approx`. Trigger `posts_enforce_location` impõe isso no servidor, ignorando coordenadas que o cliente mande. | RLS 2, 6 |
| **Região aproximada.** | `approx` arredonda para 2 casas (~1 km) no servidor. Momentos de viagem publicados no feed usam sempre `approx`. | RLS 6 · integração |
| **Publicação sem localização.** | `none` zera lugar e coordenadas (constraint `posts_precision_consistent`). | RLS 6 |
| **Excluir a localização de uma publicação depois.** | `UPDATE` do autor para `none`; o post some do mapa. | RLS 6 · e2e 15 |
| **Perfil público ou privado.** | Perfil privado: posts, mídia, viagens e listas só para o dono e seguidores **aprovados**. Seguir um perfil privado vira `pending` (o servidor decide, o cliente não escolhe). | RLS 2, 3 |
| **Viagem pública / só seguidores / privada.** | `wy_can_see_trip`. Viagem "pública" de conta privada vale como "seguidores". Os pontos do trajeto e os momentos seguem a mesma regra. | RLS 7 |
| **Parar o compartilhamento da viagem.** | `share_live = false` e a viagem some do mapa dos outros **na hora**; uma viagem *ativa* sem compartilhamento é invisível para terceiros (inclusive a última posição). Viagem privada não pode compartilhar (constraint + trigger). | RLS 8 · integração · e2e 23 |
| **Deixar claro que o compartilhamento está ativo.** | Tela de viagem ativa: faixa "Viagem ativa · Compartilhando posição · {quem vê}", ponto verde na aba Viagens, aviso na tela de início. | e2e 22 |
| **Mídia de conta privada não vaza.** | Bucket `media` é **privado**; leitura via URL assinada, e a policy de `storage.objects` segue a visibilidade da publicação/viagem. | RLS 11 |
| **Ninguém forja notificações, conquistas ou edita perfil alheio.** | Sem `INSERT` nessas tabelas para `authenticated`; só triggers/funções `SECURITY DEFINER`. `username` não é editável. | RLS 9 |
| **Anônimo não vê nada.** | `anon` sem `GRANT` em nenhuma tabela. | RLS 13 |

## Padrões de produto que protegem a pessoa

- Conta nova: **viagens começam "Só eu"**, perfil público, **sem** localização por padrão.
- A localização do aparelho só é pedida **no momento do uso** (publicar com "minha região", começar viagem por GPS, botão de localizar). Nunca na abertura do app.
- "Sugerir região aproximada ao publicar" (Configurações) só usa o GPS se a permissão **já** tinha sido concedida.

## Limites conhecidos (seja honesto com os usuários)

- Um seguidor aprovado vê o que a viagem/publicação mostra — o app não impede capturas de tela.
- A gravação de viagem é em primeiro plano; em segundo plano o sistema operacional pode suspendê-la.
- Antes de ir para produção: política de privacidade/termos, exclusão de conta e de dados (LGPD), moderação e denúncia, e revisão jurídica dos textos de permissão.
