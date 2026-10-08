# IA

## Estado atual (MVP)

Nada é enviado a nenhum modelo. `MockAiProvider` gera texto por **template**, determinístico, em pt-BR:

| Recurso | Onde aparece | Hoje |
|---|---|---|
| **Legenda** (casual · engraçada · turística · curta) | Nova publicação → "Sugerir legenda com IA" | templates por categoria do lugar + período do dia |
| **Resumo da viagem** | Ao finalizar a viagem | `domain/tripSummary.ts` ("Foram 128 km entre A e B em 1h42. Durante o trajeto: 2 paradas e 17 momentos registrados.") |
| **Vídeo da viagem** | Resumo da viagem → "Vídeo (em breve)" | `createTripVideo()` devolve `status: 'unavailable'` |

A IA **nunca bloqueia** o fluxo: se falhar, o usuário escreve a legenda e o resumo cai no template.

## Ligar um modelo real

Defina `EXPO_PUBLIC_AI_ENDPOINT=https://<seu-projeto>.supabase.co/functions/v1/ai` e implemente 3 rotas (JSON, `Authorization: Bearer <jwt do usuário>`). **A chave do modelo fica no servidor** (Edge Function), nunca no app.

```
POST /captions   { placeName?, cityName?, category?, mediaType: 'image'|'video', takenAt? }
              →  { suggestions: [{ tone: 'casual'|'funny'|'tourist'|'short', label, text }, ...4] }

POST /trip-summary { origin, destination?, distanceM, durationS, stopCount, momentCount }
              →  { summary: string }

POST /trip-video   { tripId }
              →  { status: 'queued'|'processing'|'ready'|'unavailable', jobId?, url?, reason? }
```

Sugestão de *prompts*:

- **Legenda:** "Escreva 4 legendas curtas em português do Brasil para uma foto em {place}, {city}, categoria {category}, às {hora}. Tons: casual, engraçada, turística, curta (≤ 40 caracteres). Sem hashtags. Não invente fatos sobre o lugar."
- **Resumo:** "Escreva 2 frases em terceira pessoa neutra (não use 'você') sobre uma viagem de {origin} a {destination}: {distância}, {tempo}, {paradas} paradas, {momentos} momentos. Tom caloroso, sem exageros."

Privacidade: envie ao modelo **só o necessário** (nome do lugar, categoria, números) — nunca coordenadas exatas, nem a foto, a menos que o usuário peça explicitamente a análise da imagem (e então avise na UI).

## Vídeo vertical automático (futuro)

`AiProvider.createTripVideo` já existe no contrato. Fluxo previsto: Edge Function enfileira um job → worker junta `trip_media` em ordem cronológica, com o mapa da rota → grava em `media/<user>/trip-<id>.mp4` → notificação "Seu vídeo está pronto". O app só precisa exibir o estado do job.
