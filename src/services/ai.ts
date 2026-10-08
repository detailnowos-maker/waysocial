/**
 * IA do WaySocial — contrato + implementação simulada.
 *
 * O MVP NÃO chama nenhum modelo. `MockAiProvider` gera textos por template (deterministas,
 * em pt-BR) para que a experiência exista de ponta a ponta. Para ligar um modelo real, implemente
 * `AiProvider` num servidor SEU (ex.: Supabase Edge Function — a chave do modelo nunca vai para o
 * aparelho) e aponte `EXPO_PUBLIC_AI_ENDPOINT` para ele. O contrato HTTP está em docs/AI.md.
 */
import { type TripFacts, tripSummaryText } from '@/domain/tripSummary';
import type { PlaceCategory } from '@/domain/types';
import { hashString } from '@/lib/random';

export type CaptionTone = 'casual' | 'funny' | 'tourist' | 'short';

export interface CaptionSuggestion {
  tone: CaptionTone;
  label: string;
  text: string;
}

export interface CaptionRequest {
  placeName?: string | null;
  cityName?: string | null;
  category?: PlaceCategory | null;
  mediaType: 'image' | 'video';
  /** Hora local da captura (para "bom dia", "fim de tarde"...). */
  takenAt?: Date;
}

export type TripVideoJob =
  | { status: 'unavailable'; reason: string }
  | { status: 'queued' | 'processing'; jobId: string }
  | { status: 'ready'; jobId: string; url: string };

export interface AiProvider {
  readonly name: string;
  suggestCaptions(req: CaptionRequest): Promise<CaptionSuggestion[]>;
  summarizeTrip(facts: TripFacts): Promise<string>;
  /** Futuro: montar um vídeo vertical curto com as fotos/vídeos da viagem. */
  createTripVideo(req: { tripId: string }): Promise<TripVideoJob>;
}

export const TONE_LABEL: Record<CaptionTone, string> = {
  casual: 'Casual',
  funny: 'Engraçada',
  tourist: 'Turística',
  short: 'Curta',
};

// --- Mock por template -------------------------------------------------------------------------

function periodOf(date: Date | undefined): 'manhã' | 'tarde' | 'noite' {
  const h = (date ?? new Date()).getHours();
  if (h < 12) return 'manhã';
  if (h < 18) return 'tarde';
  return 'noite';
}

type Pick3 = [string, string, string];

const CASUAL: Record<string, Pick3> = {
  beach: ['{p}: só vibe boa. 🌊', 'Mar, sol e nenhuma pressa em {p}.', 'Pé na areia em {p}. Era isso que eu precisava.'],
  viewpoint: ['A vista de {p} vale cada passo. 🌄', 'Parei pra respirar em {p}.', '{p} nunca decepciona.'],
  restaurant: ['Parada obrigatória: {p}. 😋', 'Almoço bom em {p}, dia ganho.', 'Comida boa e boa companhia em {p}.'],
  cafe: ['Café, calma e {p}. ☕', 'Meu cantinho em {p}.', 'Pausa merecida em {p}.'],
  bar: ['Noite boa em {p}. 🍻', 'Chope gelado e papo bom em {p}.', '{p} hoje tá animado.'],
  park: ['Respirando fundo em {p}. 🌿', 'Natureza pura em {p}.', 'Um respiro verde em {p}.'],
  landmark: ['{p}: um clássico que nunca perde a graça.', 'Passei por {p} e tive que parar.', 'Olha só {p} hoje.'],
  event: ['{p} tá pegando fogo! 🔥', 'Que energia em {p}!', 'Cheguei em {p} e já valeu.'],
  shop: ['Achados em {p}. 🛍️', 'Passeio por {p}.', 'Dica de {p}.'],
  city: ['Dia em {p}.', 'Explorando {p}.', '{p}, de novo e sempre.'],
  default: ['Momento especial por aqui.', 'Registrando o caminho.', 'Hoje foi assim.'],
};

const FUNNY: Pick3 = [
  'Disseram que seria uma passadinha rápida em {p}. Já faz horas. 😅',
  'Meu GPS: "você chegou". Eu: "não saio mais de {p}".',
  'Planejamento: zero. {p}: dez. 🤷',
];

const TOURIST: Pick3 = [
  'Descobrindo {p}, em {c}. Dica: vá sem pressa e aproveite cada detalhe.',
  '{p} é parada certa para quem visita {c}. Anote a dica!',
  'Um roteiro por {c} não está completo sem {p}.',
];

const SHORT: Pick3 = ['{p} ✨', '📍 {c}', 'Aqui. {p}.'];

function fill(template: string, p: string, c: string): string {
  return template.replaceAll('{p}', p).replaceAll('{c}', c);
}

export class MockAiProvider implements AiProvider {
  readonly name = 'mock';
  constructor(private readonly latencyMs = 700) {}

  private async wait() {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
  }

  async suggestCaptions(req: CaptionRequest): Promise<CaptionSuggestion[]> {
    await this.wait();
    const place = req.placeName?.trim() || '';
    const city = req.cityName?.trim() || place || 'por aqui';
    const p = place || 'este lugar';
    const key = hashString(`${place}|${city}|${req.mediaType}|${periodOf(req.takenAt)}`);
    const pick = (list: readonly string[], salt: number) => list[(key + salt) % list.length];

    const casualPool = place ? (CASUAL[req.category ?? ''] ?? CASUAL.default) : CASUAL.default;
    const period = periodOf(req.takenAt);
    const casual = fill(pick(casualPool, 1), p, city);
    const out: CaptionSuggestion[] = [
      { tone: 'casual', label: TONE_LABEL.casual, text: place && period === 'tarde' && req.category === 'beach' ? `${casual} Fim de tarde perfeito.` : casual },
      { tone: 'funny', label: TONE_LABEL.funny, text: fill(pick(FUNNY, 2), p, city) },
      { tone: 'tourist', label: TONE_LABEL.tourist, text: fill(pick(TOURIST, 3), p, city) },
      { tone: 'short', label: TONE_LABEL.short, text: fill(pick(SHORT, 4), p, city) },
    ];
    return out;
  }

  async summarizeTrip(facts: TripFacts): Promise<string> {
    await this.wait();
    return tripSummaryText(facts);
  }

  async createTripVideo(): Promise<TripVideoJob> {
    return { status: 'unavailable', reason: 'A geração de vídeo da viagem chega em uma versão futura.' };
  }
}

// --- HTTP (servidor seu) -----------------------------------------------------------------------

/**
 * Chama um endpoint seu (veja docs/AI.md). Qualquer falha cai no mock — a IA nunca
 * deve impedir alguém de publicar ou de finalizar uma viagem.
 */
export class HttpAiProvider implements AiProvider {
  readonly name = 'http';
  constructor(
    private readonly endpoint: string,
    private readonly fallback: AiProvider = new MockAiProvider(0),
    private readonly getToken?: () => Promise<string | null>,
  ) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    const token = await this.getToken?.();
    const res = await fetch(`${this.endpoint.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`AI endpoint ${res.status}`);
    return (await res.json()) as T;
  }

  async suggestCaptions(req: CaptionRequest): Promise<CaptionSuggestion[]> {
    try {
      const r = await this.post<{ suggestions: CaptionSuggestion[] }>('/captions', { ...req, takenAt: req.takenAt?.toISOString() });
      if (Array.isArray(r.suggestions) && r.suggestions.length > 0) return r.suggestions;
    } catch {
      // cai no fallback
    }
    return this.fallback.suggestCaptions(req);
  }

  async summarizeTrip(facts: TripFacts): Promise<string> {
    try {
      const r = await this.post<{ summary: string }>('/trip-summary', facts);
      if (typeof r.summary === 'string' && r.summary.trim()) return r.summary.trim();
    } catch {
      // cai no fallback
    }
    return this.fallback.summarizeTrip(facts);
  }

  async createTripVideo(req: { tripId: string }): Promise<TripVideoJob> {
    try {
      return await this.post<TripVideoJob>('/trip-video', req);
    } catch {
      return this.fallback.createTripVideo(req);
    }
  }
}
